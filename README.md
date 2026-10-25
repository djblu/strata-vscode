# Strata Harness for VS Code

Private preview extension for using Strata's coding harness from a VS Code sidebar. Windows VS Code connects to the Linux server through Remote SSH; the extension and harness run on that server.

## Install and connect

1. Connect with VS Code Remote SSH and open your project folder.
2. Install `strata-harness-0.1.19.vsix` into the **SSH extension host**, using **Extensions: Install from VSIX…**. This private preview is not yet published in the Marketplace.
3. Open Strata Harness. On a new host, **Connect to Strata** asks for the model API address (including port), API key, model and the context window configured on the server.
4. Setup checks `/v1/models` from the extension host and installs the pinned runtime if needed. Send your first message after setup completes.

Use **gear → Change connection**, or **Strata: Connect to Server**, to repeat setup. Keys are stored in SecretStorage and never shown in chat. Cancelling or failing setup preserves the previous saved connection. Existing sessions and this server's existing connection migrate without re-entering the key. Model discovery verifies access to the models endpoint; inference errors are still reported when a turn runs.

The model API can be on another machine. Files and commands belong to the machine hosting the extension and your workspace. Automatic runtime setup supports Linux and macOS x64/ARM64 hosts and requires Git, tar and access to nodejs.org, GitHub and npm. Native Windows runtime provisioning is not included; Windows VS Code with Remote SSH to Linux is supported. Linux x64 clean installation and a live model response have been verified; macOS/ARM64 have not been exercised on hardware.

Runtime setup downloads Node 24 with SHA-256 verification against the official checksum list, fetches the exact Strata source commit and installs the pinned dsh package in extension storage. It requires no root access and does not start or stop the inference server. The existing installation on the original server is reused.

## Features

- Rounded composer with a + menu for workspace file/folder references, selected editor context, Git diffs and read-only planning, a shield permission menu, a model/reasoning settings shortcut and a circular Send/Stop button. Voice input is not implemented.
- Bottom-anchored composer with Enter to send, Shift+Enter for a new line and Send/Stop controls. Short conversations sit above the composer and grow upwards; long conversations scroll independently.
- Fenced code blocks with language labels, syntax highlighting and Copy buttons; inline code and bold text. Formatting and highlighting update during streaming in throttled batches (approximately every 120 ms), with an immediate final update. Only the changing message is rendered; incomplete code fences are supported.
- Left-aligned, compact reasoning and tool activity rows with icons, descriptive labels and expandable details. Approval requests expand automatically and retain their controls.
- Streamed answers with collapsed reasoning and expandable tool details, batched rendering and debounced transcript storage.
- **Ask before actions** mode, with tool previews and Approve once / Deny controls.
- **Full control** mode runs commands and file changes without approval prompts, using the upstream bypass mode. The default for new chats remains Ask before actions. The permission choice is saved per chat and restored on reload; a yellow shield and Full Access label indicate Full control; Ask Permission and Read Only use neutral icons. The shield opens an approval menu with descriptions and a selected checkmark. Each turn also tells the model the current permission scope, so Full control instructs it to proceed with task-relevant actions rather than asking permission in prose.
- **Read only** mode, using the upstream harness's plan permission mode.
- Hover or keyboard-focus a user message to show its send time, Copy and Edit controls. Edit loads a copy into the composer; resending appends a new turn and does not rewind completed actions. Cancel restores your previous draft. Older messages without timestamps show no time.
- **Stop** cancels the harness turn, including pending tools.
- **← Back** opens an embedded, searchable chat-list page of saved conversations for this workspace. Select one to resume its original harness session. Titles come from the first prompt; use **Rename current chat** (✎) to change a title. **＋** at the top right starts a new chat and preserves the old conversation. The active chat title appears in the header. Chat-list rows show relative ages on the right; the history icon toggles search, the gear opens settings, and the compose icon starts a new chat.
- Chat display history and context usage are saved separately per conversation, approximately once per second during activity and on switching/closing. Your previously saved current conversation is migrated automatically. Wait for a turn to finish or stop it before switching.
- **Strata: Add Editor Selection** adds selected text to the prompt.
- **Review changes** opens VS Code Source Control for native Git diff review.
- Blue external links open in your browser. HTTP(S) Markdown links and plain URLs are supported.
- A composer context meter shows the latest reported tokens used, remaining tokens and percentage remaining. Unknown usage is labelled rather than estimated.
- Type `/compact` to manually summarise older context using Strata’s native command. Typing `/` shows a suggestion with the latest context percentage; Enter or click runs it and Tab completes the command. The meter refreshes afterward. Strata may report there is nothing useful to summarise in a short chat. Manual compaction must finish before sending another message; Stop is disabled for this operation.
- A “Compressing context” banner follows Strata’s compaction status events. Remaining window space includes room needed for replies; compaction may begin before the meter is full.
- Context usage from Strata; session persistence and automatic compaction remain owned by its harness.

