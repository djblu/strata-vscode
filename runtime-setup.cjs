'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {promisify}=require('node:util');
const {execFile}=require('node:child_process');
const {createHash}=require('node:crypto');
const exec=promisify(execFile);
const NODE='24.22.1',COMMIT='96ca4383c7b05a8a3e6064c65d9e9977d4b3bb59';
const legacy={nodePath:'/home/djblu/.local/share/strata-vscode/node-v24.22.1-linux-x64/bin/node',sourcePath:'/mnt/ai-models/strata-q8/source',harnessPath:'/home/djblu/.local/share/strata-vscode/harness/node_modules/@deepseek-ai/dsh'};
async function exists(p){try{await fs.access(p);return true;}catch{return false;}}
async function usable(c){return c.nodePath&&c.sourcePath&&c.harnessPath&&await exists(c.nodePath)&&await exists(path.join(c.sourcePath,'apps/host/server/agent/agent-bridge.mjs'))&&await exists(path.join(c.harnessPath,'lib/bin.js'));}
async function download(url){const r=await fetch(url,{signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error('Runtime download failed: HTTP '+r.status);return Buffer.from(await r.arrayBuffer());}
async function ensureRuntime(base,overrides={},report=()=>{},{reuseLegacy=true}={}){
 if(await usable(overrides))return overrides;
 if(Object.values(overrides).some(Boolean))throw Error('Configured runtime paths are incomplete or missing. Clear all three runtime path overrides to use automatic setup.');
 if(reuseLegacy&&await usable(legacy))return legacy;
 if(!['linux','darwin'].includes(process.platform)||!['x64','arm64'].includes(process.arch))throw Error('Automatic harness setup supports Linux and macOS x64/ARM64 hosts. Use Remote SSH to a supported host.');
 const root=path.join(base,'runtime-v1');await fs.mkdir(root,{recursive:true});
 const name=`node-v${NODE}-${process.platform}-${process.arch}`,nodeDir=path.join(root,name);
 const result={nodePath:path.join(nodeDir,'bin/node'),sourcePath:path.join(root,'strata'),harnessPath:path.join(root,'harness/node_modules/@deepseek-ai/dsh')};
 if(await exists(path.join(root,'ready.json'))&&await usable(result))return result;
 if(!await exists(result.nodePath)){
  report('Downloading Node.js 24…');const file=name+'.tar.gz',url=`https://nodejs.org/dist/v${NODE}/`;
  const sums=(await download(url+'SHASUMS256.txt')).toString();const expected=sums.split('\n').find(line=>line.endsWith('  '+file))?.split(' ')[0];
  const data=await download(url+file);if(!expected||createHash('sha256').update(data).digest('hex')!==expected)throw Error('Node.js download checksum did not match');
  const archive=path.join(root,file);await fs.writeFile(archive,data);await exec('tar',['-xzf',archive,'-C',root],{timeout:120000});await fs.unlink(archive);
 }
 report('Installing the pinned Strata bridge…');
 await fs.mkdir(result.sourcePath,{recursive:true});
 const git=async args=>exec('git',['-C',result.sourcePath,...args],{timeout:180000,maxBuffer:2000000});
 await git(['init','-q']);await git(['sparse-checkout','set','apps/host/server']);
 await git(['fetch','--depth=1','https://github.com/Niko1221/Strata.git',COMMIT]);await git(['checkout','--detach','FETCH_HEAD']);
 report('Installing the pinned coding harness…');const harness=path.join(root,'harness');await fs.mkdir(harness,{recursive:true});
 await fs.writeFile(path.join(harness,'package.json'),JSON.stringify({private:true,dependencies:{'@deepseek-ai/dsh':'0.2.1-alpha.3'}}));
 await exec(result.nodePath,[path.join(nodeDir,'lib/node_modules/npm/bin/npm-cli.js'),'install','--omit=dev','--no-audit','--no-fund'],{cwd:harness,timeout:300000,maxBuffer:2000000,env:{...process.env,PATH:path.join(nodeDir,'bin')+path.delimiter+process.env.PATH}});
 const nested=path.join(result.harnessPath,'node_modules');if(!await exists(nested))await fs.symlink('../..',nested,'dir');
 if(!await usable(result))throw Error('Runtime installation is incomplete');
 await fs.writeFile(path.join(root,'ready.json'),JSON.stringify({node:NODE,strata:COMMIT,harness:'0.2.1-alpha.3'}));return result;
}
module.exports={ensureRuntime,usable,legacy};
