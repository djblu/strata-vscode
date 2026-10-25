import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import html from '../ui.cjs';
test('compact suggestion reflects usage, completes with Tab and submits with Enter',async()=>{
 const dom=new JSDOM(html({nonce:'test',script:'chat.js',style:'chat.css',highlight:'code.js',source:'self'}),{runScripts:'outside-only'});
 const sent=[];dom.window.acquireVsCodeApi=()=>({postMessage:m=>sent.push(m)});
 dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const $=id=>dom.window.document.getElementById(id);const emit=m=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:m}));
 emit({type:'contextInfo',used:6900,max:10000});
 $('prompt').value='/';$('prompt').dispatchEvent(new dom.window.Event('input'));
 assert.equal($('compact-command').hidden,false);assert.match($('compact-description').textContent,/69% full/);
 $('prompt').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',cancelable:true}));assert.equal($('prompt').value,'/compact');
 $('prompt').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',cancelable:true}));assert.equal(sent.at(-1).text,'/compact');assert.equal($('compact-command').hidden,true);
 emit({type:'busy',value:true});emit({type:'status',manualCompaction:true,text:'Compressing context…'});assert.equal($('stop').disabled,true);
 emit({type:'busy',value:false});$('prompt').value='/other';$('prompt').dispatchEvent(new dom.window.Event('input'));assert.equal($('compact-command').hidden,true);
 dom.window.close();
});