## Configuration

Use **Change connection** for the address, API key, model and context window. Connection details are saved per extension host, outside project files. Thinking remains configurable in Settings. Restart the harness after changing thinking. Changing connection stops the old idle harness automatically; active turns must finish first.

Advanced users can override sourcePath, nodePath and harnessPath in remote settings. Set all three together, or leave all three blank for automatic setup. Legacy API/model settings are read during migration; the connection wizard manages subsequent changes. The configured context window must agree with the inference server. This preview sends text only.

## Runtime compatibility

Tested with Strata source v0.2.4 (`96ca4383`), Node v24.22.1 and `@deepseek-ai/dsh@0.2.1-alpha.3`. The source bridge is an internal API, so upstream upgrades need integration testing. `strata code` is not used: the inspected terminal version has only a placeholder for that command.

## Data and permissions

Workspace Trust is required. Manual mode uses upstream permission prompts; it is **not an OS sandbox**. Approving a shell command permits that command's effects. Work in a Git checkout and review tool previews.

API credentials never enter the webview or command-line arguments. The adapter receives them over private stdin. Harness data is kept in the extension's global storage under a workspace-specific directory. The display transcript is limited to recent content; the harness retains the durable session. Starting a new chat does not delete old harness sessions. The saved display contains the recent transcript (up to roughly 100 entries / 250,000 characters); the underlying harness session retains its own history and compaction state. Chats are local to this VS Code workspace/server, not cloud-synced. Conversations already discarded by earlier extension versions cannot be reconstructed by this migration.

## Development

```sh
npm ci
npm test
npm run package
```

The automated tests cover invalid permission modes, concurrency, rejected approvals, streaming, cancellation, shutdown and 1,000-chunk batched rendering. Live checks passed for a Swift response, resuming the same session across adapter restarts, an approved file write and cancellation of a pending write; the cancelled file was not created. Live smoke checks use an isolated workspace, not production files. Windows webview/Remote SSH UI interaction must still be checked in VS Code; passing adapter tests does not prove the UI.

This is an initial private preview, not a Marketplace release. There is no image attachment support or custom inline edit-diff UI yet. Use native Source Control diffs for review. Long-context compaction has not been stress-tested through this extension.

The + menu inserts context into your draft for review before sending. File/folder references let the harness read relevant contents on demand; Git changes include staged and unstaged diffs, exclude untracked contents, and are limited to 100,000 characters. Compaction shows a shimmering status while running (respects reduced motion), followed by a confirmation in chat when the harness reports success.

The bottom status line shimmers throughout an active turn, including thinking and tool activity, and returns to normal when idle. Reduced-motion settings disable the animation.

Harness installation reports elapsed time and completed npm registry requests every five seconds. It has a five-minute timeout; npm diagnostics are saved under `runtime-v1/harness/install-logs` in extension storage, with the full path shown on failure. Retry **Connect to Strata** after resolving network issues; completed Node downloads are reused.
