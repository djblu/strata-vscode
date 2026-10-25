import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SavedConnections} from '../saved-connections.cjs';
const profile={name:'Strata — Swift',baseURL:'http://host:8081/v1',model:'swift',contextWindow:262144,apiKey:'secret'};
function secrets(){const map=new Map();return {get:async k=>map.get(k),store:async(k,v)=>map.set(k,v)};}
test('another SSH host automatically resolves default connection from shared client SecretStorage',async()=>{
 const client=secrets();const hostA=new SavedConnections(client);const p=await hostA.save(profile);
 const hostB=new SavedConnections(client);assert.deepEqual(await hostB.get(),p);
 const deepseek=await hostB.save({...profile,name:'Strata — DeepSeek',model:'deepseek'});
 assert.equal((await hostA.get()).id,deepseek.id);assert.equal((await hostA.get(p.id)).model,'swift');
 await hostA.select(p.id);assert.equal((await hostB.get()).model,'swift');
});
test('failed secret write preserves previous connection and queued saves preserve both profiles',async()=>{
 const client=secrets();const store=new SavedConnections(client);await Promise.all([store.save(profile),store.save({...profile,model:'second'})]);assert.equal((await store.read()).profiles.length,2);
 const previous=await store.get();client.store=async()=>{throw Error('storage unavailable');};await assert.rejects(store.save({...profile,model:'bad'}),/storage unavailable/);assert.deepEqual(await store.get(),previous);
});
