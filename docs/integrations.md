# Tool integrations

This page explains how the brain connects to Claude Code, Codex, OpenCode, Chrome, Obsidian, and a local Ollama model. The installer writes the configuration, and `brain mcp check` confirms that the running `brain-premises` server matches this checkout.

Run [the installation steps](getting-started.md#2-install-once) to set up or update the brain. The [catalog](catalog.md#mcp-servers) lists each MCP server and its purpose.

Contents:

- [Configuration files](#configuration-files)
- [Chrome profile](#chrome-profile)
- [Obsidian](#obsidian)
- [Check MCP drift](#check-mcp-drift)
- [Local decision model](#local-decision-model)
- [Setup record](#setup-record)

## Configuration files

[The snippet files](../mcp/snippets/) define the MCP servers. [setup-config.mjs](../scripts/setup-config.mjs) expands `${HOME}` and `${BRAIN_ROOT}` when the installer registers each server.

The installer creates missing Claude Code and Codex configuration files. Before changing an existing file, it saves a `.brain-bak` copy. Repeating the install produces the same configuration and preserves links to configuration files.

OpenCode reads its MCP configuration from dotfiles. Add `brain-premises` and `chrome-devtools` there from the snippet files.

The installer registers the session premises hook for Claude Code, Codex, and OpenCode from [hooks/catalog.json](../hooks/catalog.json). [brain.config.json](../brain.config.json) defines the scopes. The [catalog](catalog.md#hooks-and-settings) describes the hook and the Git confirmation rules. Codex does not run a new hook until you trust it in `/hooks`.

## Chrome profile

UI reviews use the user MCP server `chrome-devtools`. Its [snippet](../mcp/snippets/chrome-devtools.json) uses a persistent profile for test logins:

```text
$HOME/.local/share/agent-brain/chrome-profile
```

The profile stays outside the repo and the Obsidian vault. UI reviews use this profile instead of the daily Chrome profile.

Screenshots go to `memory/sessions/screenshots/`. Git ignores that directory except for its `.gitkeep` file.

Use the user server `chrome-devtools` for UI reviews. The `plugin:ecc:chrome-devtools` server does not have the review profile flags.

## Obsidian

Open the repo as an Obsidian vault. The CLI and `brain-premises` also work when Obsidian is closed.

Open [premises.base](../premises.base) with the core Bases plugin for Active, Candidates, and Archived views. The Meaning column makes the rule polarity explicit: `always` requires the text, `never` forbids the action in the text, and a candidate does not apply. Scope and repositories stay visible. The Active view spans all scopes; it is not the rule set for a particular repo.

Use `brain-premises` for rule management. Its initialization instructions describe rule strength, scope, candidates, evidence, and the write path. Read tools carry MCP read-only hints; these hints describe behavior and do not enforce permissions. Agents add, update, and delete premises through `brain premise` or the premise MCP. Direct edits in Bases or a general Obsidian MCP bypass that validation.

Search can narrow discovery without mixing work and personal rules:

```bash
brain premise search commit --repo agent-brain --scope personal --status active
```

The equivalent MCP call is `premise_search` with `query`, `repo`, `scope`, and optional `status`. Omitting `status` searches active and candidate premises. Search matches a case-insensitive substring in the text or ID; it does not translate or perform semantic search. Load the complete applicable rules with `premise_list` before work or review, regardless of search results.

The general Obsidian MCP is optional for live vault metadata and UI commands. Follow [its setup notes](../mcp/snippets/obsidian.md) only when those capabilities are needed. [The memory tools assessment](../communications/2026-10-24-memory-tools-assessment.md) compares local retrieval alternatives and the conditions for adding an index.

## Check MCP drift

Run `brain mcp check` after an update. The installer and `npm run check` also run it. It starts a fresh stdio server, compares its code version and tool schemas with this checkout, and checks that its premise list matches the shared store. It writes no premise.

The server version includes a hash of its source files and dependency lock at startup. If those files change, an existing server rejects tool calls with a reconnect message. Reconnect `brain-premises`, or start a new app session, to load the current code and tool schemas. The check command does not restart connections that an app already holds.

Older servers have no drift guard. If `premise_list` exposes no `scope` parameter, reconnect it. Until then, use `brain premise list --repo REPO --scope SCOPE` to keep scope filtering. An empty scope (`--scope ""`) returns only global rules.

## Local decision model

The `decide` block of [brain.config.json](../brain.config.json) turns on a local decision model in Ollama. Without the block, the brain sends no request. The model answers closed questions through `POST http://localhost:11434/v1/systemone`. This integration is experimental.

```json
"decide": { "model": "nimble-v3-16k:latest", "scopes": ["*"] }
```

`scopes` lists the brain scopes where the model runs. `"*"` runs it in every scope and in repos with no scope. Add `url` to use another server.

The model gives two hints:

- `brain next --request TEXT` prints the flow that best fits the request, from the flows that match the repo state, or `none`. The JSON output has `suggested` with the flow and its confidence. The `brain-next` skill passes the words of the user.
- `brain premise add` and `premise_add` name a premise of the same scope that may state the same rule. The CLI writes the hint to stderr. The MCP result has `repeat_of`. Run `brain premise seen` on that premise when it is a repeat.

A hint never changes the flow order, never blocks an add, and never writes a premise. When Ollama is down, the model is missing, or the answer is not a listed choice, the CLI writes `local model:` and the reason to stderr and keeps its normal output. The MCP result omits the hint. The first request after the model unloads takes a few seconds.

## Setup record

The [setup history](setup-history.md) records the skill discovery probe and Engram registration. The [install receipt decision](superpowers/specs/2026-10-23-install-receipt-design.md) defines the requirements for tracking installed items.
