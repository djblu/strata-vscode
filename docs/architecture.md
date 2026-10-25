# Integration investigation

Investigated and implemented 2026-10-25. The adapter has completed a live streamed response through the Strata bridge with Swift 1.5 Q4. See README for current preview features and remaining UI validation.

## Findings

The installed Strata Terminal 0.2.4.2 exposes `strata code`, but its implementation returns error code 5: the shared Desktop harness component is not installed. The v0.2.5 tag and upstream main commit 41cf05a0 also contain that placeholder. Do not build the extension around terminal screen scraping or assume the command implements a JSONL agent protocol.

Strata's Desktop host has an implemented bridge to the pinned DeepSeek Harness. Relevant upstream source paths:

- `apps/host/server/agent/README.md`
- `apps/host/server/agent/agent-bridge.mjs`
- `apps/host/server/agent/gateway-client.mjs`
- `apps/host/server/agent/harness-runtime.mjs`
- `apps/host/server/agent/plugins/strata-gate.mjs`

The bridge exposes NDJSON chat events, session persistence, model routes, permission modes, context management and cancellation. Its host routes include `/api/chat/stream`, `/api/chat/approval`, `/api/chat/stop`, `/api/agent/status` and `/api/agent/pending`.

## Architecture

VS Code webview -> workspace extension host -> private local adapter -> Strata harness bridge -> model API.

Use a workspace extension for Remote SSH. Reuse the upstream harness behaviour through a version-pinned adapter; check upstream licensing and retain required notices when incorporating source. Do not mistake the inference API for the agent API.

## Integration checklist

1. Install a compatible Node runtime and the pinned harness in an isolated development directory.
2. Prove streaming, durable session resume, cancellation and approval handling against an isolated fixture workspace.
3. Define and test a versioned adapter protocol, including disconnects and errors. Fail clearly if the agent is unavailable; never silently substitute plain model chat.
4. Build the sidebar, selected-file context and tool cards. Use VS Code SecretStorage for model credentials; never pass credentials to the webview or log them.
5. Respect Workspace Trust, bind adapters locally and require explicit approve/deny for mutations in Manual mode. Unknown permission modes must not grant bypass access.
6. Add editor diff integration and reconnect behaviour. Bound streamed UI state and debounce persistence.
7. Package a private VSIX and test it in a real Remote SSH extension host. Unit tests alone do not establish UI or remote compatibility.

## Limits

Reviewable editor diffs require additional integration. The Desktop host APIs are internal, so pin their version and test compatibility before upgrades. Existing inference services should not be upgraded or restarted merely to develop the extension.
