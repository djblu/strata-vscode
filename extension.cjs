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
  let runtimeVision=false;
  let view, child, ready, busy = false, closing = false;
  const store=new (require('./chat-store.cjs').ChatStore)(context.workspaceState);
  let chatId = context.workspaceState.get('activeChat') || context.workspaceState.get('chatId') || randomUUID();
  const saved=store.load(chatId);
  const validMode=value=>['manual','plan','bypass'].includes(value);
  let permissionMode=validMode(saved?.mode)?saved.mode:'manual';
  let contextInfo = {...(saved?.contextInfo || context.workspaceState.get('contextInfo', {})), compacting:false};
  function contextFrame(f) {const next=updateContext(contextInfo,f);if(next.used===contextInfo.used&&next.max===contextInfo.max&&next.compacting===contextInfo.compacting)return;contextInfo=next;post({type:'contextInfo',...contextInfo});persist();}
  let transcript = saved?.transcript || context.workspaceState.get('transcript') || [];
  let timer;
  let manualCompaction=false;
  const pending = new Map();
  const output = vscode.window.createOutputChannel('Strata Harness');
  context.subscriptions.push(output);
  const post = m => view?.webview.postMessage(m);
  const connections=new (require('./saved-connections.cjs').SavedConnections)(context.secrets);
  let connectionCache;
  const savedConnection=()=>connectionCache;
  function modelInfo(){const cfg=vscode.workspace.getConfiguration('strata');post({type:'modelInfo',model:savedConnection()?.model||cfg.get('model')||'Connect to Strata',thinking:cfg.get('thinking')});}
  let connecting=false,offeredSetup=false;
  function connectionInfo(){const c=savedConnection();post({type:'connectionInfo',text:c?`${c.name||c.model} · ${c.baseURL}`:'Not connected',connected:!!c});}
  async function getConnection(){
    const selected=context.workspaceState.get('connectionId');
    let p=await connections.get(selected);
    if(selected&&!p)throw Error('Saved connection no longer exists. Use Switch saved connection.');
    if(!p){
      // Migrate the earlier per-host configuration into client-side SecretStorage.
      let old=context.globalState.get('connection');const key=await context.secrets.get('strata.apiKey');
      if(!old&&key){const {usable,legacy}=require('./runtime-setup.cjs');if(await usable(legacy)){const cfg=vscode.workspace.getConfiguration('strata');old={baseURL:cfg.get('baseURL')||'http://10.70.70.24:8081/v1',model:cfg.get('model')||'swift-1.5-q4_k_m',contextWindow:cfg.get('contextWindow')||262144};}}
      if(old&&key!==undefined)p=await connections.save({...old,name:'Strata — '+old.model,apiKey:key});
    }
    connectionCache=p?require('./profile-connection.cjs').validateProfile(p).connection:undefined;
    return connectionCache;
  }
  async function runtime(){
    const cfg=vscode.workspace.getConfiguration('strata');
    return vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Strata runtime',cancellable:false},async progress=>{
      const overrides=Object.fromEntries(['sourcePath','nodePath','harnessPath'].map(k=>[k,cfg.get(k)||'']));
      return require('./runtime-setup.cjs').ensureRuntime(context.globalStorageUri.fsPath,overrides,message=>progress.report({message}));
    });
  }
  async function stopForConnection(){
    if(!child)return;const p=child;await shutdown();
    await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Previous harness is still stopping. Try connecting again.')),30000);p.once('exit',()=>{clearTimeout(t);resolve();});if(p.exitCode!==null){clearTimeout(t);resolve();}});
  }
  async function resolveProfile(id){
    const p=await connections.get(id);if(!p)throw Error('Saved connection no longer exists. Use Switch saved connection.');
    return require('./profile-connection.cjs').validateProfile(p);
  }
  async function chooseProfile(){
    if(busy||connecting)throw Error('Finish the current operation before switching connections');
    const data=await connections.read();
    const item=await vscode.window.showQuickPick([...data.profiles.map(p=>({label:p.name,description:p.model,detail:p.baseURL,id:p.id})),{label:'$(add) Add another connection…',add:true}],{title:'Switch saved Strata connection'});
    if(!item)return;if(item.add){await connect(true);return;}
    connecting=true;
    try{
      const {connection,apiKey}=await resolveProfile(item.id);
      const models=await require('./connection.cjs').listModels(connection.baseURL,apiKey);
      if(!models.some(m=>m.id===connection.model))throw Error('The server does not list model '+connection.model);
      await runtime();await stopForConnection();await connections.select(item.id);
      await context.workspaceState.update('connectionId',item.id);connectionCache=connection;
      connectionInfo();modelInfo();
    }finally{connecting=false;}
  }
  async function connect(addNew=false){
    if(connecting)return;if(busy)throw Error('Finish or stop the current turn before changing connection');
    if(!vscode.workspace.isTrusted)throw Error('Trust the workspace before setting up Strata');
    connecting=true;
    try{
      const {normalizeAddress,listModels}=require('./connection.cjs');const old=addNew?undefined:await getConnection();
      const address=await vscode.window.showInputBox({title:'Connect to Strata · 1 of 4',prompt:'Model API address, reached from this extension host (include the port)',placeHolder:'http://10.70.70.24:8081',value:old?.baseURL||'',ignoreFocusOut:true,validateInput:value=>{try{normalizeAddress(value);}catch(e){return e.message;}}});if(address===undefined)return;
      const baseURL=normalizeAddress(address);
      const existing=old?.baseURL===baseURL?(await resolveProfile(old.profileId)).apiKey:undefined;
      const entered=await vscode.window.showInputBox({title:'Connect to Strata · 2 of 4',prompt:existing?'API key (leave blank to keep the saved key)':'API key (leave blank only for a server without authentication)',password:true,ignoreFocusOut:true});if(entered===undefined)return;
      const key=entered.trim()||existing||'';
      const models=await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Testing Strata connection'},()=>listModels(baseURL,key));
      const chosen=await vscode.window.showQuickPick(models.map(m=>({label:m.id,description:m.id===old?.model?'Current model':undefined})),{title:'Connect to Strata · 3 of 4',placeHolder:'Select a model'});if(!chosen)return;
      const limit=await vscode.window.showInputBox({title:'Connect to Strata · 4 of 4',prompt:'Context window configured on the inference server (tokens)',value:String(old?.contextWindow||32768),ignoreFocusOut:true,validateInput:value=>!/^\d+$/.test(value)||Number(value)<4096||Number(value)>2097152?'Enter a whole number from 4096 to 2097152':undefined});if(limit===undefined)return;
      await runtime();
      // Finish the previous idle process before committing a new route.
      await stopForConnection();
      const saved=await connections.save({id:old?.profileId,name:'Strata — '+chosen.label,baseURL,model:chosen.label,contextWindow:Number(limit),apiKey:key});
      await context.workspaceState.update('connectionId',saved.id);
      connectionCache=require('./profile-connection.cjs').validateProfile(saved).connection;
      connectionInfo();modelInfo();vscode.window.showInformationMessage('Connected to Strata. Your next message will use '+chosen.label+'.');
    }finally{connecting=false;}
  }

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e=>{if(e.affectsConfiguration('strata'))modelInfo();}));
  function chatMetadata() {post({type:'chatMetadata',activeId:chatId,chats:store.list()});}
  async function saveChat() {await store.save({id:chatId,transcript,contextInfo,mode:permissionMode});chatMetadata();}
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
      permissionMode=validMode(target?.mode)?target.mode:'manual';
      chatId=target?.id||randomUUID();transcript=target?.transcript||[];contextInfo={...target?.contextInfo,compacting:false};pending.clear();
      await saveChat();post({type:'restore',transcript,busy:false,mode:permissionMode});post({type:'contextInfo',...contextInfo});post({type:'status',text:'Ready'});post({type:'page',page:'chat'});
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
    if(m.type==='permissionMode'&&m.chatId===chatId&&validMode(m.mode)){permissionMode=m.mode;post({type:'permissionMode',mode:permissionMode});persist();return;}
    if (m.type === 'error') { contextFrame(m); add('error', m.text); return; }
    if (m.type === 'idle') { manualCompaction=false;contextFrame(m); busy = false; post({type: 'busy', value: false}); persist(); return; }
    if (m.type !== 'frame' || m.chatId !== chatId) return;
    const f = m.frame;
    if(f.type==='status'&&f.manual===true)manualCompaction=true;
    contextFrame(f);
    if(f.noteReason==='compacted'){add('compaction',manualCompaction?'Context compacted':'Context automatically compacted');return;}
    if(['done','error'].includes(f.type))manualCompaction=false;
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
    else if (f.type === 'status') post({type: 'status', text: f.text || 'Ready', manualCompaction:f.manual===true});
    else if (f.type === 'context') { /* Displayed in the composer, independently of turn status. */ }
    else if (f.type === 'notice') add('notice', f.text || f.message || 'Harness notice');
    else if (f.type === 'start') {if(validMode(f.mode)){permissionMode=f.mode;post({type:'permissionMode',mode:permissionMode});persist();}post({type: 'status', text: `Running · ${f.model || 'Strata'}`});}
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
    const config = Object.fromEntries(['sourcePath','nodePath','harnessPath','baseURL','model','contextWindow','thinking','vision'].map(k => [k, cfg.get(k)]));
    const connection=await getConnection();if(!connection)throw Error('Use Connect to Strata in the settings menu first');
    const localProfile=connection.profileId?await resolveProfile(connection.profileId):undefined;
    if(localProfile){connectionCache=localProfile.connection;connectionInfo();modelInfo();}
    Object.assign(config,localProfile?.connection||connection,await runtime());
    config.workspace = folders[0].uri.fsPath;
    config.apiKey = localProfile?localProfile.apiKey:await context.secrets.get('strata.apiKey')||'';
    config.dataDir = path.join(context.globalStorageUri.fsPath, createHash('sha256').update(config.workspace).digest('hex').slice(0, 24));
    runtimeVision=config.vision===true;
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
  context.subscriptions.push(vscode.commands.registerCommand('strata.connect',safe(()=>connect())));
  context.subscriptions.push(vscode.commands.registerCommand('strata.setApiKey',safe(()=>connect())));
  context.subscriptions.push(vscode.commands.registerCommand('strata.switchConnection',safe(chooseProfile)));
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
      if (m.type === 'loaded') {await getConnection();connectionInfo();modelInfo();persist();chatMetadata();post({type:'page',page:transcript.length?'chat':'chats'});post({type:'restore',transcript,busy,mode:permissionMode}); post({type:'contextInfo',...contextInfo}); for (const tool of pending.values()) post({type:'tool',tool});if(!offeredSetup&&!savedConnection()){offeredSetup=true;await connect();}}
      else if (m.type === 'profiles') await chooseProfile();
      else if (m.type === 'connect') await connect();
      else if (m.type === 'openLink') {
        const url=externalURL(m.url);if(!url) throw Error('Only HTTP and HTTPS links can be opened');
        await vscode.env.openExternal(vscode.Uri.parse(url));
      }
      else if (m.type === 'copyCode') {
        if (typeof m.text !== 'string' || m.text.length > 1000000 || typeof m.id !== 'number') throw Error('Invalid clipboard request');
        try {await vscode.env.clipboard.writeText(m.text); post({type:'copied',id:m.id});}
        catch {post({type:'copied',id:m.id,error:true});}
      }
      else if (m.type === 'add-context') await vscode.commands.executeCommand('strata.addSelection');
      else if (m.type === 'add-files' || m.type === 'add-git') {
        const root=vscode.workspace.workspaceFolders?.[0]?.uri;
        if(!root||root.scheme!=='file')throw Error('Open a filesystem workspace first');
        const originalChat=chatId;
        const {workspaceReferences,gitChanges}=require('./context-attachments.cjs');
        let text;
        if(m.type==='add-files'){
          const kind=await vscode.window.showQuickPick(['Files','Folders'],{title:'Add workspace context'});if(!kind)return;
          const selected=await vscode.window.showOpenDialog({defaultUri:root,canSelectFiles:kind==='Files',canSelectFolders:kind==='Folders',canSelectMany:true,openLabel:'Add context'});
          if(!selected?.length)return;
          if(selected.some(uri=>uri.scheme!=='file'))throw Error('Choose filesystem paths');
          const attachments=[];for(const uri of selected){const reference=await workspaceReferences(root.fsPath,[uri.fsPath]);attachments.push({name:vscode.workspace.asRelativePath(uri),text:reference});}
          if(chatId!==originalChat)throw Error('Chat changed while adding context; add it again to the intended draft');
          for(const attachment of attachments)post({type:'attachment',attachment});
          return;
        }else text=await gitChanges(root.fsPath);
        if(chatId!==originalChat)throw Error('Chat changed while adding context; add it again to the intended draft');
        post({type:'selection',text});
      }
      else if (m.type === 'model-settings') await vscode.commands.executeCommand('workbench.action.openSettings','@ext:djblu.strata-harness');
      else if (m.type === 'changes') await vscode.commands.executeCommand('workbench.view.scm');
      else if (m.type === 'key') await vscode.commands.executeCommand('strata.setApiKey');
      else if (m.type === 'new') await switchChat();
      else if (m.type === 'chats') await chooseChat();
      else if (m.type === 'openChat') {if(typeof m.id!=='string'||!store.list().some(c=>c.id===m.id))throw Error('Chat not found');await switchChat(m.id);}
      else if (m.type === 'rename') await renameChat();
      else if (m.type === 'permissionMode') {
        if(!validMode(m.mode))throw Error('Invalid permission mode');
        if(busy){await start();write({type:'setMode',chatId,mode:m.mode});return;}
        permissionMode=m.mode;await saveChat();post({type:'permissionMode',mode:permissionMode});
      }
      else if (m.type === 'send') {
        if (busy) return;
        if(connecting)throw Error('Finish connection setup before sending a message');
        if (typeof m.text !== 'string' || !m.text.trim() || m.text.length > 1000000 || !['manual','plan','bypass'].includes(m.mode)) throw Error('Invalid message');
        const images=require('./image-attachments.cjs').validateImages(m.images);
        if(images.length&&!vscode.workspace.getConfiguration('strata').get('vision'))throw Error('Images require a vision-capable model. Enable Strata: Vision in settings for a compatible endpoint, then restart the harness.');
        if(images.length&&/^\/compact(?:\s|$)/.test(m.text.trim()))throw Error('Remove images before compacting context.');
        permissionMode=m.mode;
        busy = true; post({type:'busy',value:true});
        try {await start();if(images.length&&!runtimeVision)throw Error('Restart the harness to apply the Vision setting, then resend.'); add('user',m.text+(images.length?'\n\nAttached images: '+images.map(i=>i.name).join(', '):'')); write({type:'send',chatId,text:m.text,mode:m.mode,images});post({type:'sendAccepted',attachmentIds:m.attachmentIds,text:m.draftText});}
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
