# Agent brain

A personal store of review rules and workflows for Claude Code, Codex, and OpenCode. Scopes keep work and personal practices apart.

Premises are rules. Skills are workflows. Engram is the session log.

Contents:

- [Requirements](#requirements)
- [Install](#install)
- [Use](#use)
- [Update](#update)
- [Remove](#remove)
- [Documentation](#documentation)

## Requirements

- Node 24 or later.
- git, with read access to the `d0whc3r/agent-brain` repo.
- Claude Code, Codex, or OpenCode.
- Optional, for the `brain-lsp` language servers: `gopls` for Go, `buf` for protobuf, and `uv`, which the install uses to add `ty` for Python.

## Install

Clone the repo, then run the install script:

```bash
git clone https://github.com/d0whc3r/agent-brain.git ~/.local/share/agent-brain/repo
cd ~/.local/share/agent-brain/repo
scripts/install.sh
```

To use another directory, clone into it, and use that path in the commands on this page.

After the install:

1. Start a new Claude Code, Codex, or OpenCode session. An open session does not see the new skills.
2. In Codex, trust the brain hook once in `/hooks`.
3. OpenCode reads its MCP servers and `AGENTS.md` from your dotfiles. Add `brain-premises` and `chrome-devtools` from `mcp/snippets/`, and paste `templates/agent-instructions.md` into that `AGENTS.md`.

Run `brain installed` to list each installed item.

## Use

Open a code repo and start a chat. Write the way you would to a teammate. The agent runs the brain commands, so you do not type slash commands.

```text
Review this diff. Do not edit files.
Remember this: new RPCs go in cluster-service, not cluster-api.
What should I do next?
```

When a session opens in a git repo, the brain hook prints the active premises for that repo. `brain.config.json` maps the repo to a scope by the owner of its `origin`.

## Update

Pull the repo, then run the install script again:

```bash
cd ~/.local/share/agent-brain/repo
git pull --ff-only
scripts/install.sh
```

## Remove

```bash
~/.local/share/agent-brain/repo/scripts/uninstall.sh
```

The uninstall removes the links, the MCP servers, the session hook, the git confirmation rules, and the brain instructions. It keeps the repo, the notes, and the Chrome profile. Add `--dry-run` to print what it removes, without a change.

## Documentation

| Need                                   | Read                                          |
| -------------------------------------- | --------------------------------------------- |
| Follow a first review step by step     | [Getting started](docs/getting-started.md)    |
| Know what to say in chat               | [Use cases](docs/use-cases.md)                |
| Find a skill, command, agent, or scope | [Brain catalog](docs/catalog.md)              |
| Add or change a workflow               | [Flow format](flows/README.md)                |
| Compare repo skills with the brain     | [Repo skills and audits](docs/repo-skills.md) |
| Configure MCP, Chrome, or Obsidian     | [Tool integrations](docs/integrations.md)     |
