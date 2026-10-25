const {diffLines}=require('diff');
exports.lineStats=(before,after)=>{
 const parts=diffLines(before,after,{timeout:100,maxEditLength:5000});
 if(!parts)return {added:null,removed:null};
 return parts.reduce((s,p)=>({added:s.added+(p.added?p.count:0),removed:s.removed+(p.removed?p.count:0)}),{added:0,removed:0});
};
