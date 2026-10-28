# Tool integrations

This page explains how the brain connects to Claude Code, Codex, OpenCode, Chrome, Obsidian, and a local Ollama model. The installer writes the configuration, and `brain mcp check` confirms that the running `brain-premises` server matches this checkout.

Run [the installation steps](getting-started.md#2-install-once) to set up or update the brain. The [catalog](catalog.md#mcp-servers) lists each MCP server and its purpose.

Contents:

- [Configuration files](#configuration-files)
- [Code intelligence](#code-intelligence)
- [Chrome profile](#chrome-profile)
- [Obsidian](#obsidian)
- [Check MCP drift](#check-mcp-drift)
- [Local decision model](#local-decision-model)

## Configuration files

[The snippet files](../mcp/snippets/) define the MCP servers. [setup-config.mjs](../scripts/setup-config.mjs) expands `${HOME}` and `${BRAIN_ROOT}` when the installer registers each server.

The installer creates missing Claude Code and Codex configuration files. Before changing an existing file, it saves a `.brain-bak` copy. `scripts/uninstall.sh --remove-backups` removes those copies. Repeating the install produces the same configuration and preserves links to configuration files.

OpenCode reads its MCP configuration from dotfiles. Add `brain-premises` and `chrome-devtools` there from the snippet files.

The installer registers the session premises hook for Claude Code, Codex, and OpenCode from [hooks/catalog.json](../hooks/catalog.json). `brain.config.json` in the brain home defines the scopes. The [catalog](catalog.md#hooks-and-settings) describes the hook and the Git confirmation rules. Codex does not run a new hook until you trust it in `/hooks`.

## Code intelligence

The `brain-lsp` plugin gives Claude Code language servers for Go, TypeScript, protobuf, and Python files. The install links [plugins/brain-lsp](../plugins/brain-lsp/) into `~/.claude/skills/brain-lsp`, and Claude Code loads that folder as the plugin `brain-lsp@skills-dir`. The brain runs no code index server, because a language server gives exact answers with no index to keep up to date.

| Files | Server | Requirement |
| --- | --- | --- |
| `.go` | `gopls serve` | `gopls` on PATH: `go install golang.org/x/tools/gopls@latest` |
| `.ts`, `.tsx`, `.mts`, `.cts` | [ts-lsp.sh](../plugins/brain-lsp/scripts/ts-lsp.sh) | The `node_modules` of the project, and `typescript-language-server` on PATH, which the install adds |
| `.proto` | `buf lsp serve` | `buf` on PATH, and `buf registry login` when the module has dependencies on the Buf Schema Registry |
| `.py`, `.pyi` | `ty server` | `ty` on PATH, which the install adds with `uv tool install ty`. `ty` finds the `.venv` of the project. The uninstall keeps it |

`ts-lsp.sh` reads the TypeScript version of the project. TypeScript 7 has its own server, `tsc --lsp -stdio`, and no `tsserver.js`, so the script starts that server. Older TypeScript gets `typescript-language-server`. When it is missing, the install runs `npm install -g typescript-language-server typescript@6`. TypeScript 6 serves a folder with no TypeScript of its own, because TypeScript 7 has no `tsserver.js`. The uninstall keeps both packages. The first request after a start can come back empty while the server loads the project.

Run `claude plugin details brain-lsp@skills-dir` to see the four servers. The install warns when `gopls`, `buf`, or `uv` is missing.

OpenCode reads its language servers from dotfiles. Add this block to the OpenCode config, and replace `<brain>` with the output of `brain root`. It runs the same servers as the plugin. It turns off the built-in TypeScript server, which fails on TypeScript 7, and the built-in Python server, `pyright`:

```json
"lsp": {
  "typescript": { "disabled": true },
  "pyright": { "disabled": true },
  "ts": {
    "command": ["<brain>/plugins/brain-lsp/scripts/ts-lsp.sh"],
    "extensions": [".ts", ".tsx", ".mts", ".cts"]
  },
  "proto": {
    "command": ["buf", "lsp", "serve"],
    "extensions": [".proto"]
  },
  "ty": {
    "command": ["ty", "server"],
    "extensions": [".py", ".pyi"]
  }
}
```

Codex has no language server support.

## Chrome profile

UI reviews use the user MCP server `chrome-devtools`. Its [snippet](../mcp/snippets/chrome-devtools.json) runs `brain chrome-mcp`, which starts the server of `mcp/chrome-devtools.json` in the brain home. Edit that file to change the flags of the server. The install adds it from [the template](../templates/home/mcp/chrome-devtools.json) when it is missing, and never changes it after that.

`brain chrome-mcp` fills `${SCOPE}` with the scope of the folder where the session starts, or `default` outside a scope. Each scope gets its own persistent profile for test logins, so the logins of one scope never reach another:

```text
$HOME/.local/share/agent-brain/chrome-profiles/<scope>
```

The profiles stay outside the repo and the Obsidian vault. UI reviews use them instead of the daily Chrome profile. Chrome locks a profile while it runs, so two sessions of one scope cannot open it at the same time.

Screenshots go to `memory/sessions/screenshots/<scope>/` in the brain home, the `--filesystemRoot` folder of the config. Git ignores that folder except for its `.gitkeep` file. The session hook prints the absolute path of that folder for the scope of the repo. The agent saves each screenshot in the screenshot folder that the session context names, with `take_screenshot` and an absolute `filePath`. Without a `filePath`, the tool keeps no file, and a relative `filePath` writes into the repo.

Use the user server `chrome-devtools` for UI reviews. The `plugin:ecc:chrome-devtools` server does not have the review profile flags, so the install adds the deny rule `mcp__plugin_ecc_chrome-devtools` to `~/.claude/settings.json`.

## Obsidian

Open the brain home as an Obsidian vault. `brain home` prints its path. The CLI and `brain-premises` also work when Obsidian is closed.

Open `premises.base` in the brain home with the core Bases plugin for Active, Candidates, and Archived views. The Meaning column makes the rule polarity explicit: `always` requires the text, `never` forbids the action in the text, and a candidate does not apply. Scope and repositories stay visible. The Active view spans all scopes; it is not the rule set for a particular repo.

Use `brain-premises` for rule management. Its initialization instructions describe rule strength, scope, candidates, evidence, and the write path. Read tools carry MCP read-only hints; these hints describe behavior and do not enforce permissions. Agents add, update, and delete premises through `brain premise` or the premise MCP. Direct edits in Bases or a general Obsidian MCP bypass that validation.

Search can narrow discovery without mixing work and personal rules:

```bash
brain premise search commit --repo agent-brain --scope personal --status active
```

The equivalent MCP call is `premise_search` with `query`, `repo`, `scope`, and optional `status`. Omitting `status` searches active and candidate premises. Search matches a case-insensitive substring in the text or ID; it does not translate or perform semantic search. Load the complete applicable rules with `premise_list` before work or review, regardless of search results.

The general Obsidian MCP is optional for live vault metadata and UI commands. Follow [its setup notes](../mcp/snippets/obsidian.md) only when those capabilities are needed. [The memory tools assessment](../communications/2026-10-24-memory-tools-assessment.md) compares local retrieval alternatives and the conditions for adding an index.

## Check MCP drift

Run `brain mcp check` after an update. The installer and `npm run check` also run it. It starts a fresh stdio server, compares its code version and tool schemas with this checkout, and checks that its premise list matches the shared store. It writes no premise.

The server version is the semver of `package.json` with a build hash, such as `0.1.0+dfe89137017e`. The hash covers the source files and the dependency lock at startup. If those files change, an existing server rejects tool calls with a reconnect message. Reconnect `brain-premises`, or start a new app session, to load the current code and tool schemas. The check command does not restart connections that an app already holds.

Older servers have no drift guard. If `premise_list` exposes no `scope` parameter, reconnect it. Until then, use `brain premise list --repo REPO --scope SCOPE` to keep scope filtering. An empty scope (`--scope ""`) returns only global rules.

## Local decision model

The `decide` block of `brain.config.json` in the brain home turns on a local decision model in Ollama. Without the block, the brain sends no request. The model answers closed questions through `POST http://localhost:11434/v1/systemone`. This integration is experimental.

```json
"decide": { "model": "nimble-v3-16k:latest", "scopes": ["*"] }
```

`scopes` lists the brain scopes where the model runs. `"*"` runs it in every scope and in repos with no scope. Add `url` to use another server.

The model gives two hints:

- `brain next --request TEXT` prints the flow that best fits the request, from the flows that match the repo state, or `none`. The JSON output has `suggested` with the flow and its confidence. The `brain-next` skill passes the words of the user.
- `brain premise add` and `premise_add` name a premise of the same scope that may state the same rule. The CLI writes the hint to stderr. The MCP result has `repeat_of`. Run `brain premise seen` on that premise when it is a repeat.

A hint never changes the flow order, never blocks an add, and never writes a premise. When Ollama is down, the model is missing, or the answer is not a listed choice, the CLI writes `local model:` and the reason to stderr and keeps its normal output. The MCP result has `repeat_error` with the reason in place of `repeat_of`. The first request after the model unloads takes a few seconds.
