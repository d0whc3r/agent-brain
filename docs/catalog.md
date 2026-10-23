# Brain catalog

This page lists every part of the brain: skills, agents, flows, commands, MCP servers, hooks, scripts, and files. Each entry says what the part does, when to use it, and what to say in chat.

You talk to the agent in the code repo. The agent loads the skill and runs the command. A slash command such as `/next` also works, but plain words are enough.

- Setup: [getting-started.md](getting-started.md).
- Phrases the agent maps to actions: [use-cases.md](use-cases.md).
- Repo skills against the brain copies: [repo-skills.md](repo-skills.md).

## The map

| Part | What it is | Where it lives |
|---|---|---|
| Scope | A group of repos that share practices, such as `qdrant` (work) or `personal`. `*` means every scope. | `brain.config.json` |
| Premise | One rule with a strength (`always`, `never`, `prefer`), a scope, and the repos it applies to | `memory/premises/` |
| Decision note | The record of a correction, with its evidence | `memory/decisions/` |
| Session note | The record of one review: premises applied and rejected | `memory/sessions/` |
| Brain skill | A workflow the agent runs: review, learn, next steps | `skills/active/` |
| Draft skill | A proposed skill that no tool loads yet | `skills/drafts/` |
| Third-party skill | A vendored skill, read when a review flow needs it | `.agents/skills/`, listed in `skills/third-party.json` |
| Agent | A subagent with its own context and tools | `agents/` |
| Flow | A task you do often, with the signals that match it and its steps | `flows/` |
| `brain` command | The CLI that reads and writes premises, flows, and the workspace inventory | `bin/brain.mjs` |
| MCP server | Tools that the chat calls directly | `mcp/snippets/` |
| Session hook | Prints premises and matching flows when a chat starts | `bin/session-premises.mjs` |
| Workspace inventory | The agent config of every repo in the workspace | `memory/workspace/` |

## Scopes

The brain serves every repo you work in, and it keeps the practices of each place apart. `brain.config.json` defines the scopes:

| Scope | Owners of the origin | Roots for repos with no origin |
|---|---|---|
| `qdrant` | `qdrant`, `josep-qdrant` | `~/projects/qdrant` |
| `personal` | `d0whc3r` | `~/projects/github` |

- The origin owner picks the scope. A copy or a worktree uses the origin of the repo it was cloned from.
- A repo with no origin takes the scope of the root that holds it.
- A repo whose owner is in no scope, such as a third-party clone, gets only the global premises: scope `*` and repos `*`.
- Each premise has one scope. A rule about one team or project takes that scope. A rule about how you work everywhere, such as git or writing habits, takes `*`.
- `brain scope` prints the scope, the repo, and the owner of the current directory.

To add a scope, add an entry with its owners and roots to `brain.config.json`, then run `brain workspace scan`.

## A day with the brain

1. **Open a chat in the repo.** The session hook prints the active premises for that repo and the three flows that match its state. A copy or a worktree uses the premises of the repo it was cloned from.
2. **Ask what to do next.** Say "What should I do next here?" The `next` skill reads the branch, the ticket, the changed files, and the PR, and suggests flows. Pick one.
3. **Work.** The flow names the skills, agents, MCP servers, and model. The premises apply to every step.
4. **Get a review.** Say "Review this diff." For an independent review, say "Use the brain-reviewer agent on this branch."
5. **Correct the brain.** When a finding is wrong or you state a rule, say "Remember this: ..." The `learn` skill stores it, and the next review applies it.
6. **Once a week, care for the brain.** In this repo, say "What should I do next?" The `brain-care` flow checks premise use, workspace drift, and new rules in memory.

## Brain skills

These skills live in `skills/active/`. The install links them, and the third-party skills in `.agents/skills/`, into `~/.claude/skills` (Claude Code) and `~/.agents/skills` (Codex and OpenCode). A brain skill wins over a third-party skill with the same name. An entry that another install already owns stays as it is.

