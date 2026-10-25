import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
const require=createRequire(new URL('../extension.cjs',import.meta.url));
const {ChangeStore}=require('./change-store.cjs');
test('Undo confirmation covers deletion, preserves later edits, and opens immutable turn diffs',async()=>{
 const base=await mkdtemp(path.join(os.tmpdir(),'strata-undo-')),root=path.join(base,'workspace'),storage=path.join(base,'storage');await mkdir(root);
 await writeFile(path.join(root,'existing.txt'),'pre-existing user edit\n');
 const checkpoints=new ChangeStore(path.join(storage,'changes'));const before=await checkpoints.scan(root);await writeFile(path.join(root,'new.txt'),'created\n');await writeFile(path.join(root,'existing.txt'),'agent edit\n');const summary=await checkpoints.finish(before,'chat');
 const state=new Map([['activeChat','chat'],['savedChat:chat',{id:'chat',mode:'manual',transcript:[{role:'changes',text:JSON.stringify(summary)}]}]]);
 let receive,provider,confirmation,choice,applied=0;const errors=[],commands=[],edits=[];
 const uri=p=>({scheme:'file',fsPath:p,toString:()=>p});
 class WorkspaceEdit{deleteFile(...args){edits.push(['delete',...args]);}replace(...args){edits.push(['replace',...args]);}}
 const api={Uri:{file:uri,joinPath:(u,...p)=>uri(path.join(u.fsPath,...p)),from:({scheme,path:p})=>({toString:()=>scheme+':'+p})},WorkspaceEdit,Range:class{constructor(start,end){this.start=start;this.end=end;}},workspace:{workspaceFolders:[{uri:uri(root)}],isTrusted:true,textDocuments:[],getConfiguration:()=>({get:()=>''}),onDidChangeConfiguration:()=>({}),registerTextDocumentContentProvider:(scheme,p)=>{provider=p;return{};},openTextDocument:async uri=>({getText:()=>readFileSync(uri.fsPath,'utf8'),positionAt:n=>n}),applyEdit:async()=>{applied++;return true;}},window:{createOutputChannel:()=>({append(){}}),showWarningMessage:async(text,options)=>{confirmation={text,options};return choice;},showInformationMessage(){},showErrorMessage:e=>errors.push(e),registerWebviewViewProvider:(id,p)=>{p.resolveWebviewView({webview:{asWebviewUri:x=>x,postMessage(){},onDidReceiveMessage:fn=>receive=fn}});return{};}},commands:{registerCommand:()=>({}),executeCommand:async(...args)=>commands.push(args)}};
 const module={exports:{}};vm.runInNewContext(readFileSync(new URL('../extension.cjs',import.meta.url),'utf8'),{module,exports:module.exports,require:n=>n==='vscode'?api:require(n),setTimeout,clearTimeout});
 module.exports.activate({subscriptions:[],workspaceState:{get:(k,d)=>state.get(k)??d,update:async(k,v)=>state.set(k,v)},globalState:{get(){}},secrets:{},globalStorageUri:uri(storage),extensionUri:uri(base),extensionPath:base});
 await receive({type:'undoChanges',id:summary.id});assert.match(confirmation.options.detail,/delete 1 files/);assert.equal(applied,0);
 await receive({type:'viewChanges',id:summary.id,path:'new.txt'});assert.equal(commands.at(-1)[0],'vscode.diff');assert.equal(provider.provideTextDocumentContent(commands.at(-1)[2]),'created\n');
 await writeFile(path.join(root,'new.txt'),'later edit');choice='Undo changes';await receive({type:'undoChanges',id:summary.id});assert.equal(applied,0);assert.match(errors.at(-1),/changed after/);
 await writeFile(path.join(root,'new.txt'),'created\n');api.workspace.textDocuments=[{uri:uri(path.join(root,'existing.txt')),isDirty:true}];await receive({type:'undoChanges',id:summary.id});assert.equal(applied,0);assert.match(errors.at(-1),/unsaved edits/);api.workspace.textDocuments=[];await receive({type:'undoChanges',id:summary.id});assert.equal(applied,1);assert.equal(edits.find(e=>e[0]==='replace')[3],'pre-existing user edit\n');assert.ok(edits.some(e=>e[0]==='delete'));assert.equal((await checkpoints.load(summary.id,'chat')).undone,true);
});
