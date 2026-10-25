'use strict';
class ChatStore {
  constructor(state){this.state=state;this.queue=Promise.resolve();}
  list(){return this.state.get('savedChats',[]).slice().sort((a,b)=>b.updatedAt-a.updatedAt);}
  load(id){return this.state.get('savedChat:'+id);}
  save(chat){
    const snapshot=JSON.parse(JSON.stringify(chat));
    const task=this.queue.then(async()=>{
      const old=this.list().find(item=>item.id===snapshot.id);
      const previous=this.load(snapshot.id);
      const changed=!previous||previous.transcript.length!==snapshot.transcript.length||previous.transcript.at(-1)?.text!==snapshot.transcript.at(-1)?.text;
      const first=snapshot.transcript.find(item=>item.role==='user')?.text;
      const metadata={id:snapshot.id,title:old?.customTitle?old.title:(first?.replace(/\s+/g,' ').trim().slice(0,80)||old?.title||'New chat'),customTitle:old?.customTitle||false,updatedAt:changed?Date.now():(old?.updatedAt||Date.now())};
      await this.state.update('savedChat:'+snapshot.id,snapshot);
      await this.state.update('savedChats',[metadata,...this.list().filter(item=>item.id!==snapshot.id)]);
      await this.state.update('activeChat',snapshot.id);
    });
    this.queue=task.catch(()=>{});return task;
  }
  rename(id,title){
    const task=this.queue.then(async()=>{const list=this.list();const item=list.find(item=>item.id===id);if(!item)throw Error('Chat not found');item.title=title;item.customTitle=true;await this.state.update('savedChats',list);});
    this.queue=task.catch(()=>{});return task;
  }
}
module.exports={ChatStore};
