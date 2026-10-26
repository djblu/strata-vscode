# Changelog

## 0.1.17 — 2026-10-26

- Use consistent spacing between commentary and action groups in live and completed turns.
- Remove leading/trailing prose blank lines that inflated gaps while preserving paragraph breaks and code whitespace.

## 0.1.16 — 2026-10-26

- Show only error details in failed file-action dropdowns, omitting tool descriptions, previews and edit arguments.

## 0.1.15 — 2026-10-26

- Display routine read/edit actions as plain filename rows without dropdowns. Keep approval requests and failures expandable.

## 0.1.14 — 2026-10-26

- Style Markdown tables with bold headers and horizontal separators without an outer box.
- Show live elapsed time beneath running commands and persist the completed duration in saved chats.

## 0.1.13 — 2026-10-26

- Use boxed terminal icons and activity-specific icons for mixed groups.
- Render Markdown lists as bullet points with nesting and inline formatting; preserve fenced code verbatim.

## 0.1.12 — 2026-10-26

- Group consecutive mixed actions with headers describing reads, edits, deletions, searches and commands.
- Link file-action filenames to the VS Code editor using recorded tool paths.
- Update group labels during execution and restore grouping from saved chats.

## 0.1.11 — 2026-10-26

- Add rounded Shell panels with copyable command text and scrollable output.
- Group consecutive commands under Running commands / Ran commands; preserve approval visibility and saved-chat grouping.

## 0.1.10 — 2026-10-26

- Size user message bubbles to their text and align them right, with wrapping for long messages.

## 0.1.9 — 2026-10-26

- Hide routine Showed you a result presentation-tool rows in live and saved chats. Keep answers, approvals and failures visible.

## 0.1.8 — 2026-10-26

- Remove the temporary Thinking indicator when commentary or tools begin, or the turn ends.
- Omit old Thinking markers from completed restored chats while preserving progress commentary.

## 0.1.7 — 2026-10-26

- Show Thinking instead of raw reasoning text, including restored older chats, without changing harness context.
- Encourage brief progress commentary between tool actions.
- Add a live Working for timer with a divider; retain elapsed time when the webview reopens.
- Match user-message fill and border colours.

## 0.1.6 — 2026-10-26

- Fold completed turn activity into a Worked for duration dropdown above the final response.
- Save tool activity and elapsed duration with new chat turns; keep final answers and file-change cards visible.

## 0.1.5 — 2026-10-26

- Show reasoning and tool disclosure chevrons on hover or keyboard focus, pointing right when collapsed and down when expanded.
- Keep chevrons visible on touch devices and respect reduced-motion preferences.

## 0.1.4 — 2026-10-26

- Capture new-file diffs when an unrelated subtree reaches scan limits, using pre-turn directory inventories to prove the file did not exist.
- Continue refusing automatic Undo for uncaptured existing files.
- Reset the status to Ready after collecting changes.

## 0.1.3 — 2026-10-25

- Fix checkpoint scan ordering so large subfolders cannot prevent capturing root files.
- Update change cards and private per-task `.diff` files on harness file-update events; flush at turn completion.
- Keep the original before-state across repeated updates and report missing checkpoint coverage.

## 0.1.2 — 2026-10-25

- Add saved per-turn file-change cards, line counts, expandable lists and VS Code diffs.
- Confirm Undo for modified/new workspace text files and reject later or unsaved edits.
- Preserve pre-existing edits; restored text remains unsaved for review. New files are deleted only after confirmation.
- Deleted files, permission changes, shell side effects and files outside the workspace require manual restoration.

## 0.1.1 — 2026-10-25

- Delete saved chats from the chat list with confirmation.
- Clear the active transcript on deletion and prevent delayed saves from restoring deleted chats.

## 0.1.0 — 2026-10-25

Initial public release, based on the private 0.1.28 preview.

- Local and Remote SSH coding harness with saved server connections.
- Verified prebuilt runtimes for Linux x64, Windows x64 and macOS ARM64.
- Saved chats, streamed Markdown, code blocks, tables and copy controls.
- Live permission switching, planning mode and workspace context attachments.
- File cards, image thumbnails and screenshot paste; image input enabled by default for compatible model endpoints.
- Context usage display, automatic compaction notifications and manual `/compact`.

Preview versions are retained in Git history. Users on 0.1.28 must manually install this lower-numbered release; extension identity and storage keys are unchanged.
