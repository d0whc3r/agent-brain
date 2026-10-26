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
| `--home-repo URL` | Clone your brain home from your private git repo. An empty repo gets the starter home |
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

The brain home holds your data: `brain.config.json`, your premises and notes, the standing DoD of each repo, and your own flows and skills. `brain home` prints its path, `~/.local/share/agent-brain/home` by default. The install creates it once, or clones it with `--home-repo`, and never changes a file in it.

Keep the home in a private git repo. Git keeps it the same on each machine:

- **First machine:** create an empty private repo, then run `scripts/install.sh --home-repo <url>` and `brain home sync`.
- **Another machine:** run `scripts/install.sh --home-repo <url>` with the same repo.
- **Each day:** run `brain home sync` after a change, or ask the agent to sync the brain. It commits, pulls, and pushes the home. Each new session pulls the home in the background.

[Brain home: setup, sync, and updates](docs/home.md) has every step, the conflict case, and the move from a checkout that kept your data.

## Update

Pull the brain repo, then run the install script again, on each machine:

```bash
cd ~/.local/share/agent-brain/repo
git pull --ff-only
scripts/install.sh
```

The update changes only code. The install prints the changes since your last install, adds the folders of a newer template to your home, and tells you when `brain home starters` has new starter premises for you. Run `brain home sync` when the install changed the home.

Before the brain home existed, the repo held your premises. Do not pull such an old checkout: follow [the move steps](docs/home.md#move-from-a-checkout-that-kept-your-data).

## Remove

```bash
~/.local/share/agent-brain/repo/scripts/uninstall.sh
```

The uninstall removes the links, the MCP servers, the session hook, the git confirmation rules, and the brain instructions. It keeps the repo, your brain home, and the Chrome profile. Add `--dry-run` to print what it removes, without a change.

## Documentation

| Need                                   | Read                                       |
| -------------------------------------- | ------------------------------------------ |
| Follow a first review step by step     | [Getting started](docs/getting-started.md) |
| Set up, sync, or update your home      | [Brain home](docs/home.md)                 |
| Know what to say in chat               | [Use cases](docs/use-cases.md)             |
| Find a skill, command, agent, or scope | [Brain catalog](docs/catalog.md)           |
| Add or change a workflow               | [Flow format](flows/README.md)             |
| Configure MCP, Chrome, or Obsidian     | [Tool integrations](docs/integrations.md)  |