| Skill | What it does | Say this | What it changes |
|---|---|---|---|
| `next` | Reads the repo state, suggests matching flows, and runs the one you pick | "What should I do next?" "¿Qué hago ahora?" | Nothing until you pick a flow. It writes a new flow file only after you agree. |
| `review-brain` | Reviews the diff against the premises of the repo scope. Verifies each finding before it reports it. | "Review this diff." "Revisa este cambio." | A session note in `memory/sessions/`. Never the code. |
| `learn` | Stores a correction as a decision note and, for `always` or `never`, as a premise | "Remember this." "A partir de ahora..." | A decision note and a premise. |
| `harvest` | Reads Claude Code memories and Engram, and proposes premises for rules that are not premises yet | "Which of my corrections are not premises yet?" | Only the premises you approve, and one decision note. |
| `garden` | Drafts a skill when three premises share a repo and a rule | "Can these rules become a skill?" | A draft in `skills/drafts/`. |
| `accept-skill` | Moves a draft to `skills/active/`, commits that move, and refreshes the links | "Accept the go-error-wrapping draft." | One commit in this repo. No push. |
| `workspace-audit` | Compares the agent config of the repos in each scope root with the brain: drift, broken links, version drift, name collisions, and rule contradictions. It compares a repo only with the premises of its own scope. | "Do the repo rules contradict the brain?" "Do the repo skills match the brain?" | An audit note, and brain changes you approve. Never a team repo. |

### `review-brain` in detail

1. It runs `brain scope` for the repo name and its scope.
2. It calls `premise_list` for that repo and scope.
3. It reads the third-party skills whose kind matches the changed files: `go`, `proto`, `python`, `ui`, and always `review`.
4. It reviews, then tries to prove each finding wrong. It drops a finding when the input cannot reach the code or when the problem is older than the diff. It reports how many findings it dropped.
5. It checks a finding that depends on library behavior against the official docs, with `source-driven-development`.
6. It reports code smells from a baseline of 12 (after Fowler, via mattpocock/skills) as "possible" notes, never as findings. `code-simplification` shapes the fix.
7. It tags each finding with the premise that produced it, and writes `applied` and `rejected` in the session note.

`brain premise stats` reads those lists later.

## Agents

| Agent | What it does | Say this | Tools |
|---|---|---|---|
| `brain-reviewer` | Runs `review-brain` in a fresh context, without the assumptions of the session that wrote the code | "Use the brain-reviewer agent on this diff." | Read, Grep, Glob, Bash, Write (session notes only), and the read-only premise tools. No Edit. |

Use `brain-reviewer` when the same chat wrote the code. Use `review-brain` in the chat when you want to talk about each finding as you go. Ask for the agent by name, because automatic delegation is not reliable for a required review.

## Flows

A flow is a file in `flows/`. Its frontmatter says when it matches and what it uses. Its body lists the steps. `brain next` ranks the flows that match: more matching signals rank higher.

| Flow | Matches when | Uses | Model | Done when |
|---|---|---|---|---|
| `start-ticket` | `qdrant` scope, on a clean `main` | Atlassian MCP, `grilling`, `planning-and-task-breakdown` | opus | The branch exists and the plan is in chat |
| `review-diff` | On a feature branch | `brain-reviewer`, `review-brain`, `brain-premises` | opus | Each finding has your answer |
| `ui-change-verify` | `qdrant` scope, in `qdrant-cloud-ui` with UI files changed | `chrome-devtools` MCP | sonnet | Checks pass and a screenshot shows the change |
| `proto-change` | `qdrant` scope, `.proto` files changed | `api-and-interface-design`, `golang-grpc` | opus | `buf breaking` is clean and each consumer has a pin to update |
| `db-migration` | Files in `alembic/versions` or `migrations` changed | | sonnet | One alembic head, DB tests pass |
| `sync-with-main` | Feature branch behind `origin/main` | | sonnet | Not behind, checks pass |
| `prepare-pr` | Clean feature branch with no PR | `git-workflow-and-versioning`, `verification-before-completion` | sonnet | You have the PR draft |
| `address-review` | The PR is open or has changes requested | `receiving-code-review`, `learn` | opus | Each comment has a fix or a drafted reply |
| `brain-care` | In this repo | `workspace-audit`, `harvest`, `garden`, `writing-for-agents` | sonnet | `npm run check` passes and each flagged premise has a decision |
| `grill-plan` | Any repo, when you ask to stress-test a plan ("grill this") | `grilling`, `doubt-driven-development` | opus | No open question is left and you confirm the shared understanding |

### Signals

