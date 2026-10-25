import readline from 'node:readline';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir, realpath} from 'node:fs/promises';
import {validate} from './protocol.cjs';
const output = process.stdout.write.bind(process.stdout);
console.log = (...args) => console.error(...args);
let bridge, config, initializing, closing = false;
const active = new Set();
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
      await bridge.runTurn({chatId: m.chatId, message: m.text, workspacePath: config.workspace,
        mode: m.mode, thinking: config.thinking, onFrame: frame => emit({type: 'frame', chatId: m.chatId, frame})});
    } finally { active.delete(m.chatId); emit({type: 'idle', chatId: m.chatId}); }
  } else if (m.type === 'approve') {
    await bridge.approve({chatId: m.chatId, callId: m.callId, decision: m.decision});
  } else if (m.type === 'stop') {
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
