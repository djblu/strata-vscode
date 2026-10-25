'use strict';
// Exercise session creation and a complete streamed turn against a local mock API.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {createServer}=require('node:http');
async function smoke(r){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'strata-runtime-smoke-'));
 let bridge;
 const server=createServer(async(req,res)=>{
  for await(const chunk of req){};
  res.setHeader('Content-Type','text/event-stream');
  for(const delta of [{role:'assistant',content:'RUNTIME_OK'},{}])res.write('data: '+JSON.stringify({id:'smoke',object:'chat.completion.chunk',created:1,model:'runtime-test',choices:[{index:0,delta,finish_reason:delta.content?null:'stop'}]})+'\n\n');
  res.end('data: [DONE]\n\n');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const timer=setTimeout(()=>{console.error('Runtime smoke test timed out');process.exit(1);},180000);
 try{
  const {createAgentBridge}=await import(pathToFileURL(path.join(r.sourcePath,'apps/host/server/agent/agent-bridge.mjs')));
  bridge=createAgentBridge({dataDir:path.join(dir,'data'),gate:true,env:{...process.env,STRATA_HARNESS_DIR:r.harnessPath},nodePath:r.nodePath,
   localInstances:()=>[{id:'smoke',baseUrl:`http://127.0.0.1:${server.address().port}/v1`,modelId:'runtime-test',context:32768,key:'test-only',vision:false,slots:1}],connections:()=>[],defaultLocalId:()=> 'smoke'});
  let output='';
  await bridge.runTurn({chatId:'smoke',message:'Reply RUNTIME_OK',workspacePath:dir,mode:'manual',thinking:'Off',onFrame:f=>{if(f.type==='error')throw Error(f.text||JSON.stringify(f));output+=JSON.stringify(f);}});
  if(!output.includes('RUNTIME_OK'))throw Error('No successful response from runtime: '+output.slice(-2000));
  console.log('Runtime session and streamed response passed');
 }finally{clearTimeout(timer);await bridge?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={smoke};
