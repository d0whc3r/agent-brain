# Getting started

You talk to the agent in the code repo. The agent runs the brain commands. You do not type slash commands, and you do not paste a workflow.

This page gets you from "I cloned the repo" to "I asked for a review in chat".

Contents:

- [1. What you need](#1-what-you-need)
- [2. Install once](#2-install-once)
- [3. How a chat works](#3-how-a-chat-works)
- [4. Worked example](#4-worked-example)
- [5. More things you can say](#5-more-things-you-can-say)
- [6. Tips](#6-tips)
- [7. When you want the file, not the chat](#7-when-you-want-the-file-not-the-chat)

## 1. What you need

| Requirement | Why | Detail |
| --- | --- | --- |
| Node 24 or later | Runs `brain` | `node --version` |
| pnpm or npm | Installs the one dependency | The install script picks pnpm when it is present |
| Claude Code, OpenCode, or Codex | The chat | Open a new session after install |
| `~/.local/bin` on `PATH` | The agent finds `brain` | The install script prints the export line when it is missing |
| A git repo | The code you talk about | `brain.config.json` maps it to a scope |

`brain.config.json` defines the scopes: `qdrant` for work repos and `personal` for your own. The owner of the `origin` picks the scope. Add owners or roots there when you add a place to work.

## 2. Install once

```bash
cd <brain>
scripts/install.sh
```

Run it again after a pull or a skill change. That is also the update. Add `--dry-run` to see what would change, and `--help` to list the options.

The script links `brain`, links the brain skills and the third-party skills from `.agents/skills`, registers the MCP servers, and adds the session hook. The hook prints the active premises and the flows that match the repo state when you open a git repo. A repo outside every scope gets only the global premises. A copy or a worktree uses the premises of the repo it was cloned from.

A step that changes nothing prints one line. A step that changes something prints one line for each change. The summary counts the installed items and the changes of this run. The `Next` list shows only the steps that apply to you.

The install registers that hook for Claude Code, Codex, and OpenCode. Codex does not run it until you trust it in `/hooks`.

Start a new chat after install. The old chat does not see the new skills.

OpenCode reads MCP servers and `AGENTS.md` from dotfiles. Add `brain-premises` and `chrome-devtools` there from `mcp/snippets/`, and paste `templates/agent-instructions.md` into that `AGENTS.md`. The install tells you when one of them is missing or out of date. The skills still load, because OpenCode reads `~/.agents/skills`.

To remove the setup, run `scripts/uninstall.sh`. It also takes `--dry-run`. It removes the trust that Codex keeps in `~/.codex/config.toml` for the checkout and for the session hook. It keeps the repo, the notes, and the Chrome profile. It lists the `.brain-bak` copies of your config files. Add `--remove-backups` to remove them too.

When you move the checkout, run the install or the uninstall from the new place. Both replace or remove the links of the old place, and remove the Codex trust of the old place. The install never adds a Codex trust. You give it in Codex.

The install records each item in `~/.local/share/agent-brain/installed.txt`, and `brain installed` prints it. The decision is in [the install receipt spec](superpowers/specs/2026-10-23-install-receipt-design.md).

## 3. How a chat works

You stay in the code repo and write the way you would to a teammate.

```text
Review this diff. Do not edit files.
```

The agent loads `brain-reviewer`, calls `premise_list`, and writes findings. You do not type `/brain-reviewer`.

```text
Remember this: new RPCs go in cluster-service, not cluster-api.
```

The agent loads `brain-learn` and runs `brain premise add`. You do not type `/brain-learn`.

The map of phrases to actions is `docs/use-cases.md`. The agent reads that file when your words match a case. The full list of skills, agents, flows, and commands is `docs/catalog.md`.

## 4. Worked example

Open `qdrant-cloud-cluster-service`. The diff adds an RPC. In the new chat, write:

```text
Review this diff. Do not change any files.
```

### What the agent does

1. The session hook has already printed the premises for that repo.
2. The agent runs `brain scope` to learn the scope of the repo.
3. The agent calls `premise_list` and quotes each `always` and `never` premise.
4. The agent reads the diff and the Go skills under `.agents/skills/` because the files are `.go`.
5. The agent writes findings with file and line. It does not edit the diff.
6. The agent writes a short note under `memory/sessions/`.

### What you say next

```text
No. Keep new RPCs in cluster-service. Do not add them to cluster-api. Remember that.
```

The agent stores the rule. Ask it to show the list, or run this yourself:

```bash
brain premise list --repo qdrant-cloud-cluster-service
```

The new line is the proof.

## 5. More things you can say

| You say | The agent does |
| --- | --- |
| "Check localhost:3000." | Opens the page in `chrome-devtools`, takes one screenshot, reads the console |
| "Confirm the proto is the source. Do not touch qdrant/." | Reviews the proto diff and leaves the engine repo alone |
| "These three rules keep coming up. Make a skill." | Writes a draft under `skills/drafts/` and stops |
| "That draft is good. Make go-error-wrapping active." | Runs `brain accept-skill` and shows the commit. It does not push |
| "Is there a skill for Go context cancellation?" | Loads `find-skills` and shows the add command. It does not install |
| "Update the third-party skills." | Runs `pnpm skills:update` and shows the diff |
| "Do the repo skills match the brain?" | Runs `brain workspace check` and quotes each conflict |

Full phrases and the commands the agent must run are in [use-cases.md](use-cases.md).

## 6. Tips

- Say the outcome. "Review this" and "remember this" are enough.
- Name the repo only when the chat is not already inside it.
- A missing premise is a missing rule. The agent must not invent one.
- Do not open a copy directory. The session hook ignores names that contain `-copy`.
- Run `scripts/install.sh` again after the agent accepts a skill. That refreshes the links.

## 7. When you want the file, not the chat

```bash
brain premise list --repo qdrant-cloud-cluster-service
brain premise rm PREMISE_ID
pnpm skills:check
pnpm skills:update
```

`rm` moves the file to `memory/dropped/`. The active list no longer returns it.

GitHub refreshes third-party skills every Monday at 06:00 UTC. The workflow is `.github/workflows/update-skills.yml`. It opens a pull request on `bot/update-skills`. Review that diff before you merge.
