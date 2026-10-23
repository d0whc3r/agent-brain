# Qdrant review brain

This repo is a personal review brain.

Start with [docs/getting-started.md](docs/getting-started.md). That guide has the setup checks, the prompts, and the use cases.

Repo path: `/Users/josep/projects/qdrant-review-brain`

## Commands

Run these commands from this repo:

```bash
brain premise list [--repo qdrant-cloud-ui]
brain premise add "New RPC lands in cluster-service" --strength always --repo qdrant-cloud-cluster-service
brain premise show <id>
brain premise rm <id>
brain premise stats
```

`brain premise stats` prints each active premise with its applied count, rejected count, last applied date, and a flag. The counts come from the `applied` and `rejected` lists in `memory/sessions/`. The flag is `unused` (never applied), `stale` (not applied in 90 days), or `noisy` (rejected at least twice and at least as often as applied). Review a flagged premise, then keep it, change it, or drop it.

`/harvest` reads the Claude Code project memories and Engram, and proposes premises for rules that are not premises yet. It adds only the rows you approve.

Run `npm run check` before a commit. It runs the tests, `brain skills check`, and the three scripts in `scripts/`.

## Next steps and flows

`brain next` reads the state of the repo you are in: branch, ticket key, changed file kinds, dirty tree, PR state, and commits behind `origin/main`. It lists the flows in `flows/` that match, most specific first. The `next` skill shows them and runs the one you pick, with the skills, agents, MCP servers, and model that the flow names. The session hook prints the top three matches at session start.

```bash
brain next [--cwd DIR] [--json] [--no-pr]
brain flows
```

[flows/README.md](flows/README.md) lists the flow fields. Edit a flow to change its steps or its model. Add a flow for a task you repeat.

## Workspace config

Many workspace repos carry their own `AGENTS.md`, `CLAUDE.md`, skills, agents, and commands. `brain workspace scan` lists them in [memory/workspace/inventory.md](memory/workspace/inventory.md) and stores a baseline. Copies of a repo are skipped.

```bash
brain workspace scan
brain workspace check
```

`check` prints each file added, changed, or removed since the baseline, and each new conflict with the brain:

- `broken`: a repo skill entry with no readable `SKILL.md`, such as a link to a skill that is not installed.
- `version`: a third-party skill that the brain also vendors, with different content.
- `collision`: a repo skill with the name of a brain skill.

`/workspace-audit` reads the changes and compares the repo rules with the premises. It reports contradictions, duplicates, gaps, and stale premises, and changes the brain only after you approve.

## Install

Run `scripts/install.sh` to set up or update the brain, and `scripts/uninstall.sh` to remove it. [docs/getting-started.md](docs/getting-started.md) lists each step.

`bin/session-premises.mjs` is the Claude Code `SessionStart` hook that the install adds. It prints the active premises for the repo of the session directory. It names the repo from `git remote get-url origin`, so a copy or a worktree loads the premises of the repo it was cloned from. `BRAIN_WORKSPACE` is the directory that holds the repos. A directory outside it prints nothing.

`agents/brain-reviewer.md` is a read-only review subagent. The install links it into `~/.claude/agents`. It has no Edit tool, and it follows `review-brain` in a fresh context. Ask for it by name, for example: "Use the brain-reviewer agent on this diff."

`.claude/settings.json` in this repo allows the read-only premise commands. It asks before `git commit`, `git push`, and a premise delete.

## Chrome profile

Profile path: `$HOME/.local/share/qdrant-review-brain/chrome-profile`

## MCP

Snippet files are in `mcp/snippets/`. `${HOME}` and `${BRAIN_ROOT}` are placeholders. `scripts/setup-config.mjs` fills them when the install registers each server.

`~/.config/opencode/opencode.json` is a symlink to `/Users/josep/dotfiles/agents/opencode.json`. This task did not edit that file or anything under `/Users/josep/dotfiles`. A later dotfiles install can add `chrome-devtools` and `brain-premises` from these snippets.

Do not register Obsidian until `mcp/snippets/obsidian.url` and `mcp/snippets/obsidian.key` exist. The user creates both files. Both files are gitignored. See `mcp/snippets/obsidian.md`.

The agent adds and deletes premises only through `brain premise` or the premise MCP.

## Probe

This section records the probe that picked the skill paths. Repeat its steps when a new agent tool is added: link one skill, ask the tool to list its skills, and keep only the path that shows it.

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
brain link-skills --target /Users/josep/.claude/skills --target /Users/josep/.agents/skills
```

```
ln -sfn /Users/josep/projects/qdrant-review-brain/skills/active/accept-skill /Users/josep/.claude/skills/accept-skill
ln -sfn /Users/josep/projects/qdrant-review-brain/skills/active/garden /Users/josep/.claude/skills/garden
ln -sfn /Users/josep/projects/qdrant-review-brain/skills/active/learn /Users/josep/.claude/skills/learn
ln -sfn /Users/josep/projects/qdrant-review-brain/skills/active/qdrant-personal-review /Users/josep/.claude/skills/qdrant-personal-review
ln -sfn /Users/josep/projects/qdrant-review-brain/skills/active/review-brain /Users/josep/.claude/skills/review-brain
ln -sfn /Users/josep/projects/qdrant-review-brain/skills/active/accept-skill /Users/josep/.agents/skills/accept-skill
ln -sfn /Users/josep/projects/qdrant-review-brain/skills/active/garden /Users/josep/.agents/skills/garden
ln -sfn /Users/josep/projects/qdrant-review-brain/skills/active/learn /Users/josep/.agents/skills/learn
ln -sfn /Users/josep/projects/qdrant-review-brain/skills/active/qdrant-personal-review /Users/josep/.agents/skills/qdrant-personal-review
ln -sfn /Users/josep/projects/qdrant-review-brain/skills/active/review-brain /Users/josep/.agents/skills/review-brain
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