| Signal | Values |
|---|---|
| `scopes` | Scope names, or `*` |
| `repos` | Origin repo names, or `*` |
| `kinds` | `go`, `python`, `proto`, `ui`, `migration`, `docs`, `test` |
| `branch` | `main` or `feature` |
| `dirty` | `true` or `false` |
| `pr` | `none`, `draft`, `open`, `changes_requested`, `approved` |
| `behind` | `true` or `false` |

### Change a flow

- Say "Use sonnet for review-diff." The `next` skill edits the `model` field and shows the diff.
- Say "Add a step to prepare-pr: run the e2e tests." The skill edits the steps.
- Do a task that no flow covers. At the end, the skill offers to save it as a new flow with the signals that would have matched.

[flows/README.md](../flows/README.md) has every field.

## Third-party skills

The repo keeps every third-party skill once, in `.agents/skills/`, in the open Agent Skills format that Claude Code, Codex, and OpenCode all read. The install links them next to the brain skills. `review-brain` reads the ones whose kind matches the diff. A kind is a type of changed file, the same values that flows use. `brain skills check` confirms each one is present. `brain skills add` installs only into `.agents/skills/`, so no copy lands in another tool folder.

| Kind | Skills |
|---|---|
| `review` | `using-agent-skills`, `api-and-interface-design`, `doubt-driven-development`, `retro`, `diagnosing-bugs`, `handoff`, `code-review-and-quality`, `security-and-hardening`, `code-simplification`, `source-driven-development` |
| `go` | `deprecation-and-migration`, `observability-and-instrumentation`, `golang-code-style`, `golang-error-handling`, `golang-testing`, `golang-safety`, `golang-grpc`, `golang-performance`, `golang-observability`, `golang-security`, `golang-concurrency`, `golang-context` |
| `proto` | `api-and-interface-design`, `golang-grpc`, `protobuf` |
| `python` | `deprecation-and-migration`, `sqlalchemy-alembic-expert-best-practices-code-review`, `python-testing-patterns`, `fastapi-python` |
| `migration` | `sqlalchemy-alembic-expert-best-practices-code-review` |
| `test` | `vitest`, `python-testing-patterns`, `test-driven-development` |
| `ui` | `vercel-react-best-practices`, `vercel-composition-patterns`, `accessibility`, `web-design-guidelines`, `tanstack-query`, `tanstack-router`, `vitest`, `zod-validation`, `typescript-advanced-types`, `react-hook-form`, `frontend-design` |
| `workflow` | `grilling`, `planning-and-task-breakdown`, `receiving-code-review`, `verification-before-completion`, `git-workflow-and-versioning`, `writing-for-agents` |

`review-brain` loads every kind except `workflow`. A `workflow` skill belongs to the flows that name it, so a review does not pay its context cost.

`web-design-guidelines` downloads its rules from GitHub each time it runs, so its rules can change between reviews.

Two internal skills help with skills: `find-skills` finds a third-party skill, and `skill-creator` writes and validates one. Say "Is there a skill for Go context cancellation?" or "Write a skill for our proto field numbers." A new skill goes to `skills/drafts/`.

Add a skill to the catalog with `brain skills add owner/repo --skill NAME --kind KIND`. Update the copies with `pnpm skills:update`.

## Commands

The agent runs these. You can run them too.

### Premises

| Command | What it does |
|---|---|
| `brain premise list [--repo NAME] [--scope NAME]` | Active premises with their scope. `--scope ""` lists what a repo in no scope gets. |
| `brain scope [--cwd DIR]` | The scope, repo, and owner of a directory |
| `brain premise add TEXT --strength S --scope SCOPE --repo R [--id ID] [--source PATH]` | Add a premise. Rejects a bad strength, an unknown scope, and text that looks like a secret. |
| `brain premise show ID` | One premise |
| `brain premise rm ID` | Move a premise to `memory/dropped/` |
| `brain premise search QUERY` | Premises whose text contains the query |
| `brain premise stats` | Applied count, rejected count, and last use per premise, with a flag: `unused`, `stale` (not applied in 90 days), or `noisy` (rejected often) |

### Next steps

| Command | What it does |
|---|---|
| `brain next [--cwd DIR] [--json] [--no-pr]` | Repo state and the matching flows |
| `brain flows` | Every flow with its model |

### Workspace and skills

