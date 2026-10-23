# Qdrant review brain

This repo is Josep's personal review brain.

Repo path: `/Users/josep/projects/qdrant-review-brain`

## Commands

Run these commands from this repo:

```bash
brain premise list [--repo qdrant-cloud-ui]
brain premise add "New RPC lands in cluster-service" --strength always --repo qdrant-cloud-cluster-service
brain premise show <id>
brain premise rm <id>
```

## Chrome profile

Profile path: `$HOME/.local/share/qdrant-review-brain/chrome-profile`

## MCP

Snippet files are in `mcp/snippets/`. Claude Code and Codex use the expanded paths from these snippets. A tool that does not expand `${HOME}` needs the absolute path.

`~/.config/opencode/opencode.json` is a symlink to `/Users/josep/dotfiles/agents/opencode.json`. This task did not edit that file or anything under `/Users/josep/dotfiles`. A later dotfiles install can add `chrome-devtools` and `brain-premises` from these snippets.

Do not register Obsidian until `mcp/snippets/obsidian.url` and `mcp/snippets/obsidian.key` exist. Josep creates both files. Both files are gitignored. See `mcp/snippets/obsidian.md`.

The agent adds and deletes premises only through `brain premise` or the premise MCP.

## Probe
