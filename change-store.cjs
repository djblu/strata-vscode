'use strict';
const fs=require('node:fs/promises');
const {constants}=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {lineStats,filePatch}=require('./change-diff.cjs');
const SKIP=new Set(['.git','node_modules','__pycache__','target','dist','build','venv','.venv']);
const secret=n=>/^\.env(?:\.|$)/i.test(n)||/\.(?:pem|key|p12|pfx|env)$/i.test(n)||/^id_(rsa|ed25519|ecdsa)/.test(n);
const within=(root,p)=>{const rel=path.relative(root,p);return !path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep);};
class ChangeStore{
 constructor(dir,{maxFile=1024*1024,maxBytes=32*1024*1024,maxFiles=5000,maxMs=4000}={}){this.dir=dir;Object.assign(this,{maxFile,maxBytes,maxFiles,maxMs});}
 async safePath(root,rel){
  if(typeof rel!=='string'||!rel||path.isAbsolute(rel))throw Error('Invalid checkpoint path');
  const full=path.resolve(root,rel);if(!within(root,full)||full===root)throw Error('Path outside workspace');
  if(await fs.realpath(root)!==root)throw Error('Workspace path changed');
  let p=root;
  for(const part of path.relative(root,full).split(path.sep)){
   p=path.join(p,part);
   try{const st=await fs.lstat(p);if(st.isSymbolicLink())throw Error('Symbolic links cannot be restored');}
   catch(e){if(e.code==='ENOENT')break;throw e;}
  }
  return full;
 }
 async read(root,rel){
  const p=await this.safePath(root,rel);
  let st;try{st=await fs.lstat(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}
  if(!st.isFile()||st.size>this.maxFile||st.nlink>1)throw Error('File is not eligible for a text checkpoint');
  const handle=await fs.open(p,constants.O_RDONLY|(constants.O_NOFOLLOW||0));let bytes;
  try{const opened=await handle.stat();if(opened.ino!==st.ino||opened.dev!==st.dev||!opened.isFile())throw Error('File changed during checkpoint');const buffer=Buffer.alloc(this.maxFile+1);let count=0;while(count<buffer.length){const {bytesRead}=await handle.read(buffer,count,buffer.length-count,count);if(!bytesRead)break;count+=bytesRead;}bytes=buffer.subarray(0,count);}finally{await handle.close();}
  if(bytes.length>this.maxFile||bytes.includes(0))throw Error('Not a small text file');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  // Keep a UTF-8 BOM, CRLF, and trailing newlines exactly as saved.
  const value=bytes.subarray(0,3).equals(Buffer.from([239,187,191]))?'\uFEFF'+text:text;
  const end=await fs.lstat(p);
  if(st.mtimeMs!==end.mtimeMs||st.size!==end.size||st.ino!==end.ino||end.isSymbolicLink())throw Error('File changed during checkpoint');
  return {text:value,mode:st.mode&0o777};
 }
 async scan(root,dirty=[]){
  root=await fs.realpath(root);const files=new Map(),known=new Set(),skipped=new Set();let bytes=0,count=0,partial=false;
  const start=Date.now(),blocked=new Set(dirty.map(p=>path.resolve(p)));
  const queue=[root];
  const walk=async dir=>{
   let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch{partial=true;return;}
   for(const e of entries){
    if(++count>this.maxFiles||Date.now()-start>this.maxMs){partial=true;return;}
    const full=path.join(dir,e.name),rel=path.relative(root,full);
    if(e.isDirectory()){if(!SKIP.has(e.name)&&(!e.name.startsWith('.')||['.github','.vscode'].includes(e.name)))queue.push(full);continue;}
    known.add(rel);
    if(!e.isFile()||secret(e.name)||blocked.has(full)){skipped.add(rel);continue;}
    try{const v=await this.read(root,rel);if(!v)continue;const size=Buffer.byteLength(v.text);if(bytes+size>this.maxBytes){partial=true;skipped.add(rel);continue;}bytes+=size;files.set(rel,v);}catch{skipped.add(rel);}
   }
  };
  while(queue.length&&count<=this.maxFiles&&Date.now()-start<=this.maxMs)await walk(queue.shift());
  if(queue.length)partial=true;
  return {id:randomUUID(),root,files,known,skipped,partial};
 }
 async finish(before,chatId,dirty=[]){
  const after=await this.scan(before.root,dirty),files=[];const blocked=new Set(dirty.map(p=>path.resolve(p)));
  for(const rel of new Set([...before.files.keys(),...after.files.keys()])){
   if(blocked.has(path.join(before.root,rel))||before.skipped.has(rel)||after.skipped.has(rel))continue;
   const old=before.files.get(rel)||null;
   if(!old&&(before.partial||before.known.has(rel)))continue; // Never call an uncaptured file a new file.
   let next;try{next=await this.read(before.root,rel);}catch{continue;}
   if(old?.text===next?.text&&old?.mode===next?.mode)continue;
   files.push({path:rel,before:old,after:next,...lineStats(old?.text||'',next?.text||'')});
  }
  const record={id:before.id||randomUUID(),chatId,root:before.root,createdAt:Date.now(),partial:before.partial||after.partial||before.skipped.size>0||after.skipped.size>0,files};
  if(!files.length&&!before.saved)return null;
  await fs.mkdir(this.dir,{recursive:true,mode:0o700});
  // Bound retained data without deleting older checkpoints behind the user's back.
  let size=0;for(const n of await fs.readdir(this.dir)){size+=(await fs.stat(path.join(this.dir,n))).size;}
  const data=JSON.stringify(record),patch=files.map(f=>filePatch(f.path,f.before?.text||'',f.after?.text||'')).join('\n');
  const dest=path.join(this.dir,record.id+'.json'),diffDest=path.join(this.dir,record.id+'.diff');
  for(const p of [dest,diffDest]){try{size-=(await fs.stat(p)).size;}catch(e){if(e.code!=='ENOENT')throw e;}}
  if(size+Buffer.byteLength(data)+Buffer.byteLength(patch)>512*1024*1024)throw Error('Change snapshot storage is full (512 MB); this turn has no undo checkpoint');
  await fs.writeFile(dest+'.tmp',data,{mode:0o600});await fs.rename(dest+'.tmp',dest);
  await fs.writeFile(diffDest+'.tmp',patch,{mode:0o600});await fs.rename(diffDest+'.tmp',diffDest);
  before.saved=true;return this.summary(record);
 }
 summary(r){return {id:r.id,undone:!!r.undone,partial:r.partial,files:r.files.map(f=>({path:f.path,added:f.added,removed:f.removed,kind:!f.before?'added':!f.after?'deleted':'modified',undoable:!f.before||!!f.after&&f.before.mode===f.after.mode})),added:r.files.reduce((n,f)=>n+(f.added||0),0),removed:r.files.reduce((n,f)=>n+(f.removed||0),0)};}
 async load(id,chatId){if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Invalid checkpoint');const r=JSON.parse(await fs.readFile(path.join(this.dir,id+'.json'),'utf8'));if(r.id!==id||r.chatId!==chatId)throw Error('Checkpoint belongs to another chat');return r;}
 async validateUndo(r){
  if(r.undone)throw Error('These changes were already undone');
  for(const f of r.files){
   if(f.before&&(!f.after||f.before.mode!==f.after.mode))throw Error('Deleted files and permission changes require manual restoration from View changes');
   const current=await this.read(r.root,f.path);
   if(current?.text!==f.after?.text||current?.mode!==f.after?.mode)throw Error(f.path+' changed after this turn; review its diff instead');
  }
 }
 async markUndone(r){r.undone=true;await fs.writeFile(path.join(this.dir,r.id+'.json'),JSON.stringify(r),{mode:0o600});return this.summary(r);}
}
module.exports={ChangeStore};
