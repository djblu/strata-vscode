'use strict';
function normalizeAddress(value){
  let text=String(value||'').trim();if(!text)throw Error('Enter a server address including its port');
  if(text.includes('://')&&!/^https?:\/\//i.test(text))throw Error('Use HTTP or HTTPS');
  if(!/^https?:\/\//i.test(text))text='http://'+text;
  let url;try{url=new URL(text);}catch{throw Error('Enter a valid HTTP or HTTPS server address');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('Use an HTTP(S) address without credentials, query or fragment');
  url.pathname=url.pathname.replace(/\/+$/,'');if(!url.pathname||url.pathname==='/')url.pathname='/v1';
  return url.href.replace(/\/$/,'');
}
async function listModels(baseURL,key){
  let response;try{response=await fetch(normalizeAddress(baseURL)+'/models',{headers:key?{Authorization:'Bearer '+key}:{},signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw Error('Cannot reach the server from this extension host. Check address, port and network access.');}
  if(response.status===401||response.status===403)throw Error('The server rejected the API key');
  if(!response.ok)throw Error('Model discovery failed (HTTP '+response.status+')');
  const body=await response.json();const models=(Array.isArray(body.data)?body.data:[]).filter(m=>typeof m.id==='string'&&m.id.length>0);
  if(!models.length)throw Error('The server returned no models');return models;
}
module.exports={normalizeAddress,listModels};
