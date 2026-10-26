# Agent brain

A personal store of review rules and workflows for Claude Code, Codex, and OpenCode. Scopes keep work and personal practices apart. The repo holds the code, and your rules live in your own brain home, so an update never touches them.

Premises are rules. Skills are workflows. Engram is the session log.

Contents:

- [Requirements](#requirements)
- [Install](#install)
- [Use](#use)
- [Your brain home](#your-brain-home)
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

| Option | Use it to |
| --- | --- |
| `--home DIR` | Keep your brain home in `DIR`, such as a clone of your private home repo |
| `--no-git-guard` | Skip the rules that make Claude Code ask before `git commit`, `git push`, and destructive git commands |
| `--no-codex` | Skip Codex. The install also skips it when `~/.codex` does not exist |
| `--no-lsp` | Skip the `brain-lsp` plugin and its language servers |
| `--dry-run` | Print what would change, and change nothing |

After the install:

1. Start a new Claude Code, Codex, or OpenCode session. An open session does not see the new skills.
2. Review the starter premises with `brain premise list --status candidate`, and promote the ones you want with `brain premise promote ID`.
3. Add scopes for your repos to `brain.config.json` in your brain home.
4. In Codex, trust the brain hook once in `/hooks`.
5. OpenCode reads its MCP servers and `AGENTS.md` from your dotfiles. Add `brain-premises` and `chrome-devtools` from `mcp/snippets/`, and paste `templates/agent-instructions.md` into that `AGENTS.md`.

Run `brain installed` to list each installed item.

## Use

Open a code repo and start a chat. Write the way you would to a teammate. The agent runs the brain commands, so you do not type slash commands.

```text
Review this diff. Do not edit files.
Remember this: new RPCs go in orders-service, not orders-api.
What should I do next?
```

When a session opens in a git repo, the brain hook prints the active premises for that repo. `brain.config.json` maps the repo to a scope by the owner of its `origin`.

## Your brain home

The brain home holds your data: `brain.config.json`, your premises and notes, the standing DoD of each repo, and your own flows and skills. `brain home` prints its path, which is `~/.local/share/agent-brain/home` by default. The `BRAIN_HOME` variable overrides it for one command. The install creates the home once from [templates/home](templates/home/README.md), starts a git repo there, and never changes it again.

Commit the home to a private repo of your own. On another machine, clone that repo and run `scripts/install.sh --home <clone>`.

## Update

Pull the repo, then run the install script again:

```bash
cd ~/.local/share/agent-brain/repo
git pull --ff-only
scripts/install.sh
```

The update never changes your premises or your config. The install prints the changes since your last install, and adds to your brain home the folders of a newer template. When a release adds starter premises, the install says so: run `brain home starters` to list them, and `brain home starters --apply` to add them as candidates. A starter premise that you removed never comes back.

Before the brain home existed, the repo held your config and premises. To move them once from an old checkout:

1. Clone the new version into a new folder, and run `scripts/install.sh` there.
2. Run `brain home migrate --from <old checkout>`. It prints the plan: each file it adds, and each conflict with a home file that you changed.
3. Run it again with `--apply`, then commit the home and remove the old checkout.

## Remove

```bash
~/.local/share/agent-brain/repo/scripts/uninstall.sh
```

The uninstall removes the links, the MCP servers, the session hook, the git confirmation rules, and the brain instructions. It keeps the repo, your brain home, and the Chrome profile. Add `--dry-run` to print what it removes, without a change.

## Documentation

| Need                                   | Read                                       |
| -------------------------------------- | ------------------------------------------ |
| Follow a first review step by step     | [Getting started](docs/getting-started.md) |
| Know what to say in chat               | [Use cases](docs/use-cases.md)             |
| Find a skill, command, agent, or scope | [Brain catalog](docs/catalog.md)           |
| Add or change a workflow               | [Flow format](flows/README.md)             |
| Configure MCP, Chrome, or Obsidian     | [Tool integrations](docs/integrations.md)  |
