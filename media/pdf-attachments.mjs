import {getDocument,GlobalWorkerOptions} from './pdfjs/pdf.mjs';
GlobalWorkerOptions.workerSrc=new URL('./pdfjs/pdf.worker.mjs',import.meta.url).href;
export async function extractPDF(bytes){
 if(bytes.byteLength>20*1024*1024)throw Error('PDF files must be 20 MB or smaller.');
 if(!new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'))throw Error('This file is not a PDF.');
 const task=getDocument({data:bytes,isEvalSupported:false,stopAtErrors:true,
  cMapUrl:new URL('./pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,
  standardFontDataUrl:new URL('./pdfjs/standard_fonts/',import.meta.url).href});
 task.onPassword=()=>task.destroy();
 const timeout=setTimeout(()=>task.destroy(),30000);
 try{
  const pdf=await task.promise;
  if(pdf.numPages>200)throw Error('PDFs are limited to 200 pages. Split this document into smaller files.');
  const pages=[];const blank=[];let length=0;
  for(let i=1;i<=pdf.numPages;i++){
   const page=await pdf.getPage(i);const content=await page.getTextContent();
   const text=content.items.map(item=>typeof item.str==='string'?item.str+(item.hasEOL?'\n':' '):'').join('').trim();
   page.cleanup();if(!text)blank.push(i);
   const section='[Page '+i+']\n'+(text||'[No extractable text: scanned images or graphics may be present.]');
   length+=section.length;if(length>180000)throw Error('Extracted PDF text exceeds 180,000 characters. Split this document into smaller files.');pages.push(section);
  }
  if(blank.length===pdf.numPages)throw Error('This PDF has no extractable text. OCR is not available yet; attach screenshots of the relevant pages to a vision-capable model.');
  return {text:pages.join('\n\n'),pages:pdf.numPages,warning:blank.length?'No text extracted from pages '+blank.join(', ')+'. Scanned pages and graphics are not included.':'PDF text extracted. Images, charts and layout are not included.'};
 }catch(error){
  if(/password|destroyed|worker was destroyed/i.test(error.message))throw Error('Could not read this PDF: it may be password-protected or processing timed out. Try an unlocked or smaller PDF.');
  throw error;
 }finally{clearTimeout(timeout);await task.destroy();}
}
if(typeof window!=='undefined')window.PdfAttachments={extractPDF};
