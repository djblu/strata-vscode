import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
class Element {
 constructor(){this.children=[];this.textContent='';this.value='';}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
 replaceChildren(){this.children=[];}
 addEventListener(){}
 remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);}
 querySelectorAll(){return this.children.filter(x=>x.tag==='button');}
}
test('1000 streamed chunks batch into a single text node and tool content remains text',async()=>{
 const elements=new Map();let listener;const sent=[];
 const sandbox={acquireVsCodeApi:()=>({postMessage:m=>sent.push(m)}),window:{addEventListener:(_,fn)=>listener=fn},setTimeout:()=>1,
 document:{getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:tag=>Object.assign(new Element(),{tag}),createTextNode:text=>({textContent:text})}};
 vm.runInNewContext(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'),sandbox);
 for(let i=0;i<1000;i++)listener({data:{type:'chunk',role:'assistant',text:'x'}});
 listener({data:{type:'status',text:'Done'}});
 const body=elements.get('history').children[0].children[1];
 assert.equal(body.children.length,1);assert.equal(body.children[0].textContent,'x'.repeat(1000));
 listener({data:{type:'tool',tool:{id:'write',name:'write',state:'proposed',preview:'file.txt',args:{content:'<script>bad()</script>'}}}});
 const card=elements.get('history').children[1];assert.match(card.children[1].textContent,/<script>bad\(\)<\/script>/);
 card.children[2].onclick();assert.equal(sent.at(-1).decision,'approve');assert.equal(card.children[3].disabled,true);
});
