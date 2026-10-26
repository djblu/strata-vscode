'use strict';
const vscode = acquireVsCodeApi();
const $ = id => document.getElementById(id);
const history = $('history'), cards = new Map();
let attachments=[],attachmentId=0;
function drawAttachments(){const area=$('attachments');area.replaceChildren();area.hidden=!attachments.length;for(const a of attachments){
 const card=document.createElement('div');card.className='attachment-card';
 if(a.url){const img=document.createElement('img');img.src=a.url;img.alt=a.name;card.append(img);}else{const icon=document.createElement('div');icon.className='attachment-file';icon.textContent='▱';card.append(icon);}
 const label=document.createElement('div');label.className='attachment-name';label.textContent=a.name;label.title=a.name;
 const remove=document.createElement('button');remove.className='attachment-remove';remove.textContent='×';remove.title='Remove '+a.name;remove.setAttribute('aria-label',remove.title);remove.onclick=()=>{attachments=attachments.filter(x=>x.id!==a.id);drawAttachments();};card.append(label,remove);area.append(card);
}}
function addAttachment(a){if(attachments.length>=20){$('status').textContent='Attach up to 20 items per message.';return;}attachments.push({...a,id:++attachmentId});drawAttachments();}
let imageReads=Promise.resolve();
function addImages(files){imageReads=imageReads.then(async()=>{for(const file of files){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){$('status').textContent='Use PNG, JPEG or WebP images up to 5 MB each.';continue;}
 if(attachments.filter(a=>a.url).length>=4||attachments.reduce((n,a)=>n+(a.size||0),0)+file.size>16*1024*1024){$('status').textContent='Image limit: four images, 16 MB total.';continue;}
 const chat=activeChat;const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
 if(chat===activeChat)addAttachment({name:file.name||'Screenshot.png',url,size:file.size});
 }}).catch(()=>{$('status').textContent='Could not read the image.';});}
