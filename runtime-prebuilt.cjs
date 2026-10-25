'use strict';
const fs=require('node:fs/promises');
const {createWriteStream}=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {promisify}=require('node:util');
const exec=promisify(require('node:child_process').execFile);
const {runtimeLayout}=require('./runtime-platform.cjs');
const manifest=require('./runtime-manifest.json');
function runtimePaths(root,node){
 const layout=runtimeLayout(root,node);
 return {nodePath:layout.nodePath,sourcePath:path.join(root,'strata'),harnessPath:path.join(root,'harness/node_modules/@deepseek-ai/dsh')};
}
async function ready(root,version,node){
 try{
  if(JSON.parse(await fs.readFile(path.join(root,'bundle-ready.json'),'utf8')).version!==version)return false;
  const r=runtimePaths(root,node);
  await Promise.all([fs.access(r.nodePath),fs.access(path.join(r.sourcePath,'apps/host/server/agent/agent-bridge.mjs')),fs.access(path.join(r.harnessPath,'lib/bin.js'))]);
  return true;
 }catch{return false;}
}
async function downloadVerified(url,file,sha256,bytes,report=()=>{},fetcher=fetch){
 if(!/^[a-f0-9]{64}$/.test(sha256)||!Number.isSafeInteger(bytes)||bytes<=0)throw Error('Invalid prebuilt runtime manifest');
 const response=await fetcher(url,{signal:AbortSignal.timeout(600000)});
 if(!response.ok)throw Error('Prebuilt runtime download failed: HTTP '+response.status);
 if(!response.body)throw Error('Empty prebuilt runtime response');
 const hash=createHash('sha256');let total=0,last=0;
 const meter=new Transform({transform(chunk,encoding,cb){
  total+=chunk.length;if(total>bytes)return cb(Error('Prebuilt runtime exceeds expected size'));
  hash.update(chunk);
  if(Date.now()-last>1500){last=Date.now();report(`Downloading runtime · ${Math.floor(total/bytes*100)}% · ${Math.round(total/1048576)} / ${Math.round(bytes/1048576)} MB`);}
  cb(null,chunk);
 }});
 try{
  await pipeline(Readable.fromWeb(response.body),meter,createWriteStream(file,{flags:'wx'}));
  if(total!==bytes||hash.digest('hex')!==sha256)throw Error('Prebuilt runtime checksum did not match. Retry setup; the package was not extracted.');
 }catch(error){await fs.rm(file,{force:true});throw error;}
}
async function installPrebuilt(base,report=()=>{},catalog=manifest){
 const asset=catalog.assets[process.platform+'-'+process.arch];if(!asset)return null;
 if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(catalog.version))throw Error('Invalid runtime version');
 const root=path.join(base,catalog.version);
 if(await ready(root,catalog.version,catalog.node))return runtimePaths(root,catalog.node);
 await fs.mkdir(base,{recursive:true});
 const staging=await fs.mkdtemp(path.join(base,'.runtime-install-'));
 try{
  const archive=path.join(staging,'runtime.tar.gz'),payload=path.join(staging,'payload');
  report('Downloading the prebuilt coding runtime…');
  await downloadVerified(asset.url,archive,asset.sha256,asset.bytes,report);
  await fs.mkdir(payload);
  report('Extracting the coding runtime…');
  const started=Date.now(),progress=setInterval(()=>report(`Extracting runtime · ${Math.floor((Date.now()-started)/1000)}s elapsed`),5000);
  try{await exec(process.platform==='win32'?'tar.exe':'tar',['-xzf',archive,'-C',payload],{timeout:300000,windowsHide:true,maxBuffer:2000000});}finally{clearInterval(progress);}
  const r=runtimePaths(payload,catalog.node),nested=path.join(r.harnessPath,'node_modules');
  // Recreate links after extraction: Windows junctions cannot be moved between hosts.
  await fs.symlink(process.platform==='win32'?path.join(payload,'harness/node_modules'):'../..',nested,process.platform==='win32'?'junction':'dir');
  report('Checking the coding runtime…');
  await exec(r.nodePath,['--version'],{timeout:15000,windowsHide:true});
  await fs.writeFile(path.join(payload,'bundle-ready.json'),JSON.stringify({version:catalog.version}));
  if(!await ready(payload,catalog.version,catalog.node))throw Error('Prebuilt runtime is incomplete');
  // The absolute Windows junction must target the final location.
  if(process.platform==='win32'){await fs.unlink(nested);await fs.symlink(path.join(root,'harness/node_modules'),nested,'junction');}
  // Never remove a working runtime or the previous version during extraction.
  if(await ready(root,catalog.version,catalog.node))return runtimePaths(root,catalog.node);
  try{await fs.rename(payload,root);}catch(error){
   // A second VS Code window may have completed the same installation.
   if(await ready(root,catalog.version,catalog.node))return runtimePaths(root,catalog.node);
   throw error;
  }
  return runtimePaths(root,catalog.node);
 }finally{await fs.rm(staging,{recursive:true,force:true});}
}
module.exports={installPrebuilt,downloadVerified,runtimePaths};
