'use strict';
const path=require('node:path');
function runtimeLayout(root,version,platform=process.platform,arch=process.arch){
 if(!['linux','darwin','win32'].includes(platform)||!['x64','arm64'].includes(arch))throw Error('Automatic harness setup supports Windows, Linux and macOS x64/ARM64 hosts.');
 const windows=platform==='win32',p=windows?path.win32:path.posix;
 const name=`node-v${version}-${windows?'win':platform}-${arch}`,dir=p.join(root,name);
 return {windows,name,file:name+(windows?'.zip':'.tar.gz'),nodePath:p.join(dir,windows?'node.exe':'bin/node'),npmPath:p.join(dir,windows?'node_modules/npm/bin/npm-cli.js':'lib/node_modules/npm/bin/npm-cli.js'),bin:windows?dir:p.join(dir,'bin')};
}
function runtimeEnvironment(bin,env=process.env,windows=process.platform==='win32'){
 const result={...env};const key=Object.keys(env).find(k=>windows?k.toLowerCase()==='path':k==='PATH');
 const value=key?env[key]:'';
 if(windows)for(const k of Object.keys(result))if(k.toLowerCase()==='path')delete result[k];
 result[windows?'Path':'PATH']=bin+(windows?';':':')+(value||'');return result;
}
module.exports={runtimeLayout,runtimeEnvironment};
