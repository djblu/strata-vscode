'use strict';
const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..');const source=path.join(root,'node_modules/pdfjs-dist');const dest=path.join(root,'media/pdfjs');
fs.mkdirSync(dest,{recursive:true});
for(const [from,to] of [['legacy/build/pdf.min.mjs','pdf.mjs'],['legacy/build/pdf.worker.min.mjs','pdf.worker.mjs'],['LICENSE','LICENSE']])fs.copyFileSync(path.join(source,from),path.join(dest,to));
for(const folder of ['cmaps','standard_fonts','wasm'])fs.cpSync(path.join(source,folder),path.join(dest,folder),{recursive:true});