$('image-picker').onchange=()=>{addImages(Array.from($('image-picker').files));$('image-picker').value='';};
$('prompt').addEventListener('paste',event=>{const files=Array.from(event.clipboardData?.items||[]).filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);if(files.length){event.preventDefault();addImages(files);}});
let last, buffer = '', bufferRole, scheduled, working = false, follow = true;
let page='chat',chatItems=[],activeChat;
function showPage(next) {
  page=next;const listing=page==='chats';
  $('chat-page').hidden=!listing;history.hidden=listing;$('composer-footer').hidden=listing;
  $('chats').hidden=listing;$('rename').hidden=listing;$('recent').hidden=!listing;document.body.classList.toggle('chat-list-page',listing);
  const title=chatItems.find(c=>c.id===activeChat)?.title||'New chat';
  $('chat-title').textContent=listing?'Chats':title;$('chat-title').title=listing?'Saved chats':title;
}
function relativeAge(timestamp) {
  const seconds=Math.max(0,Math.floor((Date.now()-timestamp)/1000));
  for(const [unit,size] of [['y',31536000],['mo',2592000],['w',604800],['d',86400],['h',3600],['m',60]])if(seconds>=size)return `${Math.floor(seconds/size)}${unit}`;
  return 'now';
}
function renderChats() {
  const query=$('chat-search').value.trim().toLowerCase();$('chat-list').replaceChildren();
  const items=chatItems.filter(c=>c.title.toLowerCase().includes(query));
  for(const chat of items){
    const row=document.createElement('button');row.className='chat-row';row.disabled=working;
    const name=document.createElement('span');name.className='chat-row-title';name.textContent=chat.title;
    const date=document.createElement('span');date.className='chat-row-date';date.textContent=relativeAge(chat.updatedAt);date.title=new Date(chat.updatedAt).toLocaleString();row.title=chat.title;
    row.append(name,date);row.onclick=()=>vscode.postMessage({type:'openChat',id:chat.id});
    const item=document.createElement('div');item.className='chat-list-item';
    const remove=document.createElement('button');remove.className='delete-chat';remove.textContent='×';remove.title='Delete chat';remove.setAttribute('aria-label','Delete '+chat.title);remove.disabled=working;remove.onclick=()=>vscode.postMessage({type:'deleteChat',id:chat.id});
    item.append(row,remove);$('chat-list').append(item);
  }
  if(!items.length){const empty=document.createElement('p');empty.className='empty-chats';empty.textContent=query?'No matching chats.':'Start a conversation with New chat above.';$('chat-list').append(empty);}
}
$('chat-search').addEventListener('input',renderChats);
$('recent').onclick=()=>{const search=$('chat-search');search.hidden=!search.hidden;if(!search.hidden)search.focus();else{search.value='';renderChats();}};
$('settings').onclick=()=>{$('settings-menu').hidden=!$('settings-menu').hidden;};
let manualCompaction=false;
function commandSuggestion(){const value=$('prompt').value.trim();$('compact-command').hidden=working||!value.startsWith('/')||!'/compact'.startsWith(value);}
$('prompt').addEventListener('input',commandSuggestion);
$('compact-command').onclick=()=>{if(working)return;$('prompt').value='/compact';$('send').click();};
function scroll() {if(follow)history.scrollTop=history.scrollHeight;}
history.addEventListener('scroll',()=>{follow=history.scrollHeight-history.scrollTop-history.clientHeight<80;});
const copies=new Map();let copyId=0;
function formatted(item) {
  if(!item)return;
  if(item.formatTimer){clearTimeout(item.formatTimer);item.formatTimer=undefined;}
  if(!['assistant','reasoning'].includes(item.role)||typeof CodeBlocks==='undefined'||item.rendered===item.text)return;
  // Only re-render the changing message, never the conversation or persisted sessions.
  const positions=Array.from(item.body.querySelectorAll('pre, .markdown-table')).map(pre=>pre.scrollLeft);
  CodeBlocks.render(item.body,item.text,(text,button)=>{
    const id=++copyId;copies.set(id,button);button.disabled=true;vscode.postMessage({type:'copyCode',id,text});
  },url=>vscode.postMessage({type:'openLink',url}));
  item.body.querySelectorAll('pre, .markdown-table').forEach((pre,index)=>{pre.scrollLeft=positions[index]||0;});
  item.rendered=item.text;scroll();
}
function formatStreaming(item) {
  if(typeof CodeBlocks==='undefined'){item.body.textContent=item.text;return;}
  if(!item.formatTimer)item.formatTimer=setTimeout(()=>{item.formatTimer=undefined;formatted(item);},120);
}
let editing=false,previousDraft='';
function endEdit(restoreDraft=false) {if(restoreDraft)$('prompt').value=previousDraft;editing=false;previousDraft='';$('edit-notice').hidden=true;$('send').title='Send message (Enter)';}
$('cancel-edit').onclick=()=>endEdit(true);
function activitySummary(label,kind='thought') {
  const summary=document.createElement('summary');summary.className='activity-summary';summary.title=label;
  const icon=document.createElement('span');icon.className='activity-icon';
  const paths={read:'<path d="M12 5c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v14"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',write:'<path d="m4 16 12-12 4 4L8 20H4v-4ZM14 6l4 4"/>',command:'<path d="m4 5 7 7-7 7m9 0h7"/>',thought:'<path d="M8 17h8m-7 4h6M8 14a7 7 0 1 1 8 0v3H8Z"/>'};
  icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[kind]+'</svg>';
  const text=document.createElement('span');text.className='activity-label';text.textContent=label;
  const arrow=document.createElement('span');arrow.className='activity-chevron';arrow.setAttribute('aria-hidden','true');arrow.innerHTML='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3 5 5-5 5"/></svg>';
  summary.append(icon,text,arrow);return summary;
}
function actionKind(t){
  const name=String(t.name||'');
  if(['bash','pwsh','shell','exec_command'].includes(name))return 'command';
  if(['delete','delete_file','remove_file','unlink'].includes(name))return 'delete';
  if(['read','read_file','read_image','view_file'].includes(name))return 'read';
  if(['write','write_file','edit','edit_file','apply_patch','patch'].includes(name))return 'write';
  if(/search|grep|glob|find/i.test(name))return 'search';
  return 'other';
}
function toolSummary(t) {
  const name=String(t.name||'Tool');const args=t.args||{};const done=t.state==='done';
  let kind='command',verb=t.verb||name,target=t.target||'';
  if(/search|grep|glob|find/i.test(name)){kind='search';verb=done?'Searched for':'Searching for';target=args.pattern||args.query||target;}
  else if(/read|view|list/i.test(name)){kind='read';verb=done?'Read':'Reading';target=args.file_path||args.path||target;}
  else if(/write|edit|patch/i.test(name)){kind='write';verb=done?'Edited':'Editing';target=args.file_path||args.path||target;}
  else {target=args.command||args.cmd||target;}
  if(kind==='read'||kind==='write')target=String(target).split(/[\\/]/).pop();
  let label=[verb,target].filter(Boolean).join(' ');
  if(t.state==='proposed')label+=' · Approval needed';
  if(t.state==='denied')label+=' · Denied';
  if(t.state==='error')label+=' · Failed';
  const summary=activitySummary(label,kind),file=t.args?.file_path??t.args?.path,action=actionKind(t);
  if(typeof file==='string'&&['read','write','delete'].includes(action)){
    const text=summary.querySelector('.activity-label');text.textContent=({read:done?'Read':'Reading',write:done?'Edited':'Editing',delete:done?'Deleted':'Deleting'})[action]+' ';
    const link=document.createElement('button');link.className='activity-file';link.textContent=file.split(/[\\/]/).pop();link.title=file;link.onclick=e=>{e.preventDefault();e.stopPropagation();vscode.postMessage({type:'openToolFile',id:t.id});};text.append(link);
    if(['proposed','error','denied'].includes(t.state))text.append(document.createTextNode(' · '+({proposed:'Approval needed',error:'Failed',denied:'Denied'})[t.state]));
  }
  return summary;
}
function changeCard(summary,existing){
  formatted(last);last=undefined;
  const box=existing||document.createElement('section');box.className='change-summary';box.dataset.changeId=summary.id;box.replaceChildren();
  const header=document.createElement('div');header.className='change-header';
  const heading=document.createElement('strong');heading.textContent=`${summary.undone?'Undid changes to':'Edited'} ${summary.files.length} file${summary.files.length===1?'':'s'}`;
  const stats=(added,removed)=>{const el=document.createElement('span');el.className='change-stats';const a=document.createElement('span'),r=document.createElement('span');a.className='lines-added';r.className='lines-removed';a.textContent=added===null?'+?':`+${added}`;r.textContent=removed===null?'−?':`−${removed}`;el.append(a,r);return el;};
  const label=document.createElement('div');label.append(heading,stats(summary.files.some(f=>f.added===null)?null:summary.added,summary.files.some(f=>f.removed===null)?null:summary.removed));
  const undo=document.createElement('button');undo.className='undo-changes';undo.textContent=summary.undone?'Undone':'Undo ↶';
  undo.dataset.unavailable=String(!!summary.undone||summary.files.some(f=>!f.undoable));undo.disabled=working||undo.dataset.unavailable==='true';
  undo.title='Restore the pre-turn text after confirmation. Refuses later edits. Deleted files and permission changes need manual restoration.';
  undo.onclick=()=>vscode.postMessage({type:'undoChanges',id:summary.id});
  const view=document.createElement('button');view.textContent='View changes';view.onclick=()=>vscode.postMessage({type:'viewChanges',id:summary.id});header.append(label,undo,view);box.append(header);
  const rows=[];
  for(const f of summary.files){const row=document.createElement('div');row.className='change-file';const name=document.createElement('button');name.textContent=f.path;name.title=f.path+' · '+f.kind;name.onclick=()=>vscode.postMessage({type:'viewChanges',id:summary.id,path:f.path});row.append(name,stats(f.added,f.removed));row.hidden=rows.length>=3;rows.push(row);box.append(row);}
  if(rows.length>3){const more=document.createElement('button');more.className='show-changes';let expanded=false;more.textContent=`Show ${rows.length-3} more files ⌄`;more.onclick=()=>{expanded=!expanded;rows.forEach((row,i)=>row.hidden=!expanded&&i>=3);more.textContent=expanded?'Show fewer files ⌃':`Show ${rows.length-3} more files ⌄`;scroll();};box.append(more);}
  const note=document.createElement('p');note.className='change-note';note.textContent='Workspace changes during this turn'+(summary.partial?' · Limited to captured text files':'');note.title='Includes eligible saved workspace files, including changes by other programs during the turn. Does not undo installs, commands or service changes.';box.append(note);
  if(!existing)history.append(box);scroll();return box;
}
let thinkingMarker;
function clearThinking(){if(thinkingMarker){thinkingMarker.remove();thinkingMarker=undefined;}if(last?.role==='reasoning')last=undefined;}
function renderTool(t){
  clearThinking();
  if(t.name==='present'&&!['proposed','error','denied'].includes(t.state)){const old=cards.get(t.id);if(old){old.remove();cards.delete(t.id);}return;}
  formatted(last);last=undefined;
  const shell=['bash','pwsh','shell','exec_command'].includes(t.name);
  let card=cards.get(t.id);if(!card){
    card=document.createElement('details');card.className='tool';card.dataset.action=actionKind(t);if(shell)card.dataset.shell='true';cards.set(t.id,card);
    const previous=history.lastElementChild;
    if(previous?.classList.contains('command-group'))previous.append(card);
    else if(previous?.classList.contains('tool')){
      const group=document.createElement('details');group.className='command-group';group.append(activitySummary('Running commands','command'));history.insertBefore(group,previous);group.append(previous,card);
    }else history.append(card);
  }
    if(t.state==='proposed')card.open=true;
    else if(card.dataset?.state==='proposed')card.open=false;
    card.dataset.state=t.state;
    card.replaceChildren();const title=toolSummary(t);
    const preview=document.createElement('pre');preview.textContent=[t.effect,typeof t.preview==='string'?t.preview:'',JSON.stringify(t.args,null,2),t.result?String(t.result).slice(0,16000):''].filter(Boolean).join('\n');
    if(shell){
      const panel=document.createElement('div');panel.className='shell-panel';const header=document.createElement('div');header.className='shell-header';const label=document.createElement('span');label.textContent='Shell';
      const command=String(t.args?.command??t.args?.cmd??t.preview??'');preview.textContent=(command?'$ '+command+'\n':'')+(t.result==null?'':String(t.result).slice(0,16000));
      const copy=document.createElement('button');copy.textContent='Copy';copy.title='Copy command and output';copy.onclick=()=>{const id=++copyId;copies.set(id,copy);copy.disabled=true;vscode.postMessage({type:'copyCode',id,text:preview.textContent});};header.append(label,copy);panel.append(header,preview);card.append(title,panel);
    }else card.append(title,preview);
    if(t.state==='proposed')for(const [label,decision] of [['Approve once','approve'],['Deny','deny']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{for(const el of card.querySelectorAll('button'))el.disabled=true;vscode.postMessage({type:'approve',callId:t.id,decision});};card.append(b);}
    const group=card.parentElement;
    if(group?.classList.contains('command-group')){
      const children=Array.from(group.children).filter(n=>n.classList.contains('tool'));
      const labels={read:['Reading files','Read files'],write:['Editing files','Edited files'],delete:['Deleting files','Deleted files'],command:['Running commands','Ran commands'],search:['Searching files','Searched files'],other:['Using tools','Used tools']};
      const kinds=[...new Set(children.map(n=>n.dataset.action||'other'))];
      const label=kinds.map((kind,i)=>{const active=children.some(n=>n.dataset.action===kind&&['running','proposed'].includes(n.dataset.state));const text=labels[kind][active?0:1];return i?text.toLowerCase():text;}).join(', ');
      const heading=group.querySelector('summary');heading.querySelector('.activity-label').textContent=label;heading.title=label;
      if(children.some(n=>['proposed','error','denied'].includes(n.dataset.state)))group.open=true;
      if(['proposed','error','denied'].includes(t.state))card.open=true;
    }
}
let workTimer,liveWork;
function workDuration(ms){const seconds=Math.max(0,Math.floor(ms/1000)),minutes=Math.floor(seconds/60);return minutes?`${minutes}min ${seconds%60}s`:`${seconds}s`;}
function stopWorkTimer(){clearTimeout(workTimer);workTimer=undefined;if(liveWork)liveWork.remove();liveWork=undefined;}
function startWorkTimer(startedAt){
  stopWorkTimer();if(!Number.isFinite(startedAt))return;
  liveWork=document.createElement('div');liveWork.className='turn-work live-work';
  const label=document.createElement('div');label.className='working-title';liveWork.append(label);
  const nodes=Array.from(history.children),user=nodes.findLast(n=>n.classList.contains('user'));
  if(user)history.insertBefore(liveWork,user.nextSibling);else history.append(liveWork);
  const tick=()=>{label.textContent='Working for '+workDuration(Date.now()-startedAt);workTimer=setTimeout(tick,1000);};tick();
}
function turnSummary(data){
  stopWorkTimer();
  formatted(last);last=undefined;
  const nodes=Array.from(history.children);let start=nodes.findLastIndex(n=>n.classList.contains('user'))+1;
  if(nodes.slice(start).some(n=>n.classList.contains('turn-work')))return;
  const work=nodes.slice(start),final=work.findLast(n=>n.classList.contains('assistant'));
  const details=document.createElement('details');details.className='turn-work';
  const title=activitySummary('Worked for '+workDuration(Number(data.durationMs)||0));title.querySelector('.activity-icon').remove();
  details.append(title);const content=document.createElement('div');content.className='turn-work-content';details.append(content);
  const activity=work.filter(n=>n!==final&&!n.classList.contains('change-summary')&&!n.classList.contains('error'));
  if(work[0])history.insertBefore(details,work[0]);else history.append(details);
  for(const node of activity)content.append(node);
  scroll();
}
function entry(role,text,timestamp) {
  if(role==='reasoning'){formatted(last);if(last?.role==='reasoning')return;const box=document.createElement('div');box.className='entry thinking-marker';box.textContent='Thinking…';thinkingMarker=box;history.append(box);last={role,body:box,text:'Thinking…'};scroll();return;}
  clearThinking();
  if(role==='turn-summary'){try{turnSummary(JSON.parse(text));}catch{}return;}
  if(role==='tool'){try{renderTool(JSON.parse(text));}catch{}return;}
  if(role==='changes'){try{changeCard(JSON.parse(text));}catch{}return;}
  formatted(last);
  const reasoning=role==='reasoning';
  const box=document.createElement(reasoning?'details':'div');box.className=`entry ${role}`;
  const title=reasoning?activitySummary(working?'Thinking…':'Reasoning'):document.createElement('label');if(!reasoning)title.textContent=role;
  const body=document.createElement('div');body.className='content';body.textContent=text;
  box.append(title,body);
  if(role==='compaction'){const icon=$('compaction').querySelector('svg')?.cloneNode(true);if(icon)box.prepend(icon);$('compaction').hidden=true;}
  if(role==='user'){
    const actions=document.createElement('div');actions.className='message-actions';
    const time=document.createElement('time');
    if(Number.isFinite(timestamp)){const date=new Date(timestamp);time.dateTime=date.toISOString();time.textContent=date.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});time.title=date.toLocaleString();}
    else {time.textContent='';time.title='Send time unavailable for this older message';}
    const copy=document.createElement('button');copy.type='button';copy.className='copy-message';copy.textContent='⧉';copy.dataset.copyLabel='⧉';copy.title='Copy message';copy.setAttribute('aria-label','Copy message');
    copy.onclick=()=>{const id=++copyId;copies.set(id,copy);copy.disabled=true;vscode.postMessage({type:'copyCode',id,text});};
    const edit=document.createElement('button');edit.type='button';edit.className='edit-message';edit.textContent='✎';edit.title='Edit and resend';edit.setAttribute('aria-label','Edit and resend');edit.disabled=working;
    edit.onclick=()=>{if(working)return;if(!editing)previousDraft=$('prompt').value;editing=true;$('prompt').value=text;$('edit-notice').hidden=false;$('send').title='Resend edited message (Enter)';$('prompt').focus();};
    actions.append(time,copy,edit);box.append(actions);
  }
  history.append(box);last={role,body,text};formatted(last);
  while(history.children.length>120)history.firstChild.remove();
  scroll();
}
function flush() {if(scheduled)clearTimeout(scheduled);scheduled=undefined;if(!buffer)return;if(bufferRole==='reasoning'){entry('reasoning','');buffer='';return;}if(last?.role!==bufferRole)entry(bufferRole,'');last.text+=buffer;formatStreaming(last);buffer='';scroll();}
function busy(value) {
  if(!value){stopWorkTimer();clearThinking();}
  working=value;$('send').hidden=value;$('send').disabled=value;$('new').disabled=value;$('chats').disabled=value;$('rename').disabled=value;$('stop').hidden=!value;$('stop').disabled=!value;
  if(!value)manualCompaction=false;$('stop').disabled=!value||manualCompaction;commandSuggestion();
  document.body.classList.toggle('working',value);renderChats();
  for(const edit of history.querySelectorAll('.edit-message'))edit.disabled=value;
  for(const undo of history.querySelectorAll('.undo-changes'))undo.disabled=value||undo.dataset.unavailable==='true';
  if(!value)formatted(last);
  if(!value)for(const title of history.querySelectorAll('.reasoning .activity-label'))title.textContent='Reasoning';
}
window.addEventListener('message',({data:m})=>{
  if(m.type!=='chunk')flush();
  if(m.type==='copied'){const button=copies.get(m.id);if(button){button.disabled=false;button.textContent=m.error?'Try again':'Copied!';copies.delete(m.id);setTimeout(()=>{button.textContent=button.dataset.copyLabel||'Copy';},1800);}}
  else if(m.type==='connectionInfo'){$('connection-status').textContent=m.text;$('connect').textContent=m.connected?'Change connection':'Connect to Strata';}
  else if(m.type==='modelInfo'){const text=[m.model,m.thinking].filter(Boolean).join(' · ');$('model-label').textContent=text;$('model-settings').title=text+' — open model and reasoning settings';}
  else if(m.type==='page')showPage(m.page);
  else if(m.type==='chatMetadata'){chatItems=m.chats;activeChat=m.activeId;renderChats();showPage(page);}
  else if(m.type==='permissionMode')showPermission(m.mode);
  else if(m.type==='turnStarted')startWorkTimer(m.startedAt);
  else if(m.type==='restore'){clearThinking();stopWorkTimer();if(last?.formatTimer)clearTimeout(last.formatTimer);showPermission(m.mode);attachments=[];drawAttachments();endEdit();$('compaction').hidden=true;closeAddMenu();$('prompt').value='';history.replaceChildren();cards.clear();last=undefined;follow=true;busy(m.busy);for(const e of m.transcript)entry(e.role,e.text,e.timestamp);if(!m.busy)clearThinking();if(m.busy&&Number.isFinite(m.turnStartedAt))startWorkTimer(m.turnStartedAt);scroll();}
  else if(m.type==='entry')entry(m.role,m.text,m.timestamp);
  else if(m.type==='changeUpdated'){const card=Array.from(history.children).find(e=>e.dataset?.changeId===m.summary.id);if(card)changeCard(m.summary,card);}
  else if(m.type==='chunk'&&m.role==='reasoning'){flush();entry('reasoning','');}
  else if(m.type==='chunk'){clearThinking();if(bufferRole!==m.role)flush();bufferRole=m.role;buffer+=m.text;if(!scheduled)scheduled=setTimeout(flush,50);}
  else if(m.type==='busy')busy(m.value);
  else if(m.type==='contextInfo'){
    const known=Number.isFinite(m.used)&&Number.isFinite(m.max)&&m.max>0;
    const left=known?Math.max(0,m.max-m.used):null;
    $('context-usage').textContent=known?`${m.used.toLocaleString()} / ${m.max.toLocaleString()} tokens · ${left.toLocaleString()} left (${Math.max(0,Math.round(left/m.max*100))}%)`:'Context usage not yet reported';
    $('context-usage').title='Latest reported context usage. Remaining window is shared by prompts, tools and replies; the harness may compact earlier to reserve space.';
    $('compaction').hidden=!m.compacting;
    $('compaction').classList.toggle('shimmer',!!m.compacting);
    $('compaction-text').textContent='Compacting context…';
    $('compact-description').textContent=known?`Compact this chat’s context (${Math.round(m.used/m.max*100)}% full)`:'Compact this chat’s context';
  }
  else if(m.type==='status'){$('status').textContent=m.text;if(m.manualCompaction){manualCompaction=true;$('stop').disabled=true;$('stop').title='Manual compaction is running';}else if(!manualCompaction)$('stop').title='Stop generation';}
  else if(m.type==='attachment')addAttachment(m.attachment);
  else if(m.type==='sendAccepted'){attachments=attachments.filter(a=>!(m.attachmentIds||[]).includes(a.id));drawAttachments();if($('prompt').value===m.text)$('prompt').value='';}
  else if(m.type==='selection'){$('prompt').value+=m.text;$('prompt').focus();}
  else if(m.type==='tool'){
    renderTool(m.tool);
    scroll();
  }
});
function showPermission(mode) {
  closePermissionMenu();
  $('mode').value=['manual','plan','bypass'].includes(mode)?mode:'manual';
  $('permission-note').hidden=$('mode').value!=='bypass';
  $('permission-control').title='Permissions: '+({manual:'Ask Permission',plan:'Read Only',bypass:'Full Access'}[$('mode').value]);
  $('permission-control').dataset.mode=$('mode').value;
  $('permission-label').textContent={manual:'Ask Permission',plan:'Read Only',bypass:'Full Access'}[$('mode').value];
  for(const choice of ['manual','plan','bypass'])$('permission-'+choice).setAttribute?.('aria-checked',String(choice===$('mode').value));
}
function closePermissionMenu(){ $('permission-menu').hidden=true;$('permission-control').setAttribute?.('aria-expanded','false'); }
$('permission-control').onclick=()=>{
  if(!$('permission-menu').hidden){closePermissionMenu();return;}
  closeAddMenu();$('permission-menu').hidden=false;$('permission-control').setAttribute('aria-expanded','true');$('permission-'+($('mode').value||'manual')).focus();
};
for(const choice of ['manual','plan','bypass'])$('permission-'+choice).onclick=()=>{vscode.postMessage({type:'permissionMode',mode:choice});closePermissionMenu();$('permission-control').focus();};
document.addEventListener?.('click',e=>{if(!$('permission-menu').contains(e.target)&&!$('permission-control').contains(e.target))closePermissionMenu();});
$('permission-menu').addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();closePermissionMenu();$('permission-control').focus();}
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
    e.preventDefault();const choices=['manual','plan','bypass'].map(x=>$('permission-'+x));const index=choices.indexOf(document.activeElement);
    choices[e.key==='Home'?0:e.key==='End'?2:(index+(e.key==='ArrowDown'?1:2))%3].focus();
  }
});
$('mode').addEventListener('change',()=>{showPermission($('mode').value);vscode.postMessage({type:'permissionMode',mode:$('mode').value});});

