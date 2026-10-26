import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import html from '../ui.cjs';
test('compact activity updates labels, retains expanded details and keeps approvals visible',async()=>{
 const dom=new JSDOM(html({nonce:'test',script:'chat.js',style:'chat.css',highlight:'code.js',source:'self'}),{runScripts:'outside-only'});
 const sent=[];dom.window.acquireVsCodeApi=()=>({postMessage:m=>sent.push(m)});
 dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const emit=tool=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:{type:'tool',tool}}));
 emit({id:'read1',name:'read',state:'running',args:{file_path:'/workspace/chat.js'}});
 const card=dom.window.document.querySelector('.tool');assert.equal(card.open,false);assert.equal(card.querySelector('.activity-label').textContent,'Reading chat.js');assert.ok(card.querySelector('svg'));
 card.open=true;emit({id:'read1',name:'read',state:'done',args:{file_path:'/workspace/chat.js'},result:'file contents'});assert.equal(card.open,true);assert.equal(card.querySelector('.activity-label').textContent,'Read chat.js');assert.match(card.querySelector('pre').textContent,/file contents/);
 emit({id:'write1',name:'write',state:'proposed',args:{file_path:'test.js',content:'hello'}});
 const pending=dom.window.document.querySelectorAll('.tool')[1];assert.equal(pending.open,true);assert.match(pending.querySelector('summary').textContent,/Approval needed/);pending.querySelector('button').click();assert.equal(sent.at(-1).decision,'approve');
 emit({id:'write1',name:'write',state:'done',args:{file_path:'test.js'}});assert.equal(pending.open,false);assert.equal(pending.querySelector('button'),null);
 dom.window.close();
});

test('completed turns fold activity above the final answer and restore duration and tools',async()=>{
 const dom=new JSDOM(html({nonce:'test',script:'chat.js',style:'chat.css',highlight:'code.js',source:'self'}),{runScripts:'outside-only'});
 dom.window.acquireVsCodeApi=()=>({postMessage(){}});dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const emit=data=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data}));
 const transcript=[{role:'user',text:'Make a clock'},{role:'assistant',text:'I will read the file.'},{role:'tool',text:JSON.stringify({id:'r',name:'read',state:'done',args:{path:'clock.html'},result:'source'})},{role:'reasoning',text:'Consider the timer.'},{role:'assistant',text:'Added the clock.'},{role:'turn-summary',text:JSON.stringify({durationMs:81000})}];
 emit({type:'restore',mode:'manual',busy:false,transcript});
 const history=dom.window.document.getElementById('history'),group=history.querySelector('.turn-work');
 assert.equal(group.open,false);assert.equal(group.querySelector('.activity-label').textContent,'Worked for 1m 21s');
 assert.match(group.textContent,/I will read the file/);assert.match(group.textContent,/Read clock.html/);assert.match(group.textContent,/Consider the timer/);
 assert.equal(history.lastElementChild.textContent,'assistantAdded the clock.');assert.ok(!group.textContent.includes('Added the clock.'));
 group.open=true;assert.ok(group.querySelector('.tool'));emit({type:'entry',role:'user',text:'Thanks'});emit({type:'entry',role:'assistant',text:'You are welcome'});emit({type:'entry',role:'turn-summary',text:JSON.stringify({durationMs:3000})});
 assert.equal(history.querySelectorAll('.turn-work').length,2);assert.equal(history.querySelectorAll('.turn-work')[1].querySelector('.activity-label').textContent,'Worked for 3s');dom.window.close();
});
