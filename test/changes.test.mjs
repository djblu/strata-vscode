import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,symlink,chmod} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {JSDOM} from 'jsdom';
import html from '../ui.cjs';
import storeModule from '../change-store.cjs';
const {ChangeStore}=storeModule;
async function fixture(options){const base=await mkdtemp(path.join(os.tmpdir(),'strata-changes-'));const root=path.join(base,'workspace');await mkdir(root);return {root,store:new ChangeStore(path.join(base,'snapshots'),options)};}
test('turn snapshots preserve existing edits and survive restart; reject later edits and other chats',async()=>{
 const {root,store}=await fixture();await writeFile(path.join(root,'a.txt'),'pre-existing user edit\r\n');
 const before=await store.scan(root);await writeFile(path.join(root,'a.txt'),'agent edit\r\n');await writeFile(path.join(root,'new.txt'),'new\n');
 const summary=await store.finish(before,'chat');assert.equal(summary.files.length,2);assert.equal(summary.added,2);assert.equal(summary.removed,1);
 const record=await new ChangeStore(store.dir).load(summary.id,'chat');assert.equal(record.files.find(f=>f.path==='a.txt').before.text,'pre-existing user edit\r\n');await store.validateUndo(record);
 await assert.rejects(store.load(summary.id,'another'),/another chat/);
 await writeFile(path.join(root,'a.txt'),'later user edit');await assert.rejects(store.validateUndo(record),/changed after/);
 assert.equal(await readFile(path.join(root,'a.txt'),'utf8'),'later user edit');
});
test('uncaptured and dirty files cannot become false additions; symlinks and escapes are refused',async()=>{
 const {root,store}=await fixture({maxFile:20});await writeFile(path.join(root,'large'),'x'.repeat(30));await writeFile(path.join(root,'dirty'),'user');await writeFile(path.join(root,'.env'),'SECRET');
 const before=await store.scan(root,[path.join(root,'dirty')]);await writeFile(path.join(root,'large'),'short');await writeFile(path.join(root,'dirty'),'saved');await writeFile(path.join(root,'.env'),'NEW_SECRET');
 assert.equal(await store.finish(before,'chat'),null);
 await assert.rejects(store.safePath(root,'../outside'),/outside/);
 if(process.platform!=='win32'){await symlink(os.tmpdir(),path.join(root,'escape'));await assert.rejects(store.safePath(root,'escape/file'),/Symbolic/);}
});
test('incomplete scans never offer to delete files not captured before the turn',async()=>{
 const {root,store}=await fixture({maxBytes:2});await writeFile(path.join(root,'a'),'abcd');const before=await store.scan(root);assert.equal(before.partial,true);
 await writeFile(path.join(root,'a'),'x');assert.equal(await store.finish(before,'chat'),null);
 await writeFile(path.join(root,'b'),'x');const summary=await store.finish(before,'chat');assert.deepEqual(summary.files.map(f=>f.path),['b']);
});
test('UTF-8 BOM, CRLF and executable mode survive snapshots; permission changes refuse undo',async()=>{
 const {root,store}=await fixture();const file=path.join(root,'script');await writeFile(file,'\uFEFFa\r\n');await chmod(file,0o755);const before=await store.scan(root);await writeFile(file,'\uFEFFb\r\n');
 const summary=await store.finish(before,'chat'),record=await store.load(summary.id,'chat');assert.equal(record.files[0].before.text,'\uFEFFa\r\n');await store.validateUndo(record);
 if(process.platform!=='win32'){await chmod(file,0o644);await assert.rejects(store.validateUndo(record),/changed after/);}
});
test('change card restores safely, expands files, routes diffs and disables undo during work',async()=>{
 const dom=new JSDOM(html({nonce:'test',script:'chat.js',style:'chat.css',highlight:'code.js',source:'self'}),{runScripts:'outside-only'});const sent=[];dom.window.acquireVsCodeApi=()=>({postMessage:m=>sent.push(m)});
 dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const emit=data=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data}));
 const summary={id:'id',added:4,removed:0,files:Array.from({length:4},(_,i)=>({path:i===0?'<img onerror=evil()>':`file${i}`,added:1,removed:0,kind:'added',undoable:true}))};
 emit({type:'restore',mode:'manual',busy:false,transcript:[{role:'changes',text:JSON.stringify(summary)}]});
 const card=dom.window.document.querySelector('.change-summary');assert.equal(card.querySelector('img'),null);assert.equal(card.querySelectorAll('.change-file:not([hidden])').length,3);
 card.querySelector('.show-changes').click();assert.equal(card.querySelectorAll('.change-file:not([hidden])').length,4);
 card.querySelector('.change-file button').click();assert.equal(sent.at(-1).type,'viewChanges');
 const undo=card.querySelector('.undo-changes');undo.click();assert.equal(sent.at(-1).type,'undoChanges');emit({type:'busy',value:true});assert.equal(undo.disabled,true);
 emit({type:'changeUpdated',summary:{...summary,undone:true}});emit({type:'busy',value:false});assert.equal(card.querySelector('.undo-changes').disabled,true);dom.window.close();
});

