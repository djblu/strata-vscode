import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ChatStore} from '../chat-store.cjs';
function memory(){const data=new Map();return {get:(key,fallback)=>data.has(key)?data.get(key):fallback,update:async(key,value)=>{await new Promise(r=>setTimeout(r,1));data.set(key,structuredClone(value));}};}
test('saves independent resumable sessions, snapshots streaming state and serializes concurrent writes',async()=>{
 const state=memory();const store=new ChatStore(state);const transcript=[{role:'user',text:'Fix the server'}];
 const first=store.save({id:'a',transcript,contextInfo:{used:42}});transcript[0].text='changed after save';
 const second=store.save({id:'b',transcript:[{role:'user',text:'Another task'}],contextInfo:{used:75}});
 await Promise.all([first,second]);const reopened=new ChatStore(state);
 assert.equal(reopened.list().length,2);assert.equal(reopened.load('a').transcript[0].text,'Fix the server');assert.equal(reopened.load('a').contextInfo.used,42);assert.equal(state.get('activeChat'),'b');
 await reopened.rename('a','Production fix');await reopened.save(reopened.load('a'));assert.equal(reopened.list().find(c=>c.id==='a').title,'Production fix');assert.equal(state.get('activeChat'),'a');assert.equal(reopened.load('b').transcript[0].text,'Another task');
});

test('an empty saved chat gets its first prompt title',async()=>{
 const store=new ChatStore(memory());await store.save({id:'a',transcript:[],contextInfo:{}});
 await store.save({id:'a',transcript:[{role:'user',text:'Build my app'}],contextInfo:{}});assert.equal(store.list()[0].title,'Build my app');
});

test('saving an unchanged chat preserves its activity date',async()=>{
 const store=new ChatStore(memory());const chat={id:'a',transcript:[{role:'user',text:'Hello'}],contextInfo:{}};
 await store.save(chat);const before=store.list()[0].updatedAt;
 await new Promise(r=>setTimeout(r,10));await store.save(chat);assert.equal(store.list()[0].updatedAt,before);
 chat.transcript.push({role:'assistant',text:'Hi'});await store.save(chat);assert.ok(store.list()[0].updatedAt>before);
});

test('permission choices persist per conversation',async()=>{
 const state=memory(),store=new ChatStore(state);
 await store.save({id:'a',mode:'bypass',transcript:[],contextInfo:{}});await store.save({id:'b',mode:'manual',transcript:[],contextInfo:{}});
 const restored=new ChatStore(state);assert.equal(restored.load('a').mode,'bypass');assert.equal(restored.load('b').mode,'manual');
});
test('deleting a chat removes its transcript, preserves others and ignores delayed saves',async()=>{
 const state=memory(),store=new ChatStore(state),a={id:'a',transcript:[{role:'user',text:'Delete me'}]};
 await store.save({id:'b',transcript:[{role:'user',text:'Keep me'}]});await store.save(a);
 const pending=store.save(a),remove=store.remove('a'),late=store.save(a);await Promise.all([pending,remove,late]);
 const reopened=new ChatStore(state);assert.deepEqual(reopened.list().map(x=>x.id),['b']);assert.equal(reopened.load('a'),undefined);assert.equal(state.get('activeChat'),undefined);assert.equal(reopened.load('b').transcript[0].text,'Keep me');
});
