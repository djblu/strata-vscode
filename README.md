# Strata Harness for VS Code

Private preview extension for using Strata's coding harness from a VS Code sidebar. Windows VS Code connects to the Linux server through Remote SSH; the extension and harness run on that server.

## Install on this server

1. In Windows VS Code, connect to the server using Remote SSH and open one project folder.
2. Run **Extensions: Install from VSIX…**, selecting `strata-harness-0.1.12.vsix` from this repository. Ensure the extension is installed in the **SSH** extension host. If the file picker is local, download the VSIX first.
3. Open **Strata Harness** from the activity bar. Click **API key**, or run **Strata: Set API Key**. Paste your inference server key. It is stored in VS Code SecretStorage.
4. Send a message. The default is the currently running Swift 1.5 Q4 server at `http://10.70.70.24:8081/v1`.

The required Node 24 runtime and pinned dsh package have already been installed under `/home/djblu/.local/share/strata-vscode/`. Strata's source checkout is reused without modification. The extension does not start or stop your inference server.

## Features

- Rounded composer with a + button for selected editor context, a shield permission menu, a model/reasoning settings shortcut and a circular Send/Stop button. Voice input is not implemented.
- Bottom-anchored composer with Enter to send, Shift+Enter for a new line and Send/Stop controls. Short conversations sit above the composer and grow upwards; long conversations scroll independently.
- Fenced code blocks with language labels, syntax highlighting and Copy buttons; inline code and bold text. Highlighting is applied when a response segment finishes, keeping streaming updates lightweight.
- Left-aligned, compact reasoning and tool activity rows with icons, descriptive labels and expandable details. Approval requests expand automatically and retain their controls.
- Streamed answers with collapsed reasoning and expandable tool details, batched rendering and debounced transcript storage.
- **Ask before actions** mode, with tool previews and Approve once / Deny controls.
- **Full control** mode runs commands and file changes without approval prompts, using the upstream bypass mode. The default remains Ask before actions.
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

Search Settings for `Strata`. Machine settings specify the Strata source checkout, Node executable, dsh package, API URL, model ID and context window. Defaults match this server. Thinking defaults to Low. Run **Strata: Restart Harness** after changing connection settings, thinking or the API key; wait for shutdown before sending again.

The URL is reached from the Linux extension host. For another model, use its actual server address and model ID. The configured context window must agree with the inference server. This preview deliberately sends text only.

## Runtime compatibility

Tested with Strata source v0.2.4 (`96ca4383`), Node v24.22.1 and `@deepseek-ai/dsh@0.2.1-alpha.3`. The source bridge is an internal API, so upstream upgrades need integration testing. `strata code` is not used: the inspected terminal version has only a placeholder for that command.

For a new Linux machine, install Node 24, clone the matching Strata source, and install dsh:

```sh
npm install --prefix "$HOME/.local/share/strata-vscode/harness" --save-exact @deepseek-ai/dsh@0.2.1-alpha.3
```

The bridge checks for a `node_modules` directory inside the dsh package. When npm hoists dependencies, create a symlink there pointing to `../..` (the enclosing `node_modules`) if that directory is absent. Configure the three runtime paths in VS Code's remote settings.

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

This is an initial private preview, not a Marketplace release. There is no session browser, image attachment support or custom inline edit-diff UI yet. Use native Source Control diffs for review. Long-context compaction has not been stress-tested through this extension.