test('large nested trees cannot starve root files of checkpoints',async()=>{
 const {root,store}=await fixture({maxFiles:12});await mkdir(path.join(root,'aaa-large'));
 for(let i=0;i<30;i++)await writeFile(path.join(root,'aaa-large',String(i)),'noise');
 await writeFile(path.join(root,'tetris.html'),'old clock\n');
 const before=await store.scan(root);assert.equal(before.partial,true);assert.ok(before.files.has('tetris.html'));
 await writeFile(path.join(root,'tetris.html'),'new clock\n');
 const summary=await store.finish(before,'chat');assert.deepEqual(summary.files.map(f=>f.path),['tetris.html']);
});
test('live checkpoints update one task diff without losing the original baseline',async()=>{
 const {root,store}=await fixture();await writeFile(path.join(root,'clock.html'),'original\n');const before=await store.scan(root);
 await writeFile(path.join(root,'clock.html'),'intermediate\n');const first=await store.finish(before,'chat');
 await writeFile(path.join(root,'clock.html'),'finished\n');const second=await store.finish(before,'chat');assert.equal(first.id,second.id);
 const record=await store.load(second.id,'chat');assert.equal(record.files[0].before.text,'original\n');assert.equal(record.files[0].after.text,'finished\n');
 const diff=await readFile(path.join(store.dir,second.id+'.diff'),'utf8');assert.match(diff,/-original/);assert.match(diff,/\+finished/);assert.doesNotMatch(diff,/intermediate/);
 await writeFile(path.join(root,'clock.html'),'original\n');const reverted=await store.finish(before,'chat');assert.equal(reverted.id,first.id);assert.equal(reverted.files.length,0);assert.equal(await readFile(path.join(store.dir,first.id+'.diff'),'utf8'),'');
});

test('new root files and new directories get diffs when unrelated trees exceed scan limits',async()=>{
 const {root,store}=await fixture({maxFiles:5});await mkdir(path.join(root,'aaa-large'));
 for(let i=0;i<20;i++)await writeFile(path.join(root,'aaa-large',String(i)),'noise');
 const before=await store.scan(root);assert.equal(before.partial,true);
 await writeFile(path.join(root,'pacman.html'),'<html>new game</html>\n');
 await mkdir(path.join(root,'new-game'));await writeFile(path.join(root,'new-game','index.html'),'new page\n');
 // The nested file may be beyond the content scan, but its absence can be proved.
 assert.equal(store.wasAbsent(before,path.join('new-game','index.html')),true);
 const summary=await store.finish(before,'chat');assert.ok(summary.files.some(f=>f.path==='pacman.html'&&f.kind==='added'));
 const record=await store.load(summary.id,'chat');assert.equal(record.files.find(f=>f.path==='pacman.html').before,null);await store.validateUndo(record);
 assert.match(await readFile(path.join(store.dir,summary.id+'.diff'),'utf8'),/\+<html>new game/);
});
test('an unvisited existing directory cannot prove a file was absent',async()=>{
 const {root,store}=await fixture({maxFiles:1});await mkdir(path.join(root,'existing'));await writeFile(path.join(root,'existing','old.txt'),'user data');
 const before=await store.scan(root);assert.equal(before.partial,true);assert.equal(store.wasAbsent(before,path.join('existing','old.txt')),false);
 store.maxFiles=100;await writeFile(path.join(root,'existing','old.txt'),'changed');assert.equal(await store.finish(before,'chat'),null);
});
