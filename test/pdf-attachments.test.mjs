import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DOMMatrix,ImageData,Path2D} from '@napi-rs/canvas';
Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
const {extractPDF}=await import('../media/pdf-attachments.mjs');
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
