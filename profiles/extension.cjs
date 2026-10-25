'use strict';
const vscode=require('vscode');
const {randomUUID}=require('node:crypto');
const {normalizeAddress}=require('./connection.cjs');
function activate(context){
 const list=()=>context.globalState.get('profiles',[]);
 const trusted=()=>{if(!vscode.workspace.isTrusted)throw Error('Trust this workspace before using connection profiles');};
 async function resolve(id){
  trusted();const p=list().find(p=>p.id===id);if(!p)throw Error('Local connection profile no longer exists. Use Change connection to select another.');
  const apiKey=await context.secrets.get('profile:'+id);if(apiKey===undefined)throw Error('Profile key is missing. Edit it in Strata: Manage Local Connection Profiles.');
  return {...p,apiKey};
 }
 async function edit(old){
  trusted();
  const name=await vscode.window.showInputBox({title:'Local Strata profile · Name',value:old?.name||'',placeHolder:'Strata — Swift 1.5',ignoreFocusOut:true,validateInput:v=>!v.trim()?'Enter a profile name':undefined});if(name===undefined)return;
  const address=await vscode.window.showInputBox({title:'Local Strata profile · Server address',value:old?.baseURL||'',prompt:'Address reachable from the SSH hosts that will use this profile',ignoreFocusOut:true,validateInput:v=>{try{normalizeAddress(v);}catch(e){return e.message;}}});if(address===undefined)return;
  const model=await vscode.window.showInputBox({title:'Local Strata profile · Model ID',value:old?.model||'',placeHolder:'swift-1.5-q4_k_m',ignoreFocusOut:true,validateInput:v=>!v.trim()?'Enter the exact server model ID':undefined});if(model===undefined)return;
  const limit=await vscode.window.showInputBox({title:'Local Strata profile · Context window',value:String(old?.contextWindow||32768),prompt:'Token capacity configured on the model server',ignoreFocusOut:true,validateInput:v=>!/^\d+$/.test(v)||+v<4096||+v>2097152?'Enter a whole number from 4096 to 2097152':undefined});if(limit===undefined)return;
  const existing=old?await context.secrets.get('profile:'+old.id):undefined;
  const key=await vscode.window.showInputBox({title:'Local Strata profile · API key',prompt:existing!==undefined?'Leave blank to keep the saved key':'Stored securely on this PC. Leave blank only for an unauthenticated server.',password:true,ignoreFocusOut:true});if(key===undefined)return;
  const p={id:old?.id||randomUUID(),name:name.trim(),baseURL:normalizeAddress(address),model:model.trim(),contextWindow:+limit};
  await context.secrets.store('profile:'+p.id,key.trim()||existing||'');
  try{await context.globalState.update('profiles',[...list().filter(x=>x.id!==p.id),p]);}catch(e){if(existing===undefined)await context.secrets.delete('profile:'+p.id);else await context.secrets.store('profile:'+p.id,existing);throw e;}
  return p;
 }
 async function pick(){
  trusted();const selected=await vscode.window.showQuickPick([...list().map(p=>({label:p.name,description:p.model,detail:p.baseURL,id:p.id})),{label:'$(add) Add a connection profile…',add:true}],{title:'Choose a local Strata profile',ignoreFocusOut:true});
  if(!selected)return;
  const p=selected.add?await edit():list().find(x=>x.id===selected.id);
  return p?resolve(p.id):undefined;
 }
 async function manage(){
  trusted();const selected=await vscode.window.showQuickPick([...list().map(p=>({label:p.name,description:p.model,id:p.id})),{label:'$(add) Add a connection profile…',add:true}],{title:'Manage profiles stored on this PC'});if(!selected)return;
  if(selected.add){await edit();return;}
  const old=list().find(p=>p.id===selected.id);const action=await vscode.window.showQuickPick(['Edit profile','Delete profile'],{title:old.name});
  if(action==='Edit profile')await edit(old);
  if(action==='Delete profile'){
   await context.globalState.update('profiles',list().filter(p=>p.id!==old.id));await context.secrets.delete('profile:'+old.id);
  }
 }
 context.subscriptions.push(vscode.commands.registerCommand('strataProfiles.pick',pick),vscode.commands.registerCommand('strataProfiles.resolve',resolve),vscode.commands.registerCommand('strataProfiles.manage',async()=>{try{await manage();}catch(e){vscode.window.showErrorMessage('Strata profiles: '+e.message);}}));
}
module.exports={activate};
