import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import html from '../ui.cjs';
test('compact activity updates labels, retains expanded details and keeps approvals visible',async()=>{
 const dom=new JSDOM(html({nonce:'test',script:'chat.js',style:'chat.css',highlight:'code.js',source:'self'}),{runScripts:'outside-only'});
 const sent=[];dom.window.acquireVsCodeApi=()=>({postMessage:m=>sent.push(m)});
 dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const emit=tool=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:{type:'tool',tool}}));
 emit({id:'read1',name:'read',state:'running',args:{file_path:'/workspace/chat.js'}});
 const card=dom.window.document.querySelector('.tool');assert.equal(card.tagName,'DIV');assert.equal(card.querySelector('.activity-label').textContent,'Reading chat.js');assert.ok(card.querySelector('svg'));
 emit({id:'read1',name:'read',state:'done',args:{file_path:'/workspace/chat.js'},result:'file contents'});assert.equal(card.querySelector('.activity-label').textContent,'Read chat.js');assert.equal(card.querySelector('pre'),null);assert.equal(card.querySelector('.activity-chevron'),null);
 emit({id:'write1',name:'write',state:'proposed',args:{file_path:'test.js',content:'hello'}});
 const pending=dom.window.document.querySelectorAll('.tool')[1];assert.equal(pending.open,true);assert.match(pending.querySelector('summary').textContent,/Approval needed/);pending.querySelector(':scope > button').click();assert.equal(sent.at(-1).decision,'approve');
 emit({id:'write1',name:'write',state:'done',args:{file_path:'test.js'}});const completed=dom.window.document.querySelectorAll('.tool')[1];assert.equal(completed.tagName,'DIV');assert.equal(completed.querySelector(':scope > button'),null);assert.equal(completed.querySelector('summary'),null);assert.ok(completed.querySelector('.activity-file'));
 dom.window.close();
});

test('completed turns fold activity above the final answer and restore duration and tools',async()=>{
 const dom=new JSDOM(html({nonce:'test',script:'chat.js',style:'chat.css',highlight:'code.js',source:'self'}),{runScripts:'outside-only'});
 dom.window.acquireVsCodeApi=()=>({postMessage(){}});dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const emit=data=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data}));
 const transcript=[{role:'user',text:'Make a clock'},{role:'assistant',text:'I will read the file.'},{role:'tool',text:JSON.stringify({id:'r',name:'read',state:'done',args:{path:'clock.html'},result:'source'})},{role:'reasoning',text:'Consider the timer.'},{role:'assistant',text:'Added the clock.'},{role:'turn-summary',text:JSON.stringify({durationMs:81000})}];
 emit({type:'restore',mode:'manual',busy:false,transcript});
 const history=dom.window.document.getElementById('history'),group=history.querySelector('.turn-work');
 assert.equal(group.open,false);assert.equal(group.querySelector('.activity-label').textContent,'Worked for 1min 21s');
 assert.match(group.textContent,/I will read the file/);assert.match(group.textContent,/Read clock.html/);assert.doesNotMatch(group.textContent,/Consider the timer/);assert.doesNotMatch(group.textContent,/Thinking/);
 assert.equal(history.lastElementChild.textContent,'assistantAdded the clock.');assert.ok(!group.textContent.includes('Added the clock.'));
 group.open=true;assert.ok(group.querySelector('.tool'));emit({type:'entry',role:'user',text:'Thanks'});emit({type:'entry',role:'assistant',text:'You are welcome'});emit({type:'entry',role:'turn-summary',text:JSON.stringify({durationMs:3000})});
 assert.equal(history.querySelectorAll('.turn-work').length,2);assert.equal(history.querySelectorAll('.turn-work')[1].querySelector('.activity-label').textContent,'Worked for 3s');dom.window.close();
});

