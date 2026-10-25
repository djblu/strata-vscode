import {test} from 'node:test';
import assert from 'node:assert/strict';
import state from '../context-state.cjs';
test('usage survives status events, compaction clears on completion, invalid counts ignored',()=>{
 let s=state.updateContext({}, {type:'context',contextTokens:200000,contextMax:262144});
 s=state.updateContext(s,{type:'status',phase:'compacting'});assert.equal(s.compacting,true);assert.equal(s.used,200000);
 s=state.updateContext(s,{type:'context',contextTokens:30000});assert.equal(s.compacting,true);
 s=state.updateContext(s,{type:'delta',noteReason:'compacted'});assert.equal(s.compacting,false);assert.equal(s.max-s.used,232144);
 s=state.updateContext(s,{type:'done',tokensIn:900000,contextTokens:null,contextMax:0});assert.equal(s.used,30000);assert.equal(s.max,262144);
 assert.equal(state.updateContext({...s,compacting:true},{type:'error'}).compacting,false);
});
test('external links only permit HTTP(S), with no embedded credentials',()=>{
 for(const value of ['command:workbench.action.terminal.new','javascript:alert(1)','file:///etc/passwd','https://user:password@example.com',null])assert.equal(state.externalURL(value),null);
 assert.equal(state.externalURL('https://github.com/djblu/strata-vscode'),'https://github.com/djblu/strata-vscode');
});
