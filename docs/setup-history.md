# Setup history

This page preserves the setup probe from 2026-10-23. Some skill names in this record belong to the initial setup.

For the current installation steps, read [Getting started](getting-started.md). For the current paths and integrations, read [Tool integrations](integrations.md).

## Skill discovery probe

This record describes the probe that picked the skill paths. Repeat its steps when a new agent tool is added: link one skill, ask the tool to list its skills, and keep only the path that shows it.

The four directory tests on 2026-10-23 printed `claude`, `agents`, `codex`, and `opencode-config`. All four directories exist.

Claude Code reads `~/.claude/skills`. OpenCode reads `~/.agents/skills` when that directory exists. `mcp/link-targets.txt` stores one path per line. A leading `~/` is the home directory. `brain accept-skill` and `scripts/install.sh` expand it before they link.

```
~/.claude/skills
~/.agents/skills
```

The file omits `~/.config/opencode/skills`. OpenCode already reads `~/.agents/skills`. A second link loads each skill twice.

Codex reads `~/.codex/skills` and `~/.agents/skills`. `codex debug prompt-input` lists both paths as skill roots. It loaded `simple-english` from `~/.agents/skills`. That skill is absent from `~/.codex/skills`. A Codex link loads each skill twice. The file omits `~/.codex/skills` for that reason.

The dry run used this command, without `--apply`:

```bash
brain link-skills --target ~/.claude/skills --target ~/.agents/skills
```

```
ln -sfn <brain>/skills/active/brain-accept-skill ~/.claude/skills/brain-accept-skill
ln -sfn <brain>/skills/active/brain-garden ~/.claude/skills/brain-garden
ln -sfn <brain>/skills/active/brain-harvest ~/.claude/skills/brain-harvest
ln -sfn <brain>/skills/active/brain-learn ~/.claude/skills/brain-learn
ln -sfn <brain>/skills/active/brain-next ~/.claude/skills/brain-next
ln -sfn <brain>/skills/active/brain-review ~/.claude/skills/brain-review
ln -sfn <brain>/skills/active/brain-workspace-audit ~/.claude/skills/brain-workspace-audit
ln -sfn <brain>/skills/active/brain-accept-skill ~/.agents/skills/brain-accept-skill
ln -sfn <brain>/skills/active/brain-garden ~/.agents/skills/brain-garden
ln -sfn <brain>/skills/active/brain-harvest ~/.agents/skills/brain-harvest
ln -sfn <brain>/skills/active/brain-learn ~/.agents/skills/brain-learn
ln -sfn <brain>/skills/active/brain-next ~/.agents/skills/brain-next
ln -sfn <brain>/skills/active/brain-review ~/.agents/skills/brain-review
ln -sfn <brain>/skills/active/brain-workspace-audit ~/.agents/skills/brain-workspace-audit
```

No line contains `example-draft`.

The same command with `--apply` created the links. These tests exited 0:

```bash
test -L ~/.claude/skills/qdrant-personal-review
test ! -e ~/.claude/skills/example-draft
test ! -e ~/.agents/skills/example-draft
test ! -e ~/.codex/skills/example-draft
```

This task skipped `test -L ~/.codex/skills/qdrant-personal-review`. Step 1 omitted that path. `qdrant-personal-review` is absent under `~/.codex/skills` and under `~/.config/opencode/skills`.

`engram setup codex` ran. The invocation was `engram setup codex --help`, and that command installed the plugin. `rg -q 'mcp_servers.engram' ~/.codex/config.toml` exited 1 before the command. After the command, `[mcp_servers.engram]` is in that file.

OpenCode already had an Engram MCP entry. Claude Code already had the Engram plugin. This task did not run the setup command again.

A live "tool lists the skill" confirmation is one session per tool. This OpenCode session listed the seven active skills after the apply. It did not list `example-draft`. Claude Code and Codex each need one session.

Obsidian registration waits for the two gitignored files, `mcp/snippets/obsidian.url` and `mcp/snippets/obsidian.key`. The user creates both files.

UI checks use the user MCP server `chrome-devtools`, not `plugin:ecc:chrome-devtools`. The user server has the review profile flags. The plugin server does not.

## OpenCode configuration at setup

`~/.config/opencode/opencode.json` is a symlink to `~/dotfiles/agents/opencode.json`. This task did not edit that file or anything under `~/dotfiles`. A later dotfiles install can add `chrome-devtools` and `brain-premises` from these snippets.
