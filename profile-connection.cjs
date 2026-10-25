'use strict';
const {normalizeAddress}=require('./connection.cjs');
function validateProfile(p){
 if(!p||typeof p.id!=='string'||!p.id||typeof p.name!=='string'||typeof p.model!=='string'||!p.model.trim()||typeof p.apiKey!=='string'||!Number.isInteger(p.contextWindow)||p.contextWindow<4096||p.contextWindow>2097152)throw Error('Invalid local connection profile. Edit it in Manage Local Connection Profiles.');
 return {connection:{profileId:p.id,name:p.name,baseURL:normalizeAddress(p.baseURL),model:p.model,contextWindow:p.contextWindow},apiKey:p.apiKey};
}
module.exports={validateProfile};
