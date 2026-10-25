'use strict';
const {randomUUID}=require('node:crypto');
const {validateProfile}=require('./profile-connection.cjs');
const KEY='strata.connections.v1';
class SavedConnections{
 constructor(secrets){this.secrets=secrets;this.queue=Promise.resolve();}
 async read(){const raw=await this.secrets.get(KEY);if(!raw)return {profiles:[],defaultId:null};const data=JSON.parse(raw);if(!Array.isArray(data.profiles))throw Error('Saved Strata connections are invalid');for(const p of data.profiles)validateProfile(p);return data;}
 async get(id){const data=await this.read();return data.profiles.find(p=>p.id===(id||data.defaultId));}
 async save(profile){const work=this.queue.then(async()=>{const data=await this.read();const p={...profile,id:profile.id||randomUUID()};validateProfile(p);data.profiles=data.profiles.filter(x=>x.id!==p.id);data.profiles.push(p);data.defaultId=p.id;await this.secrets.store(KEY,JSON.stringify(data));return p;});this.queue=work.catch(()=>{});return work;}
 async select(id){const p=await this.get(id);if(!p)throw Error('Saved connection no longer exists');return this.save(p);}
}
module.exports={SavedConnections};