$('send').onclick=()=>{const draftText=$('prompt').value;if(working||(!draftText.trim()&&!attachments.length))return;const text=(draftText||'Please review the attached items.')+attachments.filter(a=>a.text).map(a=>a.text).join('');follow=true;vscode.postMessage({type:'send',text,draftText,mode:$('mode').value,images:attachments.filter(a=>a.url).map(a=>({name:a.name,url:a.url})),attachmentIds:attachments.map(a=>a.id)});endEdit();$('compact-command').hidden=true;};
$('prompt').addEventListener('keydown',e=>{if(e.key==='Tab'&&!$('compact-command').hidden){e.preventDefault();$('prompt').value='/compact';commandSuggestion();return;}if(e.key==='Escape'){$('compact-command').hidden=true;return;}if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!working){if(!$('compact-command').hidden)$('prompt').value='/compact';$('send').click();}}});
for(const type of ['new','stop','key','changes','chats','rename','model-settings','connect','profiles'])$(type).onclick=()=>vscode.postMessage({type});
function closeAddMenu(){$('add-menu').hidden=true;$('add-context').setAttribute?.('aria-expanded','false');}
$('add-context').onclick=()=>{const open=$('add-menu').hidden;closePermissionMenu();closeAddMenu();if(open){$('add-menu').hidden=false;$('add-context').setAttribute('aria-expanded','true');$('add-files').focus();}};
for(const action of ['files','images','selection','git','plan'])$('add-'+action).onclick=()=>{
  closeAddMenu();
  if(action==='images')$('image-picker').click();
  else if(action==='plan'){vscode.postMessage({type:'permissionMode',mode:'plan'});$('prompt').value+='\nCreate a plan for the following task. Inspect relevant files, but do not make changes.\n';$('prompt').focus();}
  else vscode.postMessage({type:action==='selection'?'add-context':'add-'+action});
};
document.addEventListener?.('click',e=>{if(!$('add-menu').contains(e.target)&&!$('add-context').contains(e.target))closeAddMenu();});
$('add-menu').addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();closeAddMenu();$('add-context').focus();}
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const choices=['files','images','selection','git','plan'].map(x=>$('add-'+x));const i=choices.indexOf(document.activeElement);choices[e.key==='Home'?0:e.key==='End'?choices.length-1:(i+(e.key==='ArrowDown'?1:choices.length-1))%choices.length].focus();}
});
vscode.postMessage({type:'loaded'});
