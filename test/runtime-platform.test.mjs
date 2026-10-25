import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runtimeLayout,runtimeEnvironment} from '../runtime-platform.cjs';
test('Windows downloads ZIP and invokes node.exe with npm JS directly, including paths with spaces',()=>{
 const c=runtimeLayout('C:\\Users\\Test User\\runtime','24.22.1','win32','x64');
 assert.equal(c.file,'node-v24.22.1-win-x64.zip');assert.equal(c.nodePath,'C:\\Users\\Test User\\runtime\\node-v24.22.1-win-x64\\node.exe');
 assert.equal(c.npmPath,'C:\\Users\\Test User\\runtime\\node-v24.22.1-win-x64\\node_modules\\npm\\bin\\npm-cli.js');
 assert.equal(runtimeLayout('C:\\runtime','24.22.1','win32','arm64').file,'node-v24.22.1-win-arm64.zip');
});
test('Windows environment keeps one case-insensitive PATH and preserves other environment variables',()=>{
 const env=runtimeEnvironment('C:\\Node',{Path:'C:\\Windows',PATH:'duplicate',TEMP:'C:\\Temp'},true);assert.deepEqual(env,{Path:'C:\\Node;C:\\Windows',TEMP:'C:\\Temp'});
 assert.equal(runtimeEnvironment('/node/bin',{PATH:'/usr/bin'},false).PATH,'/node/bin:/usr/bin');
});
test('Unix layouts remain unchanged and unsupported architectures fail clearly',()=>{
 const c=runtimeLayout('/runtime','24.22.1','linux','x64');assert.equal(c.file,'node-v24.22.1-linux-x64.tar.gz');assert.equal(c.nodePath,'/runtime/node-v24.22.1-linux-x64/bin/node');
 assert.throws(()=>runtimeLayout('/runtime','24.22.1','win32','ia32'),/x64\/ARM64/);
});
