import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,symlink,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {JSDOM} from 'jsdom';
import html from '../ui.cjs';
import {workspaceReferences,gitChanges} from '../context-attachments.cjs';
test('context references stay in workspace and git snapshot includes staged and unstaged changes',async()=>{
 const root=await mkdtemp(tmpdir()+'/strata-context-');
 try{
  await mkdir(root+'/workspace');await writeFile(root+'/outside','private');await symlink(root+'/outside',root+'/workspace/link');
  await assert.rejects(workspaceReferences(root+'/workspace',[root+'/workspace/link']),/inside the workspace/);
  const refs=await workspaceReferences(root,[root+'/workspace',root+'/outside']);assert.match(refs,/Folder:/);assert.match(refs,/File:/);assert.doesNotMatch(refs,/private/);
  const git=(...args)=>execFileSync('git',['-C',root,...args]);git('init','-q');await writeFile(root+'/tracked','staged\n');git('add','tracked');await writeFile(root+'/tracked','unstaged\n');
  const diff=await gitChanges(root);assert.match(diff,/Staged changes:/);assert.match(diff,/Unstaged changes:/);assert.match(diff,/\+unstaged/);assert.doesNotMatch(diff,/private/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('add menu routes context actions, plan preserves draft, compaction animates only in progress',async()=>{
 const dom=new JSDOM(html({nonce:'x',source:'self'}),{runScripts:'outside-only'});const sent=[];dom.window.acquireVsCodeApi=()=>({postMessage:m=>sent.push(m)});
 dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const $=id=>dom.window.document.getElementById(id);const emit=data=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data}));
 for(const kind of ['files','git']){$('add-context').click();$('add-'+kind).click();assert.equal(sent.at(-1).type,'add-'+kind);assert.equal($('add-menu').hidden,true);}
 $('prompt').value='My task';$('add-context').click();$('add-plan').click();assert.equal(sent.at(-1).mode,'plan');assert.match($('prompt').value,/My task/);assert.match($('prompt').value,/do not make changes/);
 emit({type:'contextInfo',compacting:true});assert.equal($('compaction').hidden,false);assert.equal($('compaction').classList.contains('shimmer'),true);
 emit({type:'contextInfo',compacting:false});emit({type:'entry',role:'compaction',text:'Context automatically compacted'});assert.equal($('compaction').hidden,true);assert.match($('history').textContent,/Context automatically compacted/);assert.ok($('history').querySelector('.compaction svg'));
 emit({type:'busy',value:true});assert.equal($('add-context').disabled,true);dom.window.close();
});
