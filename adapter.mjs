import readline from 'node:readline';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir, realpath} from 'node:fs/promises';
import {validate} from './protocol.cjs';
import {permissionContext} from './permission-context.cjs';
const output = process.stdout.write.bind(process.stdout);
console.log = (...args) => console.error(...args);
let bridge, config, initializing, closing = false;
const active = new Set();
const compacting = new Set();
function emit(event) { output(JSON.stringify(event) + '\n'); }
async function initialize(c) {
  config = c;
  const url = new URL(c.baseURL);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('Invalid API URL');
  config.workspace = await realpath(c.workspace);
  await mkdir(c.dataDir, {recursive: true, mode: 0o700});
  const {createAgentBridge} = await import(pathToFileURL(path.join(c.sourcePath, 'apps/host/server/agent/agent-bridge.mjs')));
  bridge = createAgentBridge({dataDir: c.dataDir, gate: true,
    env: {...process.env, STRATA_HARNESS_DIR: c.harnessPath}, nodePath: process.execPath,
    localInstances: () => [{id: 'vscode', baseUrl: c.baseURL, modelId: c.model, context: c.contextWindow, key: c.apiKey, vision: false, slots: 1}],
    connections: () => [], defaultLocalId: () => 'vscode'});
  const status = bridge.status();
  if (status.state === 'unavailable') throw Error(status.reason || 'Harness unavailable');
  emit({type: 'ready'});
}
async function handle(m) {
  if (closing) throw Error('Harness is stopping');
  if (m.type === 'init') {
    if (initializing) throw Error('Already initialized');
    initializing = initialize(m.config); await initializing; return;
  }
  await initializing;
  if (!bridge) throw Error('Initialize first');
  validate(m);
  if (m.type === 'send') {
    if (active.size) throw Error('A turn is already running');
    active.add(m.chatId);
    try {
      const options={chatId:m.chatId,message:m.text,workspacePath:config.workspace,mode:m.mode,thinking:config.thinking,
        onFrame:frame=>emit({type:'frame',chatId:m.chatId,frame})};
      if(/^\/compact(?:\s|$)/.test(m.text.trim())) {
        if(m.text.trim()!=='/compact')throw Error('Use /compact without additional text.');
        if(typeof bridge.compactCommand!=='function')throw Error('This Strata bridge does not support /compact.');
        compacting.add(m.chatId);
        options.onFrame({type:'status',phase:'compacting',code:'compacting',manual:true,text:'Compressing context…'});
        try {
          await bridge.compactCommand(options);
          // The bridge command reports a summary but does not emit an updated token count.
          try {
            const sessionId=bridge.sessionOf(m.chatId),runtime=bridge._debug().rt;
            if(!sessionId||!runtime?.gw)throw Error('No active session');
            const response=await runtime.gw.rpc('commands/execute',{agentId:sessionId,line:'/strata-context',submittedAttachments:[]});
            if(response?.result?.kind!=='success')throw Error('Context unavailable');
            const count=JSON.parse(response.result.text);
            if(!Number.isFinite(count.tokens)||count.tokens<0)throw Error('Context unavailable');
            options.onFrame({type:'context',contextTokens:Math.round(count.tokens),contextMax:Number(count.window)||config.contextWindow});
          } catch {options.onFrame({type:'context',unavailable:true});}
        } finally {compacting.delete(m.chatId);}
      } else await bridge.runTurn({...options,message:permissionContext(m.text,m.mode)});
    } finally { active.delete(m.chatId); emit({type: 'idle', chatId: m.chatId}); }
  } else if (m.type === 'approve') {
    await bridge.approve({chatId: m.chatId, callId: m.callId, decision: m.decision});
  } else if (m.type === 'stop') {
    if(compacting.has(m.chatId))throw Error('Manual compaction is still running; wait for it to finish.');
    emit({type: 'stopped', chatId: m.chatId, result: await bridge.stop(m.chatId)});
  } else if (m.type === 'status') emit({type: 'status', status: bridge.status()});
  else await shutdown();
}
async function shutdown() {
  if (closing) return; closing = true;
  try { await Promise.all([...active].map(id => bridge.stop(id))); await bridge?.close(); }
  finally { process.exit(0); }
}
readline.createInterface({input: process.stdin}).on('line', line => {
  if (line.length > 1200000) return emit({type: 'error', text: 'Request too large'});
  let m; try { m = JSON.parse(line); } catch { return emit({type: 'error', text: 'Invalid JSON'}); }
  handle(m).catch(e => emit({type: 'error', chatId: m.chatId, text: String(e.message).split(config?.apiKey || '\0').join('[redacted]')}));
}).on('close', shutdown);
process.on('SIGTERM', shutdown);
