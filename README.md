# Strata for VS Code

A planned VS Code extension for working with Strata's coding harness from the editor.

Status: integration investigation complete; extension implementation has not started.

## Initial scope

- Chat sidebar with streamed responses and reasoning
- Workspace and selected-code context
- Tool activity and approve/deny controls
- Per-session cancellation and conversation resume
- Model connection settings, with credentials stored outside Git

The initial target is VS Code Remote SSH: the interface appears on the client, while the extension backend and harness run on the Linux workspace host.

See [the integration plan](docs/architecture.md).
