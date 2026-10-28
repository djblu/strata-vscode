# Strata Harness for VS Code

VS Code extension for using Strata's coding harness from a VS Code sidebar. The extension and coding harness run beside your workspace, locally or on a Remote SSH host; model inference stays on your configured API server.

## Install and connect

1. Open your project folder locally or connect with VS Code Remote SSH.
2. Download `strata-harness-0.1.1.vsix` from [GitHub Releases](https://github.com/djblu/strata-vscode/releases/latest) and use **Extensions: Install from VSIX…** in the local or SSH window where you want to work. This extension is not yet published in the Marketplace.
3. Open Strata Harness. If no saved connection exists, **Connect to Strata** asks for the model API address (including port), API key, model and the context window configured on the server.
4. Setup checks `/v1/models` from the extension host and installs the pinned runtime if needed. Send your first message after setup completes.

Use **gear → Change connection**, or **Strata: Connect to Server**, to repeat setup. Keys are stored in SecretStorage and never shown in chat. Cancelling or failing setup preserves the previous saved connection. Existing sessions and this server's existing connection migrate without re-entering the key. Model discovery verifies access to the models endpoint; inference errors are still reported when a turn runs.

The model API can be on another machine. Files and commands belong to the machine hosting the extension and your workspace. New Linux x64, Windows x64 and macOS ARM64 hosts download one prebuilt runtime from the public [runtime downloads repository](https://github.com/djblu/strata-runtimes). Downloads are streamed to disk, checked against the size and SHA-256 pinned in this extension, then extracted into a staging folder before activation. The host needs HTTPS access to GitHub release downloads and `tar` (included with modern Windows). Git and npm are not needed for the prebuilt setup itself; coding tasks may still need Git.

Runtime packages have their own version and remain in extension global storage across extension updates. Existing working source installations are reused. Other supported x64/ARM64 platforms use the source installer, requiring Git, tar (or Windows PowerShell), and access to nodejs.org, GitHub and npm. A failed or corrupt prebuilt download reports an error and can be retried; it never silently runs an unverified package. Windows installations automatically disable optional subagent model selection; ordinary subagents retain the parent model.

The source-install fallback downloads Node 24 with SHA-256 verification against the official checksum list, fetches the exact Strata source commit and installs the pinned dsh package in extension storage. It requires no root access and does not start or stop the inference server. The existing installation on the original server is reused.

## One extension across SSH hosts

Only **Strata Harness** is needed. Install `strata-harness-0.1.1.vsix` in a local VS Code window on your PC. In a Remote SSH window, use VS Code's **Install in SSH: [host]** action for Strata Harness (or install the same VSIX there). It remains a workspace extension so the harness executes beside the remote project.

Connection URLs, model IDs, context limits and keys are saved together in VS Code **SecretStorage**, which VS Code keeps on the client PC even for remote extensions. The first setup saves a default connection. A new SSH host reads that default automatically without a profile picker or repeated login. The runtime is provisioned when needed; the remote host must be able to reach the saved API address.

Use **gear → Change connection** to configure the current connection. **Gear → Switch saved connection** is optional: switch between saved model connections or add another (Swift, DeepSeek, etc.). The last explicitly saved/selected connection becomes the default for new workspaces. Workspaces where you explicitly selected a connection keep that selection. No separate companion extension is required; the previous experimental Strata Connection Profiles package can be uninstalled.

Earlier per-host connection settings migrate into SecretStorage if there is no saved default. Chats remain per workspace. Credentials are available to the trusted remote harness at runtime, but are not saved in its connection settings or sent to the webview. Upstream harness runtime credential storage is separate. SecretStorage does not provide cross-PC Settings Sync.

This extension is not published on Marketplace. VS Code provides the remote installation button; Strata does not implement its own installer UI. Automated tests cover shared-secret connection reuse and failed writes. A real Windows-to-SSH installation and credential reuse should be verified on the user's PC.

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

Use **Change connection** for the address, API key, model and context window. Connection details are saved in client-side SecretStorage, outside project files. Thinking remains configurable in Settings. Restart the harness after changing thinking. Changing connection stops the old idle harness automatically; active turns must finish first.

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

This is an initial private preview, not a Marketplace release. Image attachments and per-turn change summaries are supported. Use native Source Control diffs for review. Long-context compaction has not been stress-tested through this extension.

The + menu inserts context into your draft for review before sending. File/folder references let the harness read relevant contents on demand; Git changes include staged and unstaged diffs, exclude untracked contents, and are limited to 100,000 characters. Compaction shows a shimmering status while running (respects reduced motion), followed by a confirmation in chat when the harness reports success.

The bottom status line shimmers throughout an active turn, including thinking and tool activity, and returns to normal when idle. Reduced-motion settings disable the animation.

Harness installation reports elapsed time and completed npm registry requests every five seconds. It has a five-minute timeout; npm diagnostics are saved under `runtime-v1/harness/install-logs` in extension storage, with the full path shown on failure. Retry **Connect to Strata** after resolving network issues; completed Node downloads are reused.

## Building runtime releases

The public `djblu/strata-runtimes` repository builds native bundles with GitHub Actions. Each build starts from the pinned upstream versions and runs session creation plus a streamed response against a loopback mock model API before packaging. It excludes Git metadata, installer logs and the nonportable dependency junction. The installer recreates that junction at the destination. No extension credentials, profiles, sessions or model weights are packaged.

Publish the `.tar.gz` archives as immutable assets of a versioned runtime release, then update `runtime-manifest.json` with each asset URL, byte size and SHA-256 from the build's platform JSON. Ship the updated manifest with the extension. Do not replace existing release assets; create a new runtime version. Native build tooling is mirrored under `scripts/` and `.github/workflows/runtime.yml` here.

Permission controls remain available during generation. Changes use the harness live session API and the displayed mode changes only after confirmation. Full Access allows pending approvals; Read Only rejects them. A change does not undo actions already executed.

The + menu remains available while a turn runs. Files, folders, editor selections and Git changes are added to the next-message draft without interrupting the current turn. Plan mode changes the running session permissions through the same confirmed live API.

Responses render Markdown pipe tables with headers, inline formatting, column alignment and horizontal scrolling. Tables update during streaming; fenced terminal output stays literal. Unlabelled/text/plaintext/txt fences appear as copyable Plain text blocks.

## Files and pictures

Files and folders selected from the + menu appear as removable cards above the input. They remain workspace references that the harness reads on demand. Choose **+ → Images** for local PNG, JPEG or WebP pictures, or paste a screenshot into the message box. Pictures show thumbnails; limits are four images, 5 MB each and 16 MB total. Attachments are kept in the draft when setup or validation fails and cleared when the send is accepted. Draft thumbnails are not saved across reloads. Sent images appear above the user message as right-aligned thumbnails; click to open in VS Code. Images are saved separately in private extension-host storage (sent-images, capped at 512 MiB), while the transcript stores references. The harness receives the original image data. Deleting a chat leaves saved image files on the host. Older name-only messages cannot reconstruct thumbnails.

Image input requires a vision-capable model served through the supported OpenAI chat API. **Strata: Vision** is enabled by default. You can disable it for a text-only endpoint; restart the harness (or reload VS Code) after changing it. This setting allows image input but does not add vision to a text-only model. The image pipeline is tested against a local mock API; actual image understanding depends on your model and serving configuration.

## Initial public release

v0.1.0 contains the features developed and tested through the private v0.1.28 preview. Development history is retained. Existing preview users must manually install the v0.1.0 VSIX because VS Code does not automatically downgrade extensions. Publisher and extension IDs are unchanged, so saved connections and chat storage remain associated with the same extension.

Delete a saved chat using the × button beside it in the chat list (shown on hover or keyboard focus), then confirm Delete. Stop a running turn first. This removes the extension’s saved transcript for that workspace; project files and underlying harness session logs are not deleted.

## File-change summaries and Undo

New turns capture eligible saved text files in the open workspace. Harness file-update events refresh a saved per-task `.diff` and change card (updates coalesce for one second); the end of the turn flushes the final state. A card shows edited files, added/removed lines, **View changes**, and **Undo**, with **Show more files** for longer lists. Clicking a file opens a read-only before/after diff in VS Code. Cards persist with saved chats; older chats have no retroactive checkpoints.

Undo asks for confirmation, including any newly created files it will delete. It refuses files changed since the turn or containing unsaved editor edits. Existing user changes from before the turn are preserved. Restored text is applied as **unsaved editor edits**: review and save it. The chat itself is not rewound, and the next prompt reminds the harness that earlier changes were undone.

This is a workspace snapshot, not a record of which process made each edit: changes made by other programs during a turn may also be included. Review the diffs before Undo. Deleted files and permission changes are viewable but require manual restoration. Installations, service changes, Git operations, external files and other command side effects are not undone.

Snapshots cover UTF-8 text files up to 1 MiB each, within a 32 MiB/5,000-entry/four-second scan budget. Symlinks, hardlinks, binary/large files, unsaved files, common dependency/build directories, most hidden directories and common credential files are excluded. Partial scans are labelled; uncaptured files are never treated as safely deletable additions. A `?` line count means an expensive diff exceeded its calculation budget; the full captured text remains available in View changes.

Snapshots stay on the extension host (the SSH host for remote workspaces), in its private global storage; their contents are not sent to the model. Retained snapshots are capped at 512 MiB; new checkpoints stop when full rather than deleting older ones automatically. Deleting a saved chat does not delete its retained snapshot files.

Checkpoint scans visit root files before descending into subfolders, so large nested trees do not starve top-level files. Scan limits and reported updates without a captured diff produce a notice. For complete coverage, open the project folder rather than an entire home directory. A diff cannot reconstruct an uncaptured pre-edit version; such files are never offered for automatic Undo.

New-file detection uses pre-turn directory listings: an incomplete scan elsewhere does not suppress a new file in a listed directory. Files in unvisited existing directories still require a captured baseline for safe Undo.
