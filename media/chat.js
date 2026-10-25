'use strict';
const vscode = acquireVsCodeApi();
const $ = id => document.getElementById(id);
const history = $('history'), cards = new Map();
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
    row.append(name,date);row.onclick=()=>vscode.postMessage({type:'openChat',id:chat.id});$('chat-list').append(row);
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
  if(item && ['assistant','reasoning'].includes(item.role) && typeof CodeBlocks!=='undefined') CodeBlocks.render(item.body,item.text,(text,button)=>{
    const id=++copyId;copies.set(id,button);button.disabled=true;vscode.postMessage({type:'copyCode',id,text});
  },url=>vscode.postMessage({type:'openLink',url}));
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
  const arrow=document.createElement('span');arrow.className='activity-chevron';arrow.textContent='⌄';
  summary.append(icon,text,arrow);return summary;
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
  return activitySummary(label,kind);
}
function entry(role,text,timestamp) {
  formatted(last);
  const reasoning=role==='reasoning';
  const box=document.createElement(reasoning?'details':'div');box.className=`entry ${role}`;
  const title=reasoning?activitySummary(working?'Thinking…':'Reasoning'):document.createElement('label');if(!reasoning)title.textContent=role;
  const body=document.createElement('div');body.className='content';body.textContent=text;
  box.append(title,body);
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
function flush() {if(scheduled)clearTimeout(scheduled);scheduled=undefined;if(!buffer)return;if(last?.role!==bufferRole)entry(bufferRole,'');last.text+=buffer;last.body.textContent=last.text;buffer='';scroll();}
function busy(value) {
  working=value;$('send').hidden=value;$('send').disabled=value;$('new').disabled=value;$('chats').disabled=value;$('rename').disabled=value;$('mode').disabled=value;$('permission-control').disabled=value;if(value)closePermissionMenu();$('stop').hidden=!value;$('stop').disabled=!value;
  if(!value)manualCompaction=false;$('stop').disabled=!value||manualCompaction;commandSuggestion();
  document.body.classList.toggle('working',value);renderChats();
  for(const edit of history.querySelectorAll('.edit-message'))edit.disabled=value;
  if(!value)formatted(last);
  if(!value)for(const title of history.querySelectorAll('.reasoning .activity-label'))title.textContent='Reasoning';
}
window.addEventListener('message',({data:m})=>{
  if(m.type!=='chunk')flush();
  if(m.type==='copied'){const button=copies.get(m.id);if(button){button.disabled=false;button.textContent=m.error?'Try again':'Copied!';copies.delete(m.id);setTimeout(()=>{button.textContent=button.dataset.copyLabel||'Copy';},1800);}}
  else if(m.type==='modelInfo'){const text=[m.model,m.thinking].filter(Boolean).join(' · ');$('model-label').textContent=text;$('model-settings').title=text+' — open model and reasoning settings';}
  else if(m.type==='page')showPage(m.page);
  else if(m.type==='chatMetadata'){chatItems=m.chats;activeChat=m.activeId;renderChats();showPage(page);}
  else if(m.type==='permissionMode')showPermission(m.mode);
  else if(m.type==='restore'){showPermission(m.mode);endEdit();$('prompt').value='';history.replaceChildren();cards.clear();last=undefined;follow=true;busy(m.busy);for(const e of m.transcript)entry(e.role,e.text,e.timestamp);scroll();}
  else if(m.type==='entry')entry(m.role,m.text,m.timestamp);
  else if(m.type==='chunk'){if(bufferRole!==m.role)flush();bufferRole=m.role;buffer+=m.text;if(!scheduled)scheduled=setTimeout(flush,50);}
  else if(m.type==='busy')busy(m.value);
  else if(m.type==='contextInfo'){
    const known=Number.isFinite(m.used)&&Number.isFinite(m.max)&&m.max>0;
    const left=known?Math.max(0,m.max-m.used):null;
    $('context-usage').textContent=known?`${m.used.toLocaleString()} / ${m.max.toLocaleString()} tokens · ${left.toLocaleString()} left (${Math.max(0,Math.round(left/m.max*100))}%)`:'Context usage not yet reported';
    $('context-usage').title='Latest reported context usage. Remaining window is shared by prompts, tools and replies; the harness may compact earlier to reserve space.';
    $('compaction').hidden=!m.compacting;
    $('compact-description').textContent=known?`Compact this chat’s context (${Math.round(m.used/m.max*100)}% full)`:'Compact this chat’s context';
  }
  else if(m.type==='status'){$('status').textContent=m.text;if(m.manualCompaction){manualCompaction=true;$('stop').disabled=true;$('stop').title='Manual compaction is running';}else if(!manualCompaction)$('stop').title='Stop generation';}
  else if(m.type==='selection'){$('prompt').value+=m.text;$('prompt').focus();}
  else if(m.type==='tool'){
    const t=m.tool;let card=cards.get(t.id);if(!card){card=document.createElement('details');card.className='tool';cards.set(t.id,card);history.append(card);}
    if(t.state==='proposed')card.open=true;
    else if(card.dataset?.state==='proposed')card.open=false;
    card.dataset.state=t.state;
    card.replaceChildren();const title=toolSummary(t);
    const preview=document.createElement('pre');preview.textContent=[t.effect,typeof t.preview==='string'?t.preview:'',JSON.stringify(t.args,null,2),t.result?String(t.result).slice(0,16000):''].filter(Boolean).join('\n');card.append(title,preview);
    if(t.state==='proposed')for(const [label,decision] of [['Approve once','approve'],['Deny','deny']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{for(const el of card.querySelectorAll('button'))el.disabled=true;vscode.postMessage({type:'approve',callId:t.id,decision});};card.append(b);}
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
  if(working)return;
  if(!$('permission-menu').hidden){closePermissionMenu();return;}
  $('permission-menu').hidden=false;$('permission-control').setAttribute('aria-expanded','true');$('permission-'+($('mode').value||'manual')).focus();
};
for(const choice of ['manual','plan','bypass'])$('permission-'+choice).onclick=()=>{if(working)return;showPermission(choice);vscode.postMessage({type:'permissionMode',mode:choice});closePermissionMenu();$('permission-control').focus();};
document.addEventListener?.('click',e=>{if(!$('permission-menu').contains(e.target)&&!$('permission-control').contains(e.target))closePermissionMenu();});
$('permission-menu').addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();closePermissionMenu();$('permission-control').focus();}
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
    e.preventDefault();const choices=['manual','plan','bypass'].map(x=>$('permission-'+x));const index=choices.indexOf(document.activeElement);
    choices[e.key==='Home'?0:e.key==='End'?2:(index+(e.key==='ArrowDown'?1:2))%3].focus();
  }
});
$('mode').addEventListener('change',()=>{showPermission($('mode').value);vscode.postMessage({type:'permissionMode',mode:$('mode').value});});

$('send').onclick=()=>{const text=$('prompt').value;if(working||!text.trim())return;follow=true;vscode.postMessage({type:'send',text,mode:$('mode').value});$('prompt').value='';endEdit();commandSuggestion();};
$('prompt').addEventListener('keydown',e=>{if(e.key==='Tab'&&!$('compact-command').hidden){e.preventDefault();$('prompt').value='/compact';commandSuggestion();return;}if(e.key==='Escape'){$('compact-command').hidden=true;return;}if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!working){if(!$('compact-command').hidden)$('prompt').value='/compact';$('send').click();}}});
for(const type of ['new','stop','key','changes','chats','rename','add-context','model-settings'])$(type).onclick=()=>vscode.postMessage({type});
vscode.postMessage({type:'loaded'});
