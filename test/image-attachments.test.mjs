import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import html from '../ui.cjs';
import {validateImages} from '../image-attachments.cjs';
const png='data:image/png;base64,iVBORw0KGgo=';
test('image boundary rejects unsupported formats, oversized payloads and false MIME types',()=>{
 assert.equal(validateImages([{name:'shot.png',url:png}])[0].url,png);
 assert.throws(()=>validateImages([{url:'data:image/svg+xml;base64,PHN2Zz4='}]),/PNG/);
 assert.throws(()=>validateImages([{url:'data:image/png;base64,YWJj'}]),/Invalid image/);
 assert.throws(()=>validateImages(Array(5).fill({url:png})),/four/);
 assert.throws(()=>validateImages([{url:'data:image/png;base64,'+'A'.repeat(7*1024*1024+1)}]),/5 MB/);
});
test('attachment cards and pasted images survive failed sends and clear only on acceptance',async()=>{
 const dom=new JSDOM(html({nonce:'x',source:'self'}),{runScripts:'outside-only'});const sent=[];
 dom.window.acquireVsCodeApi=()=>({postMessage:m=>sent.push(m)});dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const $=id=>dom.window.document.getElementById(id),emit=data=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data}));
 emit({type:'attachment',attachment:{name:'example.html',text:'\nFile: example.html'}});
 assert.equal($('attachments').querySelector('.attachment-name').textContent,'example.html');assert.equal($('prompt').value,'');
 const file=new dom.window.File([new Uint8Array([137,80,78,71,13,10,26,10])],'Screenshot.png',{type:'image/png'});
 const event=new dom.window.Event('paste',{cancelable:true});Object.defineProperty(event,'clipboardData',{value:{items:[{kind:'file',type:file.type,getAsFile:()=>file}]}});
 $('prompt').dispatchEvent(event);assert.equal(event.defaultPrevented,true);
 for(let i=0;i<100&&!$('attachments').querySelector('img');i++)await new Promise(r=>setTimeout(r,5));
 assert.equal($('attachments').querySelector('img').alt,'Screenshot.png');
 $('prompt').value='Review this';$('send').click();const message=sent.at(-1);assert.equal(message.images.length,1);assert.match(message.text,/File: example.html/);
 emit({type:'entry',role:'error',text:'Failed'});assert.equal($('attachments').children.length,2);assert.equal($('prompt').value,'Review this');
 emit({type:'sendAccepted',attachmentIds:message.attachmentIds,text:message.draftText});assert.equal($('attachments').hidden,true);assert.equal($('prompt').value,'');
 emit({type:'attachment',attachment:{name:'other.txt',text:'File: other.txt'}});$('attachments').querySelector('button').click();assert.equal($('attachments').hidden,true);
 dom.window.close();
});
test('sent thumbnails sit above user text, open by id and survive transcript restoration',async()=>{
 const dom=new JSDOM(html({nonce:'test',script:'chat.js',style:'chat.css',highlight:'code.js',source:'self'}),{runScripts:'outside-only'});const sent=[];dom.window.acquireVsCodeApi=()=>({postMessage:m=>sent.push(m)});dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const emit=data=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data}));const images=[{id:'image-id',name:'screen.png',url:'https://file+.vscode-resource.vscode-cdn.net/image.png'}];
 emit({type:'entry',role:'user',text:'Look at this',images});let user=dom.window.document.querySelector('.user');assert.equal(user.firstElementChild.className,'sent-images');assert.equal(user.querySelector('img').alt,'screen.png');assert.equal(user.querySelector('.content').textContent,'Look at this');user.querySelector('.sent-image').click();assert.equal(sent.at(-1).id,'image-id');assert.equal(sent.at(-1).type,'openSentImage');
 emit({type:'restore',mode:'manual',busy:false,transcript:[{role:'user',text:'Look at this',images}]});assert.equal(dom.window.document.querySelectorAll('.user img').length,1);dom.window.close();
});
test('sent images persist separately from transcript metadata and deduplicate safely',async()=>{
 const {mkdtemp,readdir}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const path=await import('node:path');const {saveImages,validId}=await import('../sent-images.cjs');
 const dir=await mkdtemp(path.join(tmpdir(),'strata-sent-images-'));const first=await saveImages(dir,[{name:'screen.png',url:png}]);const again=await saveImages(dir,[{name:'second.png',url:png}]);assert.equal(first[0].id,again[0].id);assert.equal((await readdir(dir)).length,1);assert.equal(first[0].url,undefined);assert.equal(validId('../outside.png'),false);assert.equal(validId(first[0].id),true);assert.equal((await readFile(path.join(dir,first[0].id))).toString('base64'),png.split(',')[1]);
});
test('PC file picker attaches text contents, rejects binary and keeps workspace picker separate',async()=>{
 const dom=new JSDOM(html({nonce:'x',source:'self'}),{runScripts:'outside-only'});const sent=[];
 dom.window.TextDecoder=TextDecoder;dom.window.acquireVsCodeApi=()=>({postMessage:m=>sent.push(m)});dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const $=id=>dom.window.document.getElementById(id);
 let picked=false;$('local-file-picker').click=()=>{picked=true;};$('add-local-files').click();assert.ok(picked);$('add-files').click();assert.equal(sent.at(-1).type,'add-files');
 const files=[new dom.window.File(['hello from the PC'],'local.txt'),new dom.window.File([new Uint8Array([0,1,2])],'binary.bin')];
 Object.defineProperty($('local-file-picker'),'files',{value:files});$('local-file-picker').onchange();
 for(let i=0;i<100&&!$('status').textContent.includes('binary.bin');i++)await new Promise(r=>setTimeout(r,5));
 assert.equal($('attachments').children.length,1);assert.match($('status').textContent,/binary.bin/);
 $('send').click();assert.match(sent.at(-1).text,/hello from the PC/);assert.match(sent.at(-1).text,/not a path on the server/);dom.window.close();
});
test('PDF picker waits for extraction and sends extracted content as a document attachment',async()=>{
 const dom=new JSDOM(html({nonce:'x',source:'self'}),{runScripts:'outside-only'});const sent=[];
 dom.window.TextEncoder=TextEncoder;dom.window.acquireVsCodeApi=()=>({postMessage:m=>sent.push(m)});
 let finish;dom.window.PdfAttachments={importPDF:()=>new Promise(resolve=>{finish=resolve;})};
 dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));const $=id=>dom.window.document.getElementById(id);
 Object.defineProperty($('local-file-picker'),'files',{value:[new dom.window.File(['%PDF-1.4'],'report.pdf',{type:'application/pdf'})]});$('local-file-picker').onchange();
 $('prompt').value='Summarise this';$('send').click();assert.ok(!sent.some(m=>m.type==='send'));
 for(let i=0;i<100&&!finish;i++)await new Promise(r=>setTimeout(r,5));
 finish([{name:'report.pdf · page 1',text:'[Page 1]\nReport contents',url:png,size:8}]);
 for(let i=0;i<100&&!$('attachments').children.length;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal($('attachments').querySelector('.attachment-name').textContent,'report.pdf · page 1');$('send').click();assert.match(sent.at(-1).text,/Report contents/);assert.equal(sent.at(-1).images.length,1);dom.window.close();
});
