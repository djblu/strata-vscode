import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {downloadVerified,installPrebuilt,runtimePaths} from '../runtime-prebuilt.cjs';
const exec=promisify(execFile);
test('verified download rejects corrupt and oversized archives and removes partial files',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'runtime-download-'));
 try{
  const data=Buffer.from('runtime'),sha=createHash('sha256').update(data).digest('hex');
  const fetcher=async()=>new Response(data);
  await downloadVerified('https://example.test/runtime',path.join(dir,'good'),sha,data.length,()=>{},fetcher);
  assert.deepEqual(await fs.readFile(path.join(dir,'good')),data);
  await assert.rejects(downloadVerified('https://example.test/runtime',path.join(dir,'bad'),'0'.repeat(64),data.length,()=>{},fetcher),/checksum/);
  await assert.rejects(fs.access(path.join(dir,'bad')));
  await assert.rejects(downloadVerified('https://example.test/runtime',path.join(dir,'large'),sha,2,()=>{},fetcher),/expected size/);
  await assert.rejects(fs.access(path.join(dir,'large')));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('prebuilt installation extracts, relocates dependency link and reuses cache without downloading',{skip:process.platform==='win32'},async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'runtime-bundle-'));
 let server;
 try{
  const fixture=path.join(base,'fixture'),r=runtimePaths(fixture,'24.22.1');
  await fs.mkdir(path.dirname(r.nodePath),{recursive:true});
  await fs.writeFile(r.nodePath,'#!/bin/sh\necho v24.22.1\n',{mode:0o755});
  for(const file of [path.join(r.sourcePath,'apps/host/server/agent/agent-bridge.mjs'),path.join(r.harnessPath,'lib/bin.js')]){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'// fixture');}
  const archive=path.join(base,'fixture.tar.gz');await exec('tar',['-czf',archive,'-C',fixture,'.']);
  const bytes=await fs.readFile(archive);let requests=0;
  server=createServer((req,res)=>{requests++;res.end(bytes);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const catalog={version:'test-runtime-v1',node:'24.22.1',assets:{[process.platform+'-'+process.arch]:{url:`http://127.0.0.1:${server.address().port}/runtime`,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}}};
  const storage=path.join(base,'storage');
  const installed=await installPrebuilt(storage,()=>{},catalog);
  assert.equal(await fs.realpath(path.join(installed.harnessPath,'node_modules')),path.join(storage,catalog.version,'harness/node_modules'));
  assert.deepEqual(await installPrebuilt(storage,()=>{},catalog),installed);assert.equal(requests,1);
  assert.deepEqual((await fs.readdir(storage)),[catalog.version]);
  assert.equal(await installPrebuilt(storage,()=>{},{...catalog,assets:{}}),null);
 }finally{server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));await fs.rm(base,{recursive:true,force:true});}
});
