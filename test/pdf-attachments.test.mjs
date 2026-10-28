import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DOMMatrix,ImageData,Path2D,createCanvas} from '@napi-rs/canvas';
Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
const {extractPDF,openVisualPDF,parsePages,choosePDFPages}=await import('../media/pdf-attachments.mjs');
function pdf(text){
 const stream=text?`BT /F1 12 Tf 72 720 Td (${text}) Tj ET`:'';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let data='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(data.length);data+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=data.length;data+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new TextEncoder().encode(data);
}
test('extracts real PDF text with page labels',async()=>{const result=await extractPDF(pdf('Hello PDF upload'));assert.match(result.text,/\[Page 1\]/);assert.match(result.text,/Hello PDF upload/);assert.equal(result.pages,1);});
test('rejects non-PDF, oversized and image-only/empty documents clearly',async()=>{
 await assert.rejects(extractPDF(new Uint8Array([0,1,2])),/not a PDF/);
 await assert.rejects(extractPDF(new Uint8Array(21*1024*1024)),/20 MB/);
 await assert.rejects(extractPDF(pdf('')),/no extractable text/);
});

test('page selection validates ranges and never silently truncates',()=>{
 assert.deepEqual(parsePages('3, 1-2, 2',10,4),[1,2,3]);
 for(const value of ['0','11','3-2','1-9','a',''])assert.throws(()=>parsePages(value,10,4));
});
test('visual PDF renders full pages including pages without text',async()=>{
 for(const content of ['Visual PDF','']){
  const doc=await openVisualPDF(pdf(content),{canvasFactory:()=>createCanvas(1,1)});
  try{const result=await doc.page(1,1200);assert.match(result.url,/^data:image\/png;base64,/);assert.equal(Math.max(result.width,result.height),1200);assert.equal(result.text.trim(),content);assert.ok(result.size>1000);}
  finally{await doc.close();}
 }
});

test('PDF preview selects explicit pages, rejects excess pages and supports cancel',async()=>{
 const {JSDOM}=await import('jsdom');const dom=new JSDOM('<body></body>');globalThis.document=dom.window.document;
 dom.window.HTMLDialogElement.prototype.showModal=function(){};
 dom.window.HTMLDialogElement.prototype.close=function(){this.dispatchEvent(new dom.window.Event('close'));};
 try{
  const fake={pages:8,page:async()=>({url:'data:image/png;base64,AAAA'})};
  const selected=choosePDFPages(fake,'chart.pdf',4);await new Promise(r=>setTimeout(r,0));
  const dialog=document.querySelector('dialog');assert.ok(dialog.querySelector('img').src.startsWith('data:'));
  const input=dialog.querySelector('input'),attach=[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Attach selected pages');
  input.value='1-8';attach.click();assert.match(dialog.textContent,/Choose up to 4/);assert.ok(dialog.isConnected);
  input.value='2, 4';attach.click();assert.deepEqual(await selected,[2,4]);assert.equal(document.querySelector('dialog'),null);
  const cancelled=choosePDFPages(fake,'chart.pdf',4);document.querySelector('dialog').close();assert.equal(await cancelled,null);
 }finally{delete globalThis.document;dom.window.close();}
});
