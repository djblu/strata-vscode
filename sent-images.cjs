'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {validateImages}=require('./image-attachments.cjs');
const validId=id=>typeof id==='string'&&/^[a-f0-9]{64}\.(png|jpeg|webp)$/.test(id);
async function saveImages(dir,images){
 const checked=validateImages(images);if(!checked.length)return [];
 await fs.mkdir(dir,{recursive:true,mode:0o700});
 let size=0;for(const entry of await fs.readdir(dir,{withFileTypes:true}))if(entry.isFile())size+=(await fs.stat(path.join(dir,entry.name))).size;
 const result=[];
 for(const image of checked){const [header,encoded]=image.url.split(','),bytes=Buffer.from(encoded,'base64');const ext=header.match(/image\/(png|jpeg|webp)/)[1],id=createHash('sha256').update(bytes).digest('hex')+'.'+ext;
  let exists=false;try{await fs.stat(path.join(dir,id));exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!exists){if(size+bytes.length>512*1024*1024)throw Error('Sent-image storage is full (512 MB).');await fs.writeFile(path.join(dir,id),bytes,{flag:'wx',mode:0o600});size+=bytes.length;}
  result.push({id,name:image.name});
 }
 return result;
}
module.exports={saveImages,validId};
