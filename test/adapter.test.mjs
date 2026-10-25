import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {validate} from '../protocol.cjs';
test('unknown modes and forged decisions fail closed',()=>{
 for(const mode of ['auto','full',null])assert.throws(()=>validate({type:'send',chatId:'chat',text:'hello',mode}));
 assert.equal(validate({type:'send',chatId:'chat',text:'hello',mode:'bypass'}).mode,'bypass');
 assert.throws(()=>validate({type:'approve',chatId:'chat',callId:'tool',decision:'allow-always'}));
 assert.throws(()=>validate({type:'send',chatId:'../other',text:'hello',mode:'manual'}));
});
test('adapter streams, enforces one turn, routes approvals and cancels through bridge',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'strata-test-'));
 const agent=path.join(dir,'apps/host/server/agent');await mkdir(agent,{recursive:true});
 await writeFile(path.join(agent,'agent-bridge.mjs'),`
 export function createAgentBridge(){let end,frame;
 return {status:()=>({state:'idle'}),compactCommand:async(o)=>{o.onFrame({type:'delta',text:'Compacted fixture'});o.onFrame({type:'done'});},sessionOf:()=> 'session-test',_debug:()=>({rt:{gw:{rpc:async(method,args)=>{if(method!=='commands/execute'||args.line!=='/strata-context')throw Error('Unexpected RPC');return {result:{kind:'success',text:JSON.stringify({tokens:1234,window:8192})}};}}}}),runTurn:async(o)=>{frame=o.onFrame;frame({type:'agent-tool',tool:{id:'write-1',state:'proposed'}});await new Promise(r=>end=r);frame({type:'done'});},
 approve:async(o)=>{if(o.callId!=='write-1')throw Error('Not pending');frame({type:'delta',text:o.decision});},stop:async()=>{end?.();return {stopped:true};},close:async()=>{}};}`);
 const p=spawn(process.execPath,[new URL('../adapter.mjs',import.meta.url).pathname],{stdio:['pipe','pipe','pipe']});
 const messages=[];let error='';p.stderr.on('data',x=>error+=x);
 readline.createInterface({input:p.stdout}).on('line',x=>messages.push(JSON.parse(x)));
 const send=m=>p.stdin.write(JSON.stringify(m)+'\n');
 async function wait(predicate){const deadline=Date.now()+5000;while(Date.now()<deadline){const m=messages.find(predicate);if(m)return m;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out '+JSON.stringify(messages)+error);}
 try {
 send({type:'init',config:{baseURL:'http://localhost:8082/v1',workspace:dir,dataDir:path.join(dir,'data'),sourcePath:dir}});
 await wait(m=>m.type==='ready');
 send({type:'send',chatId:'chat',mode:'manual',text:'test'});
 await wait(m=>m.frame?.type==='agent-tool');
 send({type:'send',chatId:'other',mode:'manual',text:'test'});
 await wait(m=>m.type==='error'&&m.text.includes('already running'));
 send({type:'approve',chatId:'chat',callId:'forged',decision:'approve'});
 await wait(m=>m.type==='error'&&m.text==='Not pending');
 send({type:'approve',chatId:'chat',callId:'write-1',decision:'deny'});
 await wait(m=>m.frame?.text==='deny');
 send({type:'stop',chatId:'chat'});
 await wait(m=>m.type==='stopped'&&m.result.stopped);
 await wait(m=>m.type==='idle');
 messages.length=0;
 send({type:'send',chatId:'chat',mode:'manual',text:'/compact'});
 await wait(m=>m.type==='idle');
 assert.ok(messages.some(m=>m.frame?.manual===true&&m.frame?.phase==='compacting'));
 assert.ok(messages.some(m=>m.frame?.text==='Compacted fixture'));
 assert.ok(messages.some(m=>m.frame?.contextTokens===1234&&m.frame?.contextMax===8192));
 assert.equal(messages.some(m=>m.frame?.type==='agent-tool'),false);
 send({type:'close'});
 await new Promise(resolve=>p.once('exit',resolve));
 }finally{p.kill();await rm(dir,{recursive:true,force:true});}
});