| Command | What it does |
|---|---|
| `brain workspace scan` | Lists the agent config of every repo in the scope roots in `memory/workspace/inventory.md`, and stores the baseline. Skips copies and repos outside the scope. |
| `brain workspace check [--all]` | Files added, changed, or removed since the baseline, and new conflicts: `broken`, `version`, `collision`. `--all` also prints the known conflicts. Exit 1 when it prints a line. |
| `pnpm skills:drift` | Short name for `brain workspace check --all` |
| `brain skills list` / `check` / `add` / `update` / `sync` / `remove` | Manage the third-party catalog and the vendored copies |
| `brain accept-skill NAME` | Move a draft to active and commit |
| `brain link-skills --target PATH [--apply]` | Link the brain and third-party skills into a tool path. Removes brain links to skills that are gone, and skips entries that another install owns. |
| `brain mcp` | Start the premise MCP server |

### Repo checks

| Command | What it does |
|---|---|
| `npm run check` | Tests, `brain skills check`, and the three checks in `scripts/` |
| `scripts/install.sh` | Install or update the whole setup |
| `scripts/uninstall.sh` | Remove the setup. Keeps the repo, the notes, and the Chrome profile. |

The install receipt decision is in [the install receipt spec](superpowers/specs/2026-10-23-install-receipt-design.md). The scripts do not write that file yet.

## MCP servers

| Server | Tools | Use |
|---|---|---|
| `brain-premises` | `premise_list`, `premise_get`, `premise_search`, `premise_add`, `premise_update`, `premise_delete` | The same premise store as the CLI. `premise_update` changes only the fields you pass. |
| `chrome-devtools` | Browser control, screenshots, console, network | UI checks with the review Chrome profile, which keeps test logins. Use this user server, not `plugin:ecc:chrome-devtools`. |
| Engram | `mem_save`, `mem_search`, and more | The session log. `harvest` reads it. The markdown notes stay the source for rules. |
| Atlassian | Jira and Confluence | The `start-ticket` flow reads the issue. |

The install registers `brain-premises` and `chrome-devtools` in Claude Code and Codex from `mcp/snippets/`. OpenCode reads them from dotfiles. Obsidian waits for `mcp/snippets/obsidian.url` and `mcp/snippets/obsidian.key`.

## Hooks and settings

| Piece | What it does |
|---|---|
| Git confirmation rules in `~/.claude/settings.json` | Commit, push, hard reset, clean, and forced branch delete ask before they run, so the premises about commit and push hold even when the model misses them. The install adds the rules and the uninstall removes them. |
| SessionStart hook in `~/.claude/settings.json` | Runs `bin/session-premises.mjs`. In any git repo, it prints the scope, the premises of that scope, and the three best flows. It skips the PR lookup, so it stays fast. |
| `.claude/settings.json` in this repo | Allows the read-only premise commands and the tests. Asks before `git commit`, `git push`, and a premise delete. |

## Files and notes

| Path | Holds | Written by |
|---|---|---|
| `memory/premises/` | Active premises, each with its `scope` | `brain premise add`, `premise_add` |
| `memory/dropped/` | Removed premises | `brain premise rm` |
| `memory/decisions/` | Decision notes | `learn`, `harvest` |
| `memory/patterns/` | Links from premises to a draft skill | `garden` |
| `memory/sessions/` | One note per review | `review-brain` |
| `memory/workspace/` | Inventory, baseline, and audit notes | `brain workspace scan`, `workspace-audit` |
| `templates/` | Shapes for each note | You and the skills |

Obsidian can open this repo as a vault. Add and remove premises with the CLI or the MCP server, not by hand, because the tools check the id, the strength, and secrets.

## Overlaps to know

- `review-brain` and `brain-reviewer` run the same review. The skill runs in your chat. The agent runs in a fresh context.

## Learn it in a week

| Day | Try this |
|---|---|
| 1 | Open a repo and read what the session hook prints. Say "What should I do next?" |
| 2 | On a feature branch, say "Review this diff." Reject one finding and state the rule. |
| 3 | Say "Use the brain-reviewer agent on this branch." Compare with day 2. |
| 4 | Say "Which of my corrections are not premises yet?" Approve the useful rows. |
| 5 | In this repo, say "What should I do next?" and run `brain-care`. |
| Later | When you repeat a task twice, ask the `next` skill to save it as a flow. |
