# Changelog

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
