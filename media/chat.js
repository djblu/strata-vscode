'use strict';
const vscode = acquireVsCodeApi();
const $ = id => document.getElementById(id);
const history = $('history'), cards = new Map();
let last, buffer = '', bufferRole, scheduled, working = false, follow = true;
let page='chat',chatItems=[],activeChat;
function showPage(next) {
  page=next;const listing=page==='chats';
  $('chat-page').hidden=!listing;history.hidden=listing;$('composer-footer').hidden=listing;
  $('chats').hidden=listing;$('rename').hidden=listing;
  const title=chatItems.find(c=>c.id===activeChat)?.title||'New chat';
  $('chat-title').textContent=listing?'Chats':title;$('chat-title').title=listing?'Saved chats':title;
}
function renderChats() {
  const query=$('chat-search').value.trim().toLowerCase();$('chat-list').replaceChildren();
  const items=chatItems.filter(c=>c.title.toLowerCase().includes(query));
  for(const chat of items){
    const row=document.createElement('button');row.className='chat-row';row.disabled=working;
    const name=document.createElement('span');name.className='chat-row-title';name.textContent=chat.title;
    const date=document.createElement('span');date.className='chat-row-date';date.textContent=new Date(chat.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})+(chat.id===activeChat?' · Current':'');
    row.append(name,date);row.onclick=()=>vscode.postMessage({type:'openChat',id:chat.id});$('chat-list').append(row);
  }
  if(!items.length){const empty=document.createElement('p');empty.className='empty-chats';empty.textContent=query?'No matching chats.':'Start a new chat using ＋ above.';$('chat-list').append(empty);}
}
$('chat-search').addEventListener('input',renderChats);
function scroll() {if(follow)history.scrollTop=history.scrollHeight;}
history.addEventListener('scroll',()=>{follow=history.scrollHeight-history.scrollTop-history.clientHeight<80;});
const copies=new Map();let copyId=0;
function formatted(item) {
  if(item && ['assistant','reasoning'].includes(item.role) && typeof CodeBlocks!=='undefined') CodeBlocks.render(item.body,item.text,(text,button)=>{
    const id=++copyId;copies.set(id,button);button.disabled=true;vscode.postMessage({type:'copyCode',id,text});
  },url=>vscode.postMessage({type:'openLink',url}));
}
function entry(role,text) {
  formatted(last);
  const reasoning=role==='reasoning';
  const box=document.createElement(reasoning?'details':'div');box.className=`entry ${role}`;
  const title=document.createElement(reasoning?'summary':'label');title.textContent=reasoning?(working?'Thinking…':'Reasoning'):role;
  const body=document.createElement('div');body.className='content';body.textContent=text;
  box.append(title,body);history.append(box);last={role,body,text};formatted(last);
  while(history.children.length>120)history.firstChild.remove();
  scroll();
}
function flush() {if(scheduled)clearTimeout(scheduled);scheduled=undefined;if(!buffer)return;if(last?.role!==bufferRole)entry(bufferRole,'');last.text+=buffer;last.body.textContent=last.text;buffer='';scroll();}
function busy(value) {
  working=value;$('send').hidden=value;$('send').disabled=value;$('new').disabled=value;$('chats').disabled=value;$('rename').disabled=value;$('mode').disabled=value;$('stop').hidden=!value;$('stop').disabled=!value;
  document.body.classList.toggle('working',value);renderChats();
  if(!value)formatted(last);
  if(!value)for(const title of history.querySelectorAll('.reasoning summary'))title.textContent='Reasoning';
}
window.addEventListener('message',({data:m})=>{
  if(m.type!=='chunk')flush();
  if(m.type==='copied'){const button=copies.get(m.id);if(button){button.disabled=false;button.textContent=m.error?'Try again':'Copied!';copies.delete(m.id);setTimeout(()=>{button.textContent='Copy';},1800);}}
  else if(m.type==='page')showPage(m.page);
  else if(m.type==='chatMetadata'){chatItems=m.chats;activeChat=m.activeId;renderChats();showPage(page);}
  else if(m.type==='restore'){history.replaceChildren();cards.clear();last=undefined;follow=true;busy(m.busy);for(const e of m.transcript)entry(e.role,e.text);scroll();}
  else if(m.type==='entry')entry(m.role,m.text);
  else if(m.type==='chunk'){if(bufferRole!==m.role)flush();bufferRole=m.role;buffer+=m.text;if(!scheduled)scheduled=setTimeout(flush,50);}
  else if(m.type==='busy')busy(m.value);
  else if(m.type==='contextInfo'){
    const known=Number.isFinite(m.used)&&Number.isFinite(m.max)&&m.max>0;
    const left=known?Math.max(0,m.max-m.used):null;
    $('context-usage').textContent=known?`${m.used.toLocaleString()} / ${m.max.toLocaleString()} tokens · ${left.toLocaleString()} left (${Math.max(0,Math.round(left/m.max*100))}%)`:'Context usage not yet reported';
    $('context-usage').title='Latest reported context usage. Remaining window is shared by prompts, tools and replies; the harness may compact earlier to reserve space.';
    $('compaction').hidden=!m.compacting;
  }
  else if(m.type==='status')$('status').textContent=m.text;
  else if(m.type==='selection'){$('prompt').value+=m.text;$('prompt').focus();}
  else if(m.type==='tool'){
    const t=m.tool;let card=cards.get(t.id);if(!card){card=document.createElement('details');card.className='tool';cards.set(t.id,card);history.append(card);}
    if(t.state==='proposed')card.open=true;
    else if(card.dataset?.state==='proposed')card.open=false;
    card.dataset.state=t.state;
    card.replaceChildren();const title=document.createElement('summary');title.textContent=`${t.name} · ${t.state}`;
    const preview=document.createElement('pre');preview.textContent=[t.effect,typeof t.preview==='string'?t.preview:'',JSON.stringify(t.args,null,2),t.result?String(t.result).slice(0,16000):''].filter(Boolean).join('\n');card.append(title,preview);
    if(t.state==='proposed')for(const [label,decision] of [['Approve once','approve'],['Deny','deny']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{for(const el of card.querySelectorAll('button'))el.disabled=true;vscode.postMessage({type:'approve',callId:t.id,decision});};card.append(b);}
    scroll();
  }
});
$('mode').addEventListener('change',()=>{$('permission-note').hidden=$('mode').value!=='bypass';});
$('send').onclick=()=>{const text=$('prompt').value;if(working||!text.trim())return;follow=true;vscode.postMessage({type:'send',text,mode:$('mode').value});$('prompt').value='';};
$('prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!working)$('send').click();}});
for(const type of ['new','stop','key','changes','chats','rename'])$(type).onclick=()=>vscode.postMessage({type});
vscode.postMessage({type:'loaded'});
