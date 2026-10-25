import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {normalizeAddress,listModels} from '../connection.cjs';
test('normalizes addresses and rejects embedded credentials and unsafe URL forms',()=>{
 assert.equal(normalizeAddress('10.70.70.24:8081'),'http://10.70.70.24:8081/v1');
 assert.equal(normalizeAddress('https://example.test/api/v1/'),'https://example.test/api/v1');
 for(const v of ['','ftp://example.test','http://user:password@example.test','http://host/?key=secret','http://host/#x'])assert.throws(()=>normalizeAddress(v));
});
test('discovers models with a bearer key and does not forward it across redirects',async()=>{
 let leaked=false;const server=createServer((req,res)=>{
  if(req.url==='/v1/models'&&req.headers.authorization==='Bearer test-secret'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'model-a'}]}));}
  else if(req.url==='/redirect/models'){res.writeHead(302,{Location:'/leak'});res.end();}
  else if(req.url==='/leak'){leaked=true;res.end('{}');}
  else {res.writeHead(401);res.end('test-secret');}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 try{assert.equal((await listModels(base,'test-secret'))[0].id,'model-a');await assert.rejects(listModels(base,'bad'),/rejected the API key/);await assert.rejects(listModels(base+'/redirect','test-secret'),/Cannot reach/);assert.equal(leaked,false);}finally{await new Promise(resolve=>server.close(resolve));}
});
