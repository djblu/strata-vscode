'use strict';
const fs=require('node:fs/promises');
const {createReadStream}=require('node:fs');
const {createHash}=require('node:crypto');
const path=require('node:path');
const exec=require('node:util').promisify(require('node:child_process').execFile);
const {ensureSourceRuntime,NODE,COMMIT}=require('../runtime-setup.cjs');
(async()=>{
 const base=path.resolve(process.argv[2]||'.runtime/build');
 const out=path.resolve(process.argv[3]||'dist/runtime');
 const r=await ensureSourceRuntime(base,{},console.log,{reuseLegacy:false});
 await require('./smoke-runtime.cjs').smoke(r);
 const root=path.join(base,'runtime-v1');
 // Only installer-owned software is included. Never package extension storage or credentials.
 await fs.rm(path.join(r.harnessPath,'node_modules'),{force:true,recursive:true});
 const license=await exec('git',['-C',r.sourcePath,'show','HEAD:LICENSE']);
 await fs.writeFile(path.join(root,'STRATA-LICENSE'),license.stdout);
 await fs.rm(path.join(root,'strata/.git'),{recursive:true,force:true});
 await fs.rm(path.join(root,'harness/install-logs'),{recursive:true,force:true});
 await fs.rm(path.join(root,'ready.json'),{force:true});
 await fs.writeFile(path.join(root,'RUNTIME-NOTICE.txt'),`Strata coding runtime\nNode.js ${NODE}\nStrata ${COMMIT}\nDeepSeek Harness 0.2.1-alpha.3\nBundled software retains its upstream license; see package LICENSE and package.json files.\nWindows: optional subagent model selection disabled for compatibility.\n`);
 await fs.mkdir(out,{recursive:true});
 const platform=process.platform+'-'+process.arch,name=`strata-runtime-${platform}.tar.gz`,archive=path.join(out,name);
 await exec('tar',['-czf',archive,'-C',root,'.'],{timeout:600000,maxBuffer:2000000});
 const hash=createHash('sha256');for await(const chunk of createReadStream(archive))hash.update(chunk);
 const info={platform,file:name,sha256:hash.digest('hex'),bytes:(await fs.stat(archive)).size};
 await fs.writeFile(path.join(out,platform+'.json'),JSON.stringify(info,null,2));console.log(info);
})().catch(e=>{console.error(e);process.exitCode=1;});
