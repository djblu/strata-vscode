import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(new URL('../extension.cjs',import.meta.url));
function fixture({inputs=['host:8081','new-key','32768'],fail=false}={}){
 const commands=new Map(),saved=new Map(),keys=new Map(),workspace=new Map();let installations=0;
 const state=map=>({get:(k,d)=>map.has(k)?map.get(k):d,update:async(k,v)=>map.set(k,v)});
 const api={window:{createOutputChannel:()=>({append(){},dispose(){}}),showInputBox:async()=>inputs.shift(),showQuickPick:async()=>({label:'test-model'}),withProgress:async(o,fn)=>fn({report(){}}),showInformationMessage(){},showErrorMessage:m=>{throw Error(m);},registerWebviewViewProvider:()=>({})},workspace:{textDocuments:[],registerTextDocumentContentProvider:()=>({dispose(){}}),isTrusted:true,getConfiguration:()=>({get:()=>''}),onDidChangeConfiguration:()=>({})},commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return {}; }},ProgressLocation:{Notification:1}};
 const ctx={subscriptions:[],workspaceState:state(workspace),globalState:state(saved),secrets:{get:async k=>keys.get(k),store:async(k,v)=>keys.set(k,v),delete:async k=>keys.delete(k)},globalStorageUri:{fsPath:'/fixture'},extensionPath:'/fixture'};
 const module={exports:{}};const sandbox={module,exports:module.exports,require:n=>n==='vscode'?api:n==='./runtime-setup.cjs'?{usable:async()=>false,legacy:{},ensureRuntime:async()=>{installations++;return {};}}:n==='./connection.cjs'?{normalizeAddress:require(n).normalizeAddress,listModels:async()=>{if(fail)throw Error('Connection failed');return [{id:'test-model'}];}}:require(n),setTimeout,clearTimeout};
 vm.runInNewContext(readFileSync(new URL('../extension.cjs',import.meta.url),'utf8'),sandbox);module.exports.activate(ctx);
 return {connect:commands.get('strata.connect'),saved,keys,workspace,installations:()=>installations};
}
test('connection wizard saves the tested route and key after runtime setup',async()=>{
 const f=fixture();await f.connect();const data=JSON.parse(f.keys.get('strata.connections.v1'));assert.equal(data.profiles[0].baseURL,'http://host:8081/v1');assert.equal(data.profiles[0].model,'test-model');assert.equal(data.profiles[0].apiKey,'new-key');assert.equal(f.saved.size,0);assert.ok(!JSON.stringify([...f.workspace]).includes('new-key'));assert.equal(f.installations(),1);
});
test('cancelled and failed setup do not overwrite connection or credentials',async()=>{
 const cancelled=fixture({inputs:[undefined]});await cancelled.connect();assert.equal(cancelled.saved.size,0);assert.equal(cancelled.keys.size,0);assert.equal(cancelled.installations(),0);
 const f=fixture({fail:true});f.saved.set('connection',{baseURL:'http://old:8081/v1',model:'old',contextWindow:4096});f.keys.set('strata.apiKey','old-key');await assert.rejects(f.connect(),/Connection failed/);assert.equal(f.keys.get('strata.apiKey'),'old-key');assert.equal(f.saved.get('connection').model,'old');assert.equal(f.installations(),0);
});
