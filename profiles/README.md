# Strata Connection Profiles

Install this companion extension **locally on your Windows, macOS or Linux PC**, and install Strata Harness in each SSH workspace. It runs in VS Code's local UI extension host.

Run **Strata: Manage Local Connection Profiles** to add named entries, for example **Strata — Swift 1.5** and **Strata — DeepSeek**. Each holds an API URL, exact model ID, context limit and API key. Keys use local VS Code SecretStorage; profile metadata uses local extension storage. Profiles are not Settings Sync data.

In Strata Harness, choose **gear → Change connection → Choose a saved profile on this PC**. Each remote workspace remembers its selection. The remote host tests the endpoint and retrieves fresh profile details when starting its harness. Editing a profile takes effect after **Strata: Restart Harness** or reconnecting. Deleting a profile requires affected workspaces to select another one.

Credentials pass through VS Code's extension-command transport to the remote harness, which sends model requests directly. The remote host must be trusted and able to reach the API. Credentials are not placed in chat messages or remote connection settings; the upstream harness may maintain its own runtime credential files. This companion is not a request relay and does not make private LAN addresses reachable from remote hosts.

For private VSIX installation, open a local VS Code window (not an SSH window), then run **Extensions: Install from VSIX…** and select this companion package. Return to your SSH window and reload it after installing the matching Strata Harness update.
