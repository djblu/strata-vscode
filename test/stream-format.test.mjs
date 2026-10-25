import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import html from '../ui.cjs';
import renderer from '../src/code-blocks.cjs';
test('formats an unfinished stream and batches 1000 chunks without losing code or copy content',async()=>{
 const dom=new JSDOM(html({nonce:'test',script:'chat.js',style:'chat.css',highlight:'code.js',source:'self'}),{runScripts:'outside-only'});
 const sent=[];let renders=0;
 dom.window.acquireVsCodeApi=()=>({postMessage:m=>sent.push(m)});
 dom.window.CodeBlocks={render(...args){renders++;renderer.render(...args);}};
 dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const emit=m=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:m}));
 const wait=()=>new Promise(r=>setTimeout(r,230));
 try {
 emit({type:'busy',value:true});emit({type:'chunk',role:'assistant',text:'**Working**\n```bash\necho "hi"'});
 await wait();const document=dom.window.document;
 assert.equal(document.querySelector('strong').textContent,'Working');assert.ok(document.querySelector('.hljs-string'));assert.equal(document.getElementById('stop').hidden,false);
 const before=renders;
 for(let i=0;i<1000;i++)emit({type:'chunk',role:'assistant',text:'x'});
 await wait();assert.ok(renders-before<=2,`Too many renders: ${renders-before}`);
 assert.equal(document.querySelector('pre code').textContent,'echo "hi"'+'x'.repeat(1000));
 document.querySelector('.code-header button').click();assert.equal(sent.at(-1).text,'echo "hi"'+'x'.repeat(1000));
 emit({type:'chunk',role:'assistant',text:'\n```\nFinished'});emit({type:'busy',value:false});
 assert.equal(document.querySelector('pre code').textContent,'echo "hi"'+'x'.repeat(1000));assert.match(document.querySelector('.assistant').textContent,/Finished/);
 const finished=renders;await wait();assert.equal(renders,finished);
 }finally{dom.window.close();}
});
