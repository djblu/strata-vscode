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