test('live elapsed header ticks, restores from start time and becomes the completed dropdown',async()=>{
 const dom=new JSDOM(html({nonce:'test',script:'chat.js',style:'chat.css',highlight:'code.js',source:'self'}),{runScripts:'outside-only'});
 dom.window.acquireVsCodeApi=()=>({postMessage(){}});let now=1000,tick;dom.window.Date.now=()=>now;dom.window.setTimeout=fn=>{tick=fn;return 1;};dom.window.clearTimeout=()=>{};
 dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const emit=data=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data}));
 emit({type:'entry',role:'user',text:'Do work'});emit({type:'busy',value:true});emit({type:'turnStarted',startedAt:1000});
 const history=dom.window.document.getElementById('history');assert.equal(history.querySelector('.working-title').textContent,'Working for 0s');
 now=2000;tick();assert.equal(history.querySelector('.working-title').textContent,'Working for 1s');
 now=63000;tick();assert.equal(history.querySelector('.working-title').textContent,'Working for 1min 2s');
 emit({type:'restore',mode:'manual',busy:true,turnStartedAt:1000,transcript:[{role:'user',text:'Do work'},{role:'assistant',text:'Progress'}]});
 assert.equal(history.children[1].className,'turn-work live-work');assert.equal(history.querySelector('.working-title').textContent,'Working for 1min 2s');
 emit({type:'entry',role:'turn-summary',text:JSON.stringify({durationMs:62000})});emit({type:'busy',value:false});
 assert.equal(history.querySelector('.live-work'),null);assert.equal(history.querySelector('.turn-work .activity-label').textContent,'Worked for 1min 2s');dom.window.close();
});

test('reasoning is never rendered or copied into chat DOM while commentary and tools keep their order',async()=>{
 const dom=new JSDOM(html({nonce:'test',script:'chat.js',style:'chat.css',highlight:'code.js',source:'self'}),{runScripts:'outside-only'});dom.window.acquireVsCodeApi=()=>({postMessage(){}});
 dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const emit=data=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data}));
 emit({type:'chunk',role:'reasoning',text:'SECRET reasoning'});emit({type:'chunk',role:'reasoning',text:' more secret'});
 emit({type:'entry',role:'assistant',text:'I will inspect the file.'});emit({type:'tool',tool:{id:'read',name:'read',state:'done',args:{path:'game.html'}}});emit({type:'entry',role:'assistant',text:'I found the problem.'});
 const history=dom.window.document.getElementById('history');assert.doesNotMatch(history.innerHTML,/SECRET|secret/);assert.equal(history.querySelectorAll('.thinking-marker').length,0);
 assert.deepEqual(Array.from(history.children).map(n=>n.className),['entry assistant','tool','entry assistant']);dom.window.close();
});

test('thinking disappears on commentary, tool activity, idle and completed restoration',async()=>{
 const dom=new JSDOM(html({nonce:'test',script:'chat.js',style:'chat.css',highlight:'code.js',source:'self'}),{runScripts:'outside-only'});dom.window.acquireVsCodeApi=()=>({postMessage(){}});dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const emit=data=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data})),marker=()=>dom.window.document.querySelector('.thinking-marker');
 emit({type:'entry',role:'reasoning',text:''});assert.ok(marker());emit({type:'chunk',role:'assistant',text:'Progress update'});assert.equal(marker(),null);
 emit({type:'status',text:'Working'});assert.match(dom.window.document.getElementById('history').textContent,/Progress update/);
 emit({type:'entry',role:'reasoning',text:''});assert.ok(marker());emit({type:'tool',tool:{id:'r',name:'read',state:'running',args:{path:'game.html'}}});assert.equal(marker(),null);
 emit({type:'entry',role:'reasoning',text:''});emit({type:'busy',value:false});assert.equal(marker(),null);
 emit({type:'restore',mode:'manual',busy:false,transcript:[{role:'reasoning',text:'old private text'}]});assert.equal(marker(),null);
 emit({type:'restore',mode:'manual',busy:true,transcript:[{role:'reasoning',text:''}]});assert.ok(marker());dom.window.close();
});

test('presentation bookkeeping is hidden live and on restore without hiding answers or approvals',async()=>{
 const dom=new JSDOM(html({nonce:'test',script:'chat.js',style:'chat.css',highlight:'code.js',source:'self'}),{runScripts:'outside-only'});dom.window.acquireVsCodeApi=()=>({postMessage(){}});dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const emit=data=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data}));const tool={id:'p',name:'present',verb:'Showed you a result',state:'done',args:{files:[{path:'timezones.html'}]}};
 emit({type:'tool',tool:{...tool,state:'running'}});emit({type:'tool',tool});assert.equal(dom.window.document.querySelector('.tool'),null);
 emit({type:'restore',mode:'manual',busy:false,transcript:[{role:'tool',text:JSON.stringify(tool)},{role:'assistant',text:'Created timezones.html'}]});assert.equal(dom.window.document.querySelector('.tool'),null);assert.match(dom.window.document.getElementById('history').textContent,/Created timezones.html/);
 emit({type:'tool',tool:{...tool,state:'proposed'}});assert.ok(dom.window.document.querySelector('.tool button'));emit({type:'tool',tool});assert.equal(dom.window.document.querySelector('.tool'),null);dom.window.close();
});

