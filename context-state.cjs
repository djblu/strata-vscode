'use strict';
function updateContext(previous, frame) {
  const state={...previous};
  if(Number.isFinite(frame.contextMax)&&frame.contextMax>0)state.max=frame.contextMax;
  if(Number.isFinite(frame.contextTokens)&&frame.contextTokens>=0)state.used=frame.contextTokens;
  if(frame.type==='status')state.compacting=frame.phase==='compacting'||frame.code==='compacting';
  if(frame.noteReason==='compacted'||['done','error','idle'].includes(frame.type))state.compacting=false;
  return state;
}
function externalURL(value) {
  if(typeof value!=='string'||value.length>8192)return null;
  try {const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
module.exports={updateContext,externalURL};
