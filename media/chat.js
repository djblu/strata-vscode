'use strict';
const vscode = acquireVsCodeApi();
const $ = id => document.getElementById(id);
const history = $('history'), cards = new Map();
let last, buffer = '', bufferRole, scheduled, working = false, follow = true;
function scroll() {if(follow)history.scrollTop=history.scrollHeight;}
history.addEventListener('scroll',()=>{follow=history.scrollHeight-history.scrollTop-history.clientHeight<80;});
function entry(role,text) {
  const reasoning=role==='reasoning';
  const box=document.createElement(reasoning?'details':'div');box.className=`entry ${role}`;
  const title=document.createElement(reasoning?'summary':'label');title.textContent=reasoning?(working?'Thinking…':'Reasoning'):role;
  const body=document.createElement('div');body.className='content';body.textContent=text;
  box.append(title,body);history.append(box);last={role,body};
  while(history.children.length>120)history.firstChild.remove();
  scroll();
}
function flush() {if(scheduled)clearTimeout(scheduled);scheduled=undefined;if(!buffer)return;if(last?.role!==bufferRole)entry(bufferRole,'');last.body.append(document.createTextNode(buffer));buffer='';scroll();}
function busy(value) {
  working=value;$('send').hidden=value;$('send').disabled=value;$('new').disabled=value;$('mode').disabled=value;$('stop').hidden=!value;$('stop').disabled=!value;
  document.body.classList.toggle('working',value);
  if(!value)for(const title of history.querySelectorAll('.reasoning summary'))title.textContent='Reasoning';
}
window.addEventListener('message',({data:m})=>{
  if(m.type!=='chunk')flush();
  if(m.type==='restore'){history.replaceChildren();cards.clear();last=undefined;follow=true;busy(m.busy);for(const e of m.transcript)entry(e.role,e.text);scroll();}
  else if(m.type==='entry')entry(m.role,m.text);
  else if(m.type==='chunk'){if(bufferRole!==m.role)flush();bufferRole=m.role;buffer+=m.text;if(!scheduled)scheduled=setTimeout(flush,50);}
  else if(m.type==='busy')busy(m.value);
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
for(const type of ['new','stop','key','changes'])$(type).onclick=()=>vscode.postMessage({type});
vscode.postMessage({type:'loaded'});