test('shell panels group consecutive commands, preserve approvals, copy literal output and restore',async()=>{
 const dom=new JSDOM(html({nonce:'test',script:'chat.js',style:'chat.css',highlight:'code.js',source:'self'}),{runScripts:'outside-only'});const sent=[];dom.window.acquireVsCodeApi=()=>({postMessage:m=>sent.push(m)});dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const emit=data=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data}));const a={id:'a',name:'bash',state:'done',args:{command:'echo hello'},result:'<script>literal</script>'},b={id:'b',name:'pwsh',state:'proposed',args:{command:'Get-Date'}};
 emit({type:'tool',tool:a});assert.equal(dom.window.document.querySelector('.command-group'),null);const panel=dom.window.document.querySelector('.shell-panel');assert.match(panel.textContent,/Shell/);assert.equal(panel.querySelector('script'),null);panel.querySelector('button').click();assert.equal(sent.at(-1).text,'$ echo hello\n<script>literal</script>');
 emit({type:'tool',tool:b});const group=dom.window.document.querySelector('.command-group');assert.equal(group.querySelectorAll('.tool').length,2);assert.equal(group.open,true);assert.equal(group.querySelector('.activity-label').textContent,'Running commands');emit({type:'tool',tool:{...b,state:'done',result:'today'}});assert.equal(group.querySelector('.activity-label').textContent,'Ran commands');
 emit({type:'entry',role:'assistant',text:'Next step'});emit({type:'tool',tool:{...a,id:'c'}});assert.equal(group.querySelectorAll('.tool').length,2);
 emit({type:'restore',mode:'manual',busy:false,transcript:[a,{...b,state:'done'}].map(tool=>({role:'tool',text:JSON.stringify(tool)}))});assert.equal(dom.window.document.querySelectorAll('.command-group .shell-panel').length,2);dom.window.close();
});

test('mixed actions update the group heading and file links route by recorded tool id',async()=>{
 const dom=new JSDOM(html({nonce:'test',script:'chat.js',style:'chat.css',highlight:'code.js',source:'self'}),{runScripts:'outside-only'});const sent=[];dom.window.acquireVsCodeApi=()=>({postMessage:m=>sent.push(m)});dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const emit=data=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data}));
 const tools=[{id:'r',name:'read',state:'done',args:{file_path:'/workspace/index.html'}},{id:'b',name:'bash',state:'done',args:{command:'ls'}},{id:'e',name:'edit',state:'running',args:{path:'/workspace/index.html'}},{id:'d',name:'delete_file',state:'done',args:{path:'/workspace/old.html'}}];
 tools.forEach(tool=>emit({type:'tool',tool}));const group=dom.window.document.querySelector('.command-group');assert.equal(group.querySelector('.activity-label').textContent,'Read files, ran commands, editing files, deleted files');
 emit({type:'tool',tool:{...tools[2],state:'done'}});assert.equal(group.querySelector('.activity-label').textContent,'Read files, ran commands, edited files, deleted files');
 const link=group.querySelector('.activity-file');assert.equal(link.textContent,'index.html');link.click();assert.equal(sent.at(-1).type,'openToolFile');assert.equal(sent.at(-1).id,'r');assert.equal(group.open,false);
 emit({type:'entry',role:'assistant',text:'Now verify'});emit({type:'tool',tool:{...tools[0],id:'r2'}});assert.equal(group.querySelectorAll('.tool').length,4);
 emit({type:'restore',mode:'manual',busy:false,transcript:tools.map(t=>({role:'tool',text:JSON.stringify({...t,state:'done'})}))});assert.equal(dom.window.document.querySelector('.command-group .activity-label').textContent,'Read files, ran commands, edited files, deleted files');dom.window.close();
});
test('command timer counts up and restores the frozen completed duration',async()=>{
 const dom=new JSDOM(html({nonce:'test',script:'chat.js',style:'chat.css',highlight:'code.js',source:'self'}),{runScripts:'outside-only'});dom.window.acquireVsCodeApi=()=>({postMessage(){}});let now=1000,tick;dom.window.Date.now=()=>now;dom.window.setTimeout=fn=>{tick=fn;return 1;};dom.window.clearTimeout=()=>{};dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const emit=data=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data}));const tool={id:'timer',name:'bash',state:'running',commandStartedAt:1000,args:{command:'npm test'}};
 emit({type:'tool',tool});assert.equal(dom.window.document.querySelector('.tool .activity-label').textContent,'Running command npm test');
 now=2000;tick();assert.equal(dom.window.document.querySelector('.command-elapsed').textContent,'Running command for 1s');
 now=63000;tick();assert.equal(dom.window.document.querySelector('.command-elapsed').textContent,'Running command for 1min 2s');
 const completed={...tool,state:'done',commandDurationMs:62000};emit({type:'tool',tool:completed});assert.equal(dom.window.document.querySelector('.command-elapsed').textContent,'Ran command for 1min 2s');
 now=999999;emit({type:'restore',mode:'manual',busy:false,transcript:[{role:'tool',text:JSON.stringify(completed)}]});assert.equal(dom.window.document.querySelector('.command-elapsed').textContent,'Ran command for 1min 2s');dom.window.close();
});

