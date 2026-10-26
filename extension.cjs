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
  const changeStore=new (require('./change-store.cjs').ChangeStore)(path.join(context.globalStorageUri.fsPath,'changes'));
  let turnSnapshot,finishing,changeTimer,changeQueue=Promise.resolve();
  let reportedChanges=new Set(),turnStartedAt;
  function publishChanges(summary){
    if(!summary)return;
    const entry=transcript.find(e=>e.role==='changes'&&JSON.parse(e.text).id===summary.id);
    if(entry){entry.text=JSON.stringify(summary);post({type:'changeUpdated',summary});persist();}
    else add('changes',JSON.stringify(summary));
  }
  function collectChanges(snapshot){
    changeQueue=changeQueue.then(async()=>{publishChanges(await changeStore.finish(snapshot,chatId,dirtyPaths()));}).catch(e=>add('notice','File change summary unavailable: '+e.message));
    return changeQueue;
  }
  const dirtyPaths=()=>vscode.workspace.textDocuments.filter(d=>d.isDirty&&d.uri.scheme==='file').map(d=>d.uri.fsPath);
  const diffTexts=new Map();
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('strata-change',{provideTextDocumentContent:uri=>diffTexts.get(uri.toString())||''}));
  async function finishTurn(){
    if(finishing)return finishing;
    clearTimeout(changeTimer);changeTimer=undefined;
    const snapshot=turnSnapshot;turnSnapshot=undefined;
    finishing=(async()=>{
      try{if(snapshot){post({type:'status',text:'Collecting file changes…'});await collectChanges(snapshot);
        const captured=transcript.filter(e=>e.role==='changes'&&JSON.parse(e.text).id===snapshot.id).flatMap(e=>JSON.parse(e.text).files.map(f=>f.path));
        const missing=[...reportedChanges].filter(p=>!captured.includes(p));
        if(missing.length)add('notice','Some reported file updates have no captured diff (outside the workspace, excluded, unchanged, or scan limits): '+missing.join(', '));
        else if(!snapshot.saved&&snapshot.partial)add('notice','No file diff captured. The workspace checkpoint reached its scan limits; open a smaller project folder for reliable change tracking.');}}
      catch(e){add('notice','File change summary unavailable: '+e.message);}
      finally{if(turnStartedAt!==undefined){add('turn-summary',JSON.stringify({durationMs:Math.max(0,Date.now()-turnStartedAt)}));turnStartedAt=undefined;}manualCompaction=false;contextFrame({type:'idle'});busy=false;post({type:'busy',value:false});post({type:'status',text:'Ready'});persist();}
    })();
    try{await finishing;}finally{finishing=undefined;}
  }
  async function changeAction(m){
    if(!vscode.workspace.isTrusted)throw Error('Trust the workspace first');
    if(!transcript.some(e=>e.role==='changes'&&JSON.parse(e.text).id===m.id))throw Error('Change summary not in this chat');
    const record=await changeStore.load(m.id,chatId);
    const root=vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if(!root||await fs.realpath(root)!==record.root)throw Error('Open the original workspace to review these changes');
    if(m.type==='viewChanges'){
      const file=typeof m.path==='string'?record.files.find(f=>f.path===m.path):await vscode.window.showQuickPick(record.files.map(f=>({label:f.path,file:f})),{title:'Changes during this turn'}).then(x=>x?.file);
      if(!file)return;
      const before=vscode.Uri.from({scheme:'strata-change',path:`/${record.id}/before/${file.path.replaceAll('\\','/')}`});
      const after=vscode.Uri.from({scheme:'strata-change',path:`/${record.id}/after/${file.path.replaceAll('\\','/')}`});
      diffTexts.set(before.toString(),file.before?.text||'');diffTexts.set(after.toString(),file.after?.text||'');
      await vscode.commands.executeCommand('vscode.diff',before,after,file.path+' · Turn changes');return;
    }
    if(busy||connecting)throw Error('Wait for the current operation before undoing changes');
    busy=true;post({type:'busy',value:true});
    try{
      await changeStore.validateUndo(record);
      const created=record.files.filter(f=>!f.before).length;
      const answer=await vscode.window.showWarningMessage(`Undo changes to ${record.files.length} files?`,{modal:true,detail:`Restore the saved contents from before this turn.${created?` This will delete ${created} files created during the turn.`:''} Changes made by other programs during the turn may also be included. Review the diffs first. Installs, services and Git history are not reverted.`},'Undo changes');
      if(answer!=='Undo changes')return;
      await changeStore.validateUndo(record);
      const edits=new vscode.WorkspaceEdit();
      for(const f of record.files){
        const uri=vscode.Uri.file(await changeStore.safePath(record.root,f.path));
        if(vscode.workspace.textDocuments.some(d=>d.uri.toString()===uri.toString()&&d.isDirty))throw Error(f.path+' has unsaved edits; save or discard them first');
        if(!f.before){edits.deleteFile(uri,{ignoreIfNotExists:false});continue;}
        const doc=await vscode.workspace.openTextDocument(uri);
        const stripBOM=t=>t.startsWith('\uFEFF')?t.slice(1):t;
        if(doc.getText()!==stripBOM(f.after.text))throw Error(f.path+' changed in the editor; review the diff instead');
        if(f.before.text.startsWith('\uFEFF')!==f.after.text.startsWith('\uFEFF'))throw Error('Encoding changes require manual restoration');
        edits.replace(uri,new vscode.Range(doc.positionAt(0),doc.positionAt(doc.getText().length)),stripBOM(f.before.text));
      }
      await changeStore.validateUndo(record);
      if(!await vscode.workspace.applyEdit(edits))throw Error('VS Code could not apply every undo edit. Review the workspace before retrying.');
      const summary=await changeStore.markUndone(record);
      const item=transcript.find(e=>e.role==='changes'&&JSON.parse(e.text).id===record.id);if(item)item.text=JSON.stringify(summary);
      post({type:'changeUpdated',summary});await saveChat();
      vscode.window.showInformationMessage('Changes undone. Restored text is open as unsaved editor edits; review and save it.');
    }finally{busy=false;post({type:'busy',value:false});}
  }
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
  async function deleteChat(id){
    if(busy)throw Error('Stop the current turn before deleting chats');
    const item=store.list().find(c=>c.id===id);if(!item)throw Error('Chat not found');
    const answer=await vscode.window.showWarningMessage(`Delete “${item.title}” from saved chats?`,{modal:true,detail:'This removes the saved chat and transcript from this workspace. Project files are not deleted. Local change snapshots and harness session logs may remain on the host.'},'Delete');
    if(answer!=='Delete')return;
    if(busy)throw Error('Stop the current turn before deleting chats');
    busy=true;post({type:'busy',value:true});
    try{
      const active=id===chatId;
      if(active){clearTimeout(timer);timer=undefined;}
      await store.remove(id);
      if(active){
        chatId=randomUUID();transcript=[];contextInfo={compacting:false};permissionMode='manual';pending.clear();
        await context.workspaceState.update('activeChat',chatId);
        // Remove legacy migration inputs so deleted transcripts cannot return after reload.
        for(const key of ['chatId','transcript','contextInfo'])await context.workspaceState.update(key,undefined);
        post({type:'restore',transcript,busy:false,mode:permissionMode});post({type:'contextInfo',...contextInfo});post({type:'status',text:'Ready'});
      }
      chatMetadata();post({type:'page',page:'chats'});
    }finally{busy=false;post({type:'busy',value:false});}
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
    if (m.type === 'idle'&&m.chatId===chatId) {void finishTurn();return;}
    if (m.type !== 'frame' || m.chatId !== chatId) return;
    const f = m.frame;
    if(f.type==='deliverable'&&turnSnapshot){
      if(typeof f.path==='string')reportedChanges.add(f.path);
      if(!changeTimer){const snapshot=turnSnapshot;changeTimer=setTimeout(()=>{if(turnSnapshot===snapshot)void collectChanges(snapshot).finally(()=>{changeTimer=undefined;});else changeTimer=undefined;},1000);}
    }
    if(f.type==='status'&&f.manual===true)manualCompaction=true;
    contextFrame(f);
    if(f.noteReason==='compacted'){add('compaction',manualCompaction?'Context compacted':'Context automatically compacted');return;}
    if(['done','error'].includes(f.type))manualCompaction=false;
    if(f.type==='reasoning'){
      if(transcript.at(-1)?.role!=='reasoning')add('reasoning','');
      return; // Display a status marker only; the harness retains its own model context.
    }
    if (f.type === 'delta') {
      const role = f.type === 'delta' ? 'assistant' : 'reasoning';
      const text = String(f.text || '');
      if (transcript.at(-1)?.role !== role || transcript.at(-1).text.length > 64000) add(role, '');
      transcript.at(-1).text += text;
      post({type: 'chunk', role, text}); persist();
    } else if (f.type === 'agent-tool') {
      const t = f.tool;
      if (!t) return;
      if (t.state === 'proposed') pending.set(t.id, t); else pending.delete(t.id);
      const first=transcript.findLastIndex(e=>e.role==='user');
      const savedTool=transcript.slice(first+1).find(e=>e.role==='tool'&&JSON.parse(e.text).id===t.id);
      const previousTool=savedTool?JSON.parse(savedTool.text):{};
      if(Number.isFinite(previousTool.commandStartedAt))t.commandStartedAt=previousTool.commandStartedAt;
      if(['bash','pwsh','shell','exec_command'].includes(t.name)&&t.state==='running'&&!Number.isFinite(t.commandStartedAt))t.commandStartedAt=Date.now();
      if(Number.isFinite(previousTool.commandDurationMs))t.commandDurationMs=previousTool.commandDurationMs;
      if(Number.isFinite(t.commandStartedAt)&&['done','error','denied'].includes(t.state)&&!Number.isFinite(t.commandDurationMs))t.commandDurationMs=Math.max(0,Date.now()-t.commandStartedAt);
      const toolText=JSON.stringify({...t,result:t.result?String(t.result).slice(0,16000):undefined});
      if(savedTool)savedTool.text=toolText;else transcript.push({role:'tool',text:toolText,timestamp:Date.now()});
      persist();post({type: 'tool', tool: t});
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
        if (child === p) {child = undefined; ready = undefined; pending.clear(); if (!closing) add('error', 'Harness stopped. Send a message to reconnect.');void finishTurn();}
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
      if (m.type === 'loaded') {await getConnection();connectionInfo();modelInfo();persist();chatMetadata();post({type:'page',page:transcript.length?'chat':'chats'});post({type:'restore',transcript,busy,turnStartedAt,mode:permissionMode}); post({type:'contextInfo',...contextInfo}); for (const tool of pending.values()) post({type:'tool',tool});if(!offeredSetup&&!savedConnection()){offeredSetup=true;await connect();}}
      else if (m.type === 'profiles') await chooseProfile();
      else if(m.type==='openToolFile'){
        if(typeof m.id!=='string')throw Error('Invalid file action');
        const tool=transcript.filter(e=>e.role==='tool').map(e=>JSON.parse(e.text)).findLast(t=>t.id===m.id);
        const file=tool?.args?.file_path??tool?.args?.path;
        if(typeof file!=='string'||!file||file.includes('\0'))throw Error('No file path recorded for this action');
        const root=vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;if(!root)throw Error('Open the original workspace first');
        const uri=vscode.Uri.file(path.resolve(root,file));
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri),{preview:true});
      }
      else if(m.type==='viewChanges'||m.type==='undoChanges')await changeAction(m);
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
      else if (m.type === 'deleteChat') {if(typeof m.id!=='string')throw Error('Invalid chat');await deleteChat(m.id);}
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
        try {await start();if(images.length&&!runtimeVision)throw Error('Restart the harness to apply the Vision setting, then resend.');
          reportedChanges=new Set();
          if(m.text.trim()!=='/compact'){post({type:'status',text:'Saving workspace checkpoint…'});try{turnSnapshot=await changeStore.scan(vscode.workspace.workspaceFolders[0].uri.fsPath,dirtyPaths());}catch(e){add('notice','Undo checkpoint unavailable: '+e.message);}}
          add('user',m.text+(images.length?'\n\nAttached images: '+images.map(i=>i.name).join(', '):'')); turnStartedAt=Date.now();post({type:'turnStarted',startedAt:turnStartedAt});write({type:'send',chatId,text:transcript.some(e=>e.role==='changes'&&JSON.parse(e.text).undone)&&m.text.trim()!=='/compact'?'Workspace note: Earlier file changes in this chat were undone. Re-read current files; restored editor text may still be unsaved.\n\n'+m.text:m.text,mode:m.mode,images});post({type:'sendAccepted',attachmentIds:m.attachmentIds,text:m.draftText});}
        catch (e) {turnStartedAt=undefined;turnSnapshot=undefined;busy=false;post({type:'busy',value:false});throw e;}
      } else if (m.type === 'stop') {write({type:'stop',chatId}); post({type:'status',text:'Stopping…'});}
      else if (m.type === 'approve') {
        if (!pending.has(m.callId) || !['approve','deny'].includes(m.decision)) throw Error('Approval is no longer pending');
        write({type:'approve',chatId,callId:m.callId,decision:m.decision});
      }
    }), undefined, context.subscriptions);
  }}));
}
module.exports = {activate, deactivate: () => shutdown?.()};
