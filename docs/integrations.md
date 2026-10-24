# Tool integrations

Run [the installation steps](getting-started.md#2-install-once) to set up or update the brain. The [catalog](catalog.md#mcp-servers) lists each MCP server and its purpose.

## Configuration files

[The snippet files](../mcp/snippets/) define the MCP servers. [setup-config.mjs](../scripts/setup-config.mjs) expands `${HOME}` and `${BRAIN_ROOT}` when the installer registers each server.

The installer creates missing Claude Code and Codex configuration files. Before changing an existing file, it saves a `.brain-bak` copy. Repeating the install produces the same configuration and preserves links to configuration files.

OpenCode reads its MCP configuration from dotfiles. Add `brain-premises` and `chrome-devtools` there from the snippet files.

The installer adds a SessionStart hook that prints the repo scope, active premises, and matching flows. [brain.config.json](../brain.config.json) defines the scopes. The [catalog](catalog.md#hooks-and-settings) describes the hook and Git confirmation rules.

## Chrome profile

UI reviews use the user MCP server `chrome-devtools`. Its [snippet](../mcp/snippets/chrome-devtools.json) uses a persistent profile for test logins:

```text
$HOME/.local/share/qdrant-review-brain/chrome-profile
```

The profile stays outside the repo and the Obsidian vault. UI reviews use this profile instead of the daily Chrome profile.

Screenshots go to `memory/sessions/screenshots/`. Git ignores that directory except for its `.gitkeep` file.

Use the user server `chrome-devtools` for UI reviews. The `plugin:ecc:chrome-devtools` server does not have the review profile flags.

## Obsidian

Open the repo as an Obsidian vault. The CLI and `brain-premises` also work when Obsidian is closed.

Follow [the Obsidian MCP instructions](../mcp/snippets/obsidian.md) to enable the Local REST API plugin. Register the server only after both `mcp/snippets/obsidian.url` and `mcp/snippets/obsidian.key` exist. Both files are gitignored.

Agents add and delete premises through `brain premise` or the premise MCP. This keeps validation and archived deletions in the shared store.

## Check MCP drift

Run `brain mcp check` after an update. The installer and `npm run check` also run it. It starts a fresh stdio server, compares its code version and tool schemas with this checkout, and checks that its premise list matches the shared store. It writes no premise.

The server version includes a hash of its source files and dependency lock at startup. If those files change, an existing server rejects tool calls with a reconnect message. Reconnect `brain-premises`, or start a new app session, to load the current code and tool schemas. The check command does not restart connections that an app already holds.

Older servers have no drift guard. If `premise_list` exposes no `scope` parameter, reconnect it. Until then, use `brain premise list --repo REPO --scope SCOPE` to keep scope filtering. An empty scope (`--scope ""`) returns only global rules.

## Setup record

The [setup history](setup-history.md) records the skill discovery probe and Engram registration. The [install receipt decision](superpowers/specs/2026-10-23-install-receipt-design.md) defines the requirements for tracking installed items.
