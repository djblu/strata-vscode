import {getDocument,GlobalWorkerOptions} from './pdfjs/pdf.mjs';
GlobalWorkerOptions.workerSrc=new URL('./pdfjs/pdf.worker.mjs',import.meta.url).href;
export async function extractPDF(bytes){
 if(bytes.byteLength>20*1024*1024)throw Error('PDF files must be 20 MB or smaller.');
 if(!new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'))throw Error('This file is not a PDF.');
 const task=getDocument({data:bytes,isEvalSupported:false,stopAtErrors:true,
  wasmUrl:new URL('./pdfjs/wasm/',import.meta.url).href,
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

export function parsePages(value,total,max){
 const pages=new Set();
 for(const part of value.split(',')){
  const match=/^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(part);
  if(!match)throw Error('Enter page numbers such as 1, 3-4.');
  const start=Number(match[1]),end=Number(match[2]||match[1]);
  if(start<1||end<start||end>total)throw Error('Page numbers must be between 1 and '+total+'.');
  if(end-start+1>max)throw Error('Choose up to '+max+' pages for this message.');
  for(let n=start;n<=end;n++)pages.add(n);
 }
 if(!pages.size||pages.size>max)throw Error('Choose up to '+max+' pages for this message.');
 return [...pages].sort((a,b)=>a-b);
}
export async function openVisualPDF(bytes,{canvasFactory=()=>document.createElement('canvas')}={}){
 if(bytes.byteLength>20*1024*1024)throw Error('PDF files must be 20 MB or smaller.');
 if(!new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'))throw Error('This file is not a PDF.');
 const task=getDocument({data:bytes,isEvalSupported:false,stopAtErrors:true,
  wasmUrl:new URL('./pdfjs/wasm/',import.meta.url).href,
  cMapUrl:new URL('./pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,
  standardFontDataUrl:new URL('./pdfjs/standard_fonts/',import.meta.url).href});
 let password=false;task.onPassword=()=>{password=true;task.destroy();};
 const timer=setTimeout(()=>task.destroy(),30000);let pdf;
 try{pdf=await task.promise;if(pdf.numPages>200)throw Error('PDFs are limited to 200 pages. Split this document first.');}
 catch(error){await task.destroy();throw Error(password?'Unlock this password-protected PDF before attaching it.':error.message);}
 finally{clearTimeout(timer);}
 return {pages:pdf.numPages,close:()=>task.destroy(),async page(number,edge=2400){
  const timeout=setTimeout(()=>task.destroy(),30000);let canvas;
  try{
   const page=await pdf.getPage(number),original=page.getViewport({scale:1});
   const viewport=page.getViewport({scale:edge/Math.max(original.width,original.height)});
   canvas=canvasFactory();canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'rgb(255,255,255)'}).promise;
   const url=canvas.toDataURL('image/png');const size=Math.ceil((url.length-url.indexOf(',')-1)*3/4);
   if(size>5*1024*1024)throw Error('Rendered page '+number+' exceeds the 5 MB image limit. Attach a crop instead.');
   const content=await page.getTextContent();const text=content.items.map(i=>typeof i.str==='string'?i.str+(i.hasEOL?'\n':' '):'').join('').trim();
   page.cleanup();return {url,size,text,width:canvas.width,height:canvas.height};
  }finally{clearTimeout(timeout);if(canvas){canvas.width=0;canvas.height=0;}}
 }};
}
let activePDFDialog;
function cancelPDFImport(){activePDFDialog?.close();}
export async function choosePDFPages(pdf,name,max){
 const dialog=document.createElement('dialog');dialog.className='pdf-dialog';activePDFDialog=dialog;
 const title=document.createElement('h3');title.textContent=name;
 const help=document.createElement('p');help.textContent=pdf.pages+' pages. Choose up to '+max+' pages. Only selected pages are sent as images and text. A vision-capable model is required.';
 const preview=document.createElement('img');preview.className='pdf-preview';preview.alt='PDF page preview';
 const nav=document.createElement('div');nav.className='pdf-controls';
 const prev=document.createElement('button');prev.textContent='Previous';const next=document.createElement('button');next.textContent='Next';const label=document.createElement('span');nav.append(prev,label,next);
 const field=document.createElement('label');field.textContent='Pages to attach (e.g. 1, 3-4)';const input=document.createElement('input');input.value=pdf.pages===1?'1':'1-'+Math.min(pdf.pages,max);field.append(input);
 const note=document.createElement('p');note.textContent='Pages are rendered at up to 2400 pixels on the longest side. Very small labels may need separate close-up screenshots. Original PDFs and OCR are not included.';
 const error=document.createElement('p');error.setAttribute('role','status');
 const actions=document.createElement('div');actions.className='pdf-controls';const cancel=document.createElement('button');cancel.textContent='Cancel';const attach=document.createElement('button');attach.textContent='Attach selected pages';actions.append(cancel,attach);
 dialog.append(title,help,nav,preview,field,note,error,actions);document.body.append(dialog);
 let page=1,closed=false;
 async function show(){prev.disabled=next.disabled=attach.disabled=true;label.textContent='Page '+page+' / '+pdf.pages;try{const result=await pdf.page(page,700);if(!closed)preview.src=result.url;}catch(e){error.textContent=e.message;}finally{if(!closed){prev.disabled=page===1;next.disabled=page===pdf.pages;attach.disabled=false;}}}
 prev.onclick=()=>{page--;show();};next.onclick=()=>{page++;show();};
 return new Promise(resolve=>{
  let selected=null;dialog.addEventListener('close',()=>{closed=true;activePDFDialog=undefined;dialog.remove();resolve(selected);},{once:true});
  cancel.onclick=()=>dialog.close();attach.onclick=()=>{try{selected=parsePages(input.value,pdf.pages,max);dialog.close();}catch(e){error.textContent=e.message;}};
  dialog.showModal();show();
 });
}
async function importPDF(bytes,name,{maxImages=4,maxBytes=16*1024*1024,maxTextBytes=200000}={}){
 if(maxImages<1)throw Error('Remove an image first: PDF pages share the four-image limit.');
 const pdf=await openVisualPDF(bytes);
 try{
  const selected=await choosePDFPages(pdf,name,maxImages);if(!selected)return [];
  const omitted=Array.from({length:pdf.pages},(_,i)=>i+1).filter(n=>!selected.includes(n));
  const coverage='Selected pages: '+selected.join(', ')+'. Omitted pages: '+(omitted.join(', ')||'none')+'.';
  const items=[];let total=0,textTotal=0;
  for(const n of selected){
   const result=await pdf.page(n);total+=result.size;
   if(total>maxBytes)throw Error('PDF pages exceed the remaining image budget. Choose fewer pages.');
   const text='\nPDF '+JSON.stringify(name)+', page '+n+' of '+pdf.pages+'. '+coverage+'\nFull-page image: '+result.width+' × '+result.height+' pixels. Small details may need closer inspection.\nExtracted text:\n'+(result.text||'[No text layer. Read the attached page image; OCR was not performed.]')+'\n';
   const localBytes=new TextEncoder().encode(text).length;textTotal+=localBytes;
   if(textTotal>maxTextBytes)throw Error('Selected PDF text exceeds the remaining attachment text budget. Choose fewer pages.');
   items.push({name:name+' · page '+n,url:result.url,size:result.size,text,localBytes});
  }
  return items;
 }finally{await pdf.close();}
}
if(typeof window!=='undefined')Object.assign(window.PdfAttachments,{importPDF,cancelPDFImport});
