'use strict';
function validateImages(images=[]){
 if(!Array.isArray(images)||images.length>4)throw Error('Attach up to four images per message.');
 let total=0;
 return images.map(image=>{
  const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(image?.url||''));
  if(!match||match[2].length>7*1024*1024)throw Error('Use PNG, JPEG or WebP images up to 5 MB each.');
  const data=Buffer.from(match[2],'base64');total+=data.length;
  const valid=match[1]==='image/png'?data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='image/jpeg'?data[0]===255&&data[1]===216&&data[2]===255:data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP';
  if(!valid||data.length>5*1024*1024||total>16*1024*1024)throw Error('Invalid image or attachment limit exceeded (5 MB each, 16 MB total).');
  return {name:String(image.name||'Picture').slice(0,120),url:image.url};
 });
}
module.exports={validateImages};