test('failed file actions show only error details without tool arguments or descriptive boilerplate',async()=>{
 const dom=new JSDOM(html({nonce:'test',script:'chat.js',style:'chat.css',highlight:'code.js',source:'self'}),{runScripts:'outside-only'});dom.window.acquireVsCodeApi=()=>({postMessage(){}});dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const emit=tool=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:{type:'tool',tool}}));
 const tool={id:'e',name:'edit',state:'error',effect:'Changes a file in the workspace.',preview:'/workspace/index.html',args:{file_path:'/workspace/index.html',old_string:'OLD_PAYLOAD',new_string:'NEW_PAYLOAD'},result:'The file could not be changed.\n\nDetails: cannot modify index.html: file has not been read — read the file, then retry'};
 emit(tool);const card=dom.window.document.querySelector('.tool');assert.equal(card.querySelector('pre').textContent,'Details: cannot modify index.html: file has not been read — read the file, then retry');assert.doesNotMatch(card.textContent,/OLD_PAYLOAD|NEW_PAYLOAD|Changes a file|The file could not be changed/);
 emit({...tool,result:'Permission denied'});assert.equal(card.querySelector('pre').textContent,'Permission denied');dom.window.close();
});

test('completed turn folds automatically opened failure groups and restores them collapsed',async()=>{
 const dom=new JSDOM(html({nonce:'test',script:'chat.js',style:'chat.css',highlight:'code.js',source:'self'}),{runScripts:'outside-only'});dom.window.acquireVsCodeApi=()=>({postMessage(){}});dom.window.eval(await readFile(new URL('../media/chat.js',import.meta.url),'utf8'));
 const emit=data=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data}));const failed={id:'e',name:'edit',state:'error',args:{path:'index.html'},result:'Details: read the file first'},read={id:'r',name:'read',state:'done',args:{path:'index.html'}};
 emit({type:'entry',role:'user',text:'Edit page'});emit({type:'tool',tool:failed});emit({type:'tool',tool:read});assert.equal(dom.window.document.querySelector('.command-group').open,true);
 emit({type:'entry',role:'assistant',text:'Finished'});emit({type:'entry',role:'turn-summary',text:JSON.stringify({durationMs:22000})});
 let outer=dom.window.document.querySelector('.turn-work');outer.open=true;assert.equal(outer.querySelector('.command-group').open,false);assert.equal(outer.querySelector('details.tool').open,false);
 emit({type:'restore',busy:false,mode:'manual',transcript:[{role:'user',text:'Edit page'},...[failed,read].map(t=>({role:'tool',text:JSON.stringify(t)})),{role:'assistant',text:'Finished'},{role:'turn-summary',text:JSON.stringify({durationMs:22000})}]});
 outer=dom.window.document.querySelector('.turn-work');outer.open=true;assert.equal(outer.querySelector('.command-group').open,false);outer.querySelector('.command-group').open=true;assert.equal(outer.querySelector('.command-group').open,true);dom.window.close();
});
