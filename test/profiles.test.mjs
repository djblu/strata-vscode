import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {validateProfile} from '../profile-connection.cjs';
const require=createRequire(new URL('../profiles/extension.cjs',import.meta.url));
function windowFor(state,keys,inputs=[],choices=[]){
 const commands=new Map();let prompts=0;
 const vscode={workspace:{isTrusted:true},commands:{registerCommand:(k,v)=>{commands.set(k,v);return {}; }},window:{showQuickPick:async items=>{const choice=choices.shift();return choice==='add'?items.find(x=>x.add):typeof choice==='number'?items[choice]:choice;},showInputBox:async()=>{prompts++;return inputs.shift();},showErrorMessage:m=>{throw Error(m);}}};
 const context={subscriptions:[],globalState:{get:(k,d)=>state.get(k)||d,update:async(k,v)=>state.set(k,v)},secrets:{get:async k=>keys.get(k),store:async(k,v)=>keys.set(k,v),delete:async k=>keys.delete(k)}};
 const module={exports:{}};vm.runInNewContext(readFileSync(new URL('../profiles/extension.cjs',import.meta.url),'utf8'),{module,exports:module.exports,require:n=>n==='vscode'?vscode:require(n)});module.exports.activate(context);
 return {commands,prompts:()=>prompts,vscode};
}
test('profiles are reusable in another window without login prompts and secrets stay out of metadata',async()=>{
 const state=new Map(),keys=new Map();const first=windowFor(state,keys,['Strata — Swift 1.5','host:8081','swift-1.5-q4_k_m','262144','secret-value'],['add']);
 const selected=await first.commands.get('strataProfiles.pick')();assert.equal(selected.apiKey,'secret-value');assert.equal(selected.name,'Strata — Swift 1.5');assert.ok(!JSON.stringify([...state]).includes('secret-value'));assert.equal(keys.size,1);
 const second=windowFor(state,keys);const resolved=await second.commands.get('strataProfiles.resolve')(selected.id);assert.equal(resolved.apiKey,'secret-value');assert.equal(second.prompts(),0);
 second.vscode.workspace.isTrusted=false;await assert.rejects(second.commands.get('strataProfiles.resolve')(selected.id),/Trust/);
});
test('cancelled profile creation writes nothing; deleted profile cannot silently use old credentials',async()=>{
 const state=new Map(),keys=new Map();const cancelled=windowFor(state,keys,[undefined],['add']);assert.equal(await cancelled.commands.get('strataProfiles.pick')(),undefined);assert.equal(state.size,0);assert.equal(keys.size,0);
 const created=windowFor(state,keys,['DeepSeek','host:8082','deepseek','32768','key'],['add']);const p=await created.commands.get('strataProfiles.pick')();
 const manager=windowFor(state,keys,[],[0,'Delete profile']);await manager.commands.get('strataProfiles.manage')();assert.equal(keys.size,0);await assert.rejects(manager.commands.get('strataProfiles.resolve')(p.id),/no longer exists/);
});
test('profile route validation strips secrets and extra fields from persisted connection',()=>{
 const v=validateProfile({id:'a',name:'Swift',model:'swift',baseURL:'host:8081',contextWindow:4096,apiKey:'secret',unexpected:'secret'});assert.equal(v.apiKey,'secret');assert.equal(v.connection.baseURL,'http://host:8081/v1');assert.ok(!JSON.stringify(v.connection).includes('secret'));assert.throws(()=>validateProfile({...v.connection,id:'a',apiKey:'secret',contextWindow:NaN}));
});
