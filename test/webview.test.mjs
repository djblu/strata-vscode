import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
class Element {
 constructor(){this.children=[];this.textContent='';this.value='';this.dataset={};this.classList={toggle(){}};}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
 replaceChildren(){this.children=[];}
 addEventListener(){}
 remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);}
 querySelectorAll(){return this.children.filter(x=>x.tag==='button');}
}
test('1000 streamed chunks preserve their text and tool content remains text',async()=>{
 const elements=new Map();let listener;const sent=[];
 const sandbox={acquireVsCodeApi:()=>({postMessage:m=>sent.push(m)}),window:{addEventListener:(_,fn)=>listener=fn},setTimeout:()=>1,clearTimeout:()=>{},
 document:{body:new Element(),getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:tag=>Object.assign(new Element(),{tag}),createTextNode:text=>({textContent:text})}};
 vm.runInNewContext(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'),sandbox);
 for(let i=0;i<1000;i++)listener({data:{type:'chunk',role:'assistant',text:'x'}});
 listener({data:{type:'status',text:'Done'}});
 const body=elements.get('history').children[0].children[1];
 assert.equal(body.textContent,'x'.repeat(1000));
 listener({data:{type:'tool',tool:{id:'write',name:'write',state:'proposed',preview:'file.txt',args:{content:'<script>bad()</script>'}}}});
 const card=elements.get('history').children[1];assert.match(card.children[1].textContent,/<script>bad\(\)<\/script>/);
 assert.equal(card.tag,'details');assert.equal(card.open,true);
 card.children[2].onclick();assert.equal(sent.at(-1).decision,'approve');assert.equal(card.children[3].disabled,true);
 listener({data:{type:'entry',role:'reasoning',text:'Private reasoning text'}});
 const reasoning=elements.get('history').children[2];assert.equal(reasoning.tag,'details');assert.notEqual(reasoning.open,true);assert.equal(reasoning.children[0].tag,'summary');
 listener({data:{type:'busy',value:true}});assert.equal(elements.get('send').hidden,true);assert.equal(elements.get('stop').hidden,false);
 listener({data:{type:'busy',value:false}});assert.equal(elements.get('send').hidden,false);assert.equal(elements.get('stop').hidden,true);
});
