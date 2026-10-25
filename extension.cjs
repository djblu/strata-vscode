'use strict';
const vscode = require('vscode');
const {spawn} = require('node:child_process');
const {createInterface} = require('node:readline');
const {randomUUID, createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
let shutdown;
const {updateContext,externalURL}=require('./context-state.cjs');
function activate(context) {
  let view, child, ready, busy = false, closing = false;
  const store=new (require('./chat-store.cjs').ChatStore)(context.workspaceState);
  let chatId = context.workspaceState.get('activeChat') || context.workspaceState.get('chatId') || randomUUID();
  const saved=store.load(chatId);
  let contextInfo = {...(saved?.contextInfo || context.workspaceState.get('contextInfo', {})), compacting:false};
  function contextFrame(f) {const next=updateContext(contextInfo,f);if(next.used===contextInfo.used&&next.max===contextInfo.max&&next.compacting===contextInfo.compacting)return;contextInfo=next;post({type:'contextInfo',...contextInfo});persist();}
  let transcript = saved?.transcript || context.workspaceState.get('transcript') || [];
  let timer;
  const pending = new Map();
  const output = vscode.window.createOutputChannel('Strata Harness');
  context.subscriptions.push(output);
  const post = m => view?.webview.postMessage(m);
  function chatMetadata() {post({type:'chatMetadata',activeId:chatId,chats:store.list()});}
  async function saveChat() {await store.save({id:chatId,transcript,contextInfo});chatMetadata();}
  function persist() {
    if(timer)return;
    timer=setTimeout(()=>{timer=undefined;saveChat().catch(e=>vscode.window.showErrorMessage(`Strata could not save chat: ${e.message}`));},1000);
  }
  async function switchChat(id) {
    if(busy)throw Error('Stop the current turn before switching chats');
    busy=true;post({type:'busy',value:true});
    try {
      clearTimeout(timer);timer=undefined;await saveChat();
      const target=id?store.load(id):null;if(id&&!target)throw Error('Chat not found');
      chatId=target?.id||randomUUID();transcript=target?.transcript||[];contextInfo={...target?.contextInfo,compacting:false};pending.clear();
      await saveChat();post({type:'restore',transcript,busy:false});post({type:'contextInfo',...contextInfo});post({type:'status',text:'Ready'});post({type:'page',page:'chat'});
    } finally {busy=false;post({type:'busy',value:false});}
  }
  async function chooseChat() {
    if(busy)throw Error('Stop the current turn before switching chats');
    await saveChat();post({type:'page',page:'chats'});
  }
  async function renameChat() {
    if(busy)throw Error('Wait for the current turn to finish before renaming');
    await saveChat();const id=chatId;
    const name=await vscode.window.showInputBox({title:'Rename chat',value:store.list().find(item=>item.id===id)?.title,validateInput:value=>!value.trim()?'Enter a title':value.length>120?'Use 120 characters or fewer':undefined});
    if(name?.trim()){await store.rename(id,name.trim());chatMetadata();}
  }
  function add(role, text) {
    const timestamp=Date.now();
    transcript.push({role, text, timestamp});
    // UI transcript is bounded; the full durable conversation remains in the harness.
    while (transcript.length > 100 || (transcript.length > 1 && transcript.reduce((n, x) => n + x.text.length, 0) > 250000)) transcript.shift();
    post({type: 'entry', role, text, timestamp}); persist();
  }
  function receive(m) {
    if (m.type === 'ready') return;
    if (m.type === 'error') { contextFrame(m); add('error', m.text); return; }
    if (m.type === 'idle') { contextFrame(m); busy = false; post({type: 'busy', value: false}); persist(); return; }
    if (m.type !== 'frame' || m.chatId !== chatId) return;
    const f = m.frame;
    contextFrame(f);
    if (f.type === 'delta' || f.type === 'reasoning') {
      const role = f.type === 'delta' ? 'assistant' : 'reasoning';
      const text = String(f.text || '');
      if (transcript.at(-1)?.role !== role || transcript.at(-1).text.length > 64000) add(role, '');
      transcript.at(-1).text += text;
      post({type: 'chunk', role, text}); persist();
    } else if (f.type === 'agent-tool') {
      const t = f.tool;
      if (!t) return;
      if (t.state === 'proposed') pending.set(t.id, t); else pending.delete(t.id);
      post({type: 'tool', tool: t});
    } else if (f.type === 'error') add('error', f.message || f.text || JSON.stringify(f));
    else if (f.type === 'status') post({type: 'status', text: f.text || 'Ready'});
    else if (f.type === 'context') { /* Displayed in the composer, independently of turn status. */ }
    else if (f.type === 'notice') add('notice', f.text || f.message || 'Harness notice');
    else if (f.type === 'start') post({type: 'status', text: `Running · ${f.model || 'Strata'}`});
    else if (f.type === 'done') post({type: 'status', text: `Finished · ${f.tokensIn ?? '?'} input / ${f.tokensOut ?? '?'} output tokens`});
  }
  function write(m) {
    if (!child?.stdin.writable) throw Error('Harness is not running');
    child.stdin.write(JSON.stringify(m) + '\n');
  }
  async function start() {
    if (closing && child) throw Error('Harness is still stopping; try again shortly');
    if (ready) return ready;
    if (!vscode.workspace.isTrusted) throw Error('Trust the workspace before using the harness');
    const folders = vscode.workspace.workspaceFolders;
    if (folders?.length !== 1 || folders[0].uri.scheme !== 'file') throw Error('Open one filesystem folder (Remote SSH is supported)');
    const cfg = vscode.workspace.getConfiguration('strata');
    const config = Object.fromEntries(['sourcePath','nodePath','harnessPath','baseURL','model','contextWindow','thinking'].map(k => [k, cfg.get(k)]));
    config.workspace = folders[0].uri.fsPath;
    config.apiKey = await context.secrets.get('strata.apiKey') || '';
    config.dataDir = path.join(context.globalStorageUri.fsPath, createHash('sha256').update(config.workspace).digest('hex').slice(0, 24));
    await fs.mkdir(config.dataDir, {recursive: true, mode: 0o700});
    const p = spawn(config.nodePath, [path.join(context.extensionPath, 'adapter.mjs')], {cwd: config.workspace, stdio: ['pipe','pipe','pipe']});
    child = p; closing = false;
    ready = new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => { reject(Error('Adapter startup timed out')); p.kill(); }, 30000);
      const lines = createInterface({input: p.stdout});
      lines.on('line', line => {
        let m; try { m = JSON.parse(line); } catch { return; }
        if (!settled && (m.type === 'ready' || m.type === 'error')) {
          settled = true; clearTimeout(timeout);
          if (m.type === 'ready') resolve(); else { reject(Error(m.text)); p.kill(); }
        } else receive(m);
      });
      p.stderr.on('data', data => output.append(String(data).split(config.apiKey || '\0').join('[redacted]')));
      p.on('error', e => {clearTimeout(timeout); reject(e);});
      p.on('exit', () => {
        clearTimeout(timeout); reject(Error('Adapter exited'));
        if (child === p) {child = undefined; ready = undefined; busy = false; pending.clear(); post({type:'busy',value:false}); if (!closing) add('error', 'Harness stopped. Send a message to reconnect.');}
      });
      p.stdin.on('error', () => {});
      p.stdin.write(JSON.stringify({type: 'init', config}) + '\n');
    });
    return ready;
  }
  shutdown = async () => {
    closing = true;
    if (child) { const p = child; write({type: 'close'}); setTimeout(() => {if (p.exitCode === null) p.kill('SIGTERM');}, 25000).unref(); }
    clearTimeout(timer);
    timer=undefined;await saveChat();
  };
  const safe = fn => async (...args) => {try {await fn(...args);} catch(e) {vscode.window.showErrorMessage(`Strata: ${e.message}`);}};
  context.subscriptions.push(vscode.commands.registerCommand('strata.setApiKey', safe(async () => {
    const key = await vscode.window.showInputBox({title: 'Strata API key', password: true, ignoreFocusOut: true, prompt: 'Stored in VS Code SecretStorage. Restart the harness after changing this.'});
    if (key !== undefined) await context.secrets.store('strata.apiKey', key.trim());
  })));
  context.subscriptions.push(vscode.commands.registerCommand('strata.restart', safe(async () => {await shutdown(); vscode.window.showInformationMessage('Harness is stopping. Your next message will reconnect once it exits.');})));
  context.subscriptions.push(vscode.commands.registerCommand('strata.addSelection', safe(async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) throw Error('Select some text in an editor first');
    const selected = editor.document.getText(editor.selection);
    if (selected.length > 100000) throw Error('Selection exceeds 100,000 characters');
    await vscode.commands.executeCommand('strata.chat.focus');
    post({type: 'selection', text: `\nSelected context from ${vscode.workspace.asRelativePath(editor.document.uri)}:${editor.selection.start.line + 1}\n\`\`\`\n${selected}\n\`\`\`\n`});
  })));
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('strata.chat', {resolveWebviewView(v) {
    view = v; v.webview.options = {enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]};
    const nonce = randomUUID().replaceAll('-', '');
    const script = v.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'chat.js'));
    v.webview.html = require('./ui.cjs')({nonce, script,
      highlight: v.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'code-blocks.js')),
      style: v.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'chat.css')),
      source: v.webview.cspSource});
    v.webview.onDidReceiveMessage(safe(async m => {
      if (m.type === 'loaded') {persist();chatMetadata();post({type:'page',page:transcript.length?'chat':'chats'});post({type:'restore',transcript,busy}); post({type:'contextInfo',...contextInfo}); for (const tool of pending.values()) post({type:'tool',tool});}
      else if (m.type === 'openLink') {
        const url=externalURL(m.url);if(!url) throw Error('Only HTTP and HTTPS links can be opened');
        await vscode.env.openExternal(vscode.Uri.parse(url));
      }
      else if (m.type === 'copyCode') {
        if (typeof m.text !== 'string' || m.text.length > 1000000 || typeof m.id !== 'number') throw Error('Invalid clipboard request');
        try {await vscode.env.clipboard.writeText(m.text); post({type:'copied',id:m.id});}
        catch {post({type:'copied',id:m.id,error:true});}
      }
      else if (m.type === 'changes') await vscode.commands.executeCommand('workbench.view.scm');
      else if (m.type === 'key') await vscode.commands.executeCommand('strata.setApiKey');
      else if (m.type === 'new') await switchChat();
      else if (m.type === 'chats') await chooseChat();
      else if (m.type === 'openChat') {if(typeof m.id!=='string'||!store.list().some(c=>c.id===m.id))throw Error('Chat not found');await switchChat(m.id);}
      else if (m.type === 'rename') await renameChat();
      else if (m.type === 'send') {
        if (busy) return;
        if (typeof m.text !== 'string' || !m.text.trim() || m.text.length > 1000000 || !['manual','plan','bypass'].includes(m.mode)) throw Error('Invalid message');
        busy = true; post({type:'busy',value:true});
        try {await start(); add('user',m.text); write({type:'send',chatId,text:m.text,mode:m.mode});}
        catch (e) {busy=false;post({type:'busy',value:false});throw e;}
      } else if (m.type === 'stop') {write({type:'stop',chatId}); post({type:'status',text:'Stopping…'});}
      else if (m.type === 'approve') {
        if (!pending.has(m.callId) || !['approve','deny'].includes(m.decision)) throw Error('Approval is no longer pending');
        write({type:'approve',chatId,callId:m.callId,decision:m.decision});
      }
    }), undefined, context.subscriptions);
  }}));
}
module.exports = {activate, deactivate: () => shutdown?.()};
