# Brain catalog

This page lists every part of the brain: skills, agents, flows, commands, MCP servers, hooks, scripts, and files. Each entry says what the part does, when to use it, and what to say in chat.

You talk to the agent in the code repo. The agent loads the skill and runs the command. A slash command such as `/brain-next` also works, but plain words are enough.

- Setup: [getting-started.md](getting-started.md).
- Phrases the agent maps to actions: [use-cases.md](use-cases.md).
- Repo skills against the brain copies: [repo-skills.md](repo-skills.md).

Contents:

- [Names](#names)
- [The map](#the-map)
- [Scopes](#scopes)
- [A day with the brain](#a-day-with-the-brain)
- [Brain skills](#brain-skills)
- [Agents](#agents)
- [Flows](#flows)
- [Third-party skills](#third-party-skills)
- [Commands](#commands)
- [MCP servers](#mcp-servers)
- [Hooks and settings](#hooks-and-settings)
- [Files and notes](#files-and-notes)
- [Overlaps to know](#overlaps-to-know)
- [Learn it in a week](#learn-it-in-a-week)

## Names

Every part the brain installs carries a prefix, so a session shows what came from the brain:

| Prefix | Parts |
| --- | --- |
| `brain-` | Brain skills, agents, and the MCP server `brain-premises` |
| `brain-tp-` | Third-party skills that the brain vendors. The upstream name stays in `.agents/skills/` and `skills/third-party.json`. The install links a copy named `brain-tp-<name>`. |

Skills, agents, and flows find the brain with `brain root` and a scope root with `brain scope`. `scripts/check-paths.sh` fails when one of them names an absolute home path.

The install writes a receipt to `~/.local/share/qdrant-review-brain/installed.txt`. `brain installed` prints it. A later install prints `removed` for each item that the new version dropped and removes its link. The uninstall removes each item in the receipt, then scans for links into the checkout that an install without a receipt left.

## The map

| Part | What it is | Where it lives |
| --- | --- | --- |
| Scope | A group of repos that share practices, such as `qdrant` (work) or `personal`. `*` means every scope. | `brain.config.json` |
| Premise | One rule with a strength (`always`, `never`, `prefer`), a scope, and the repos it applies to. An `active` premise applies in reviews. A `candidate` premise counts repeats in `seen` and applies nowhere until the user promotes it. | `memory/premises/` |
| Decision note | The record of a persistent rule: an explicit ask or a promoted candidate, with its evidence | `memory/decisions/` |
| Session note | The record of one review: premises applied, hits, and rejected, and a one-line body | `memory/sessions/` |
| Definition of Done (DoD) | The criteria that say when a task is done. Each criterion has an outcome, a check, a pass condition, and evidence. `brain dod lint` rejects a vague criterion. | `<git dir>/brain-dod/<branch>.md`, one per branch, never committed |
| Standing DoD | The criteria that every task of a repo keeps, such as its lint and its tests. `brain dod init` copies them into the DoD of the task. | `dod/<repo>.md` |
| Brain skill | A workflow the agent runs: review, learn, next steps | `skills/active/` |
| Draft skill | A proposed skill that no tool loads yet | `skills/drafts/` |
| Third-party skill | A vendored skill, read when a review flow needs it | `.agents/skills/`, listed in `skills/third-party.json` |
| Agent | A subagent with its own context and tools | `agents/` |
| Flow | A task you do often, with the signals that match it and its steps | `flows/` |
| `brain` command | The CLI that reads and writes premises, and reads flows, worktrees, and workspace conflicts | `bin/brain.mjs` |
| MCP server | Tools that the chat calls directly | `mcp/snippets/` |
| Session hook | Prints premises and matching flows when a chat starts | `bin/session-premises.mjs`, registered from `hooks/catalog.json` |

## Scopes

The brain serves every repo you work in, and it keeps the practices of each place apart. `brain.config.json` defines the scopes:

| Scope      | Owners of the origin     | Roots for repos with no origin |
| ---------- | ------------------------ | ------------------------------ |
| `qdrant`   | `qdrant`, `josep-qdrant` | `~/projects/qdrant`            |
| `personal` | `d0whc3r`                | `~/projects/github`            |

- The origin owner picks the scope. A copy or a worktree uses the origin of the repo it was cloned from.
- A repo with no origin takes the scope of the root that holds it.
- A repo whose owner is in no scope, such as a third-party clone, gets only the global premises: scope `*` and repos `*`.
- Each premise has one scope. A rule about one team or project takes that scope. A rule about how you work everywhere, such as git or writing habits, takes `*`.
- `brain scope` prints the scope, the repo, and the owner of the current directory.

To add a scope, add an entry with its owners and roots to `brain.config.json`, then run `brain workspace check`.

## A day with the brain

1. **Open a chat in the repo.** The session hook prints the active premises for that repo and the three flows that match its state. A copy or a worktree uses the premises of the repo it was cloned from.
2. **Ask what to do next.** Say "What should I do next here?" The `brain-next` skill reads the branch, the ticket, the changed files, and the PR, and suggests flows. Pick one.
3. **Work.** The flow names the skills, agents, MCP servers, and model. The premises apply to every step.
4. **Get a review.** Say "Review this diff." The `brain-reviewer` skill runs the review agent in a fresh context.
5. **Correct the brain.** When a finding is wrong or you state a rule, say "Remember this: ..." The `brain-learn` skill stores it, and the next review applies it.
6. **Once a week, care for the brain.** In this repo, say "What should I do next?" The `brain-care` flow checks premise use, workspace drift, and new rules in memory.

## Brain skills

These skills live in `skills/active/`. The install links them, and the third-party skills in `.agents/skills/`, into `~/.claude/skills` (Claude Code) and `~/.agents/skills` (Codex and OpenCode). A brain skill wins over a third-party skill with the same name. An entry that another install already owns stays as it is.

| Skill | What it does | Say this | What it changes |
| --- | --- | --- | --- |
| `brain-next` | Reads the repo state, suggests matching flows, and runs the one you pick | "What should I do next?" "¿Qué hago ahora?" | Nothing until you pick a flow. It writes a new flow file only after you agree. |
| `brain-learn` | Stores an explicit rule as a decision note and an active premise. Stores any other correction as a candidate that counts repeats. | "Remember this." "A partir de ahora..." "No, do it this way." | A decision note and a premise, or a candidate with one more `seen` entry. |
| `brain-harvest` | Reads Claude Code memories and Engram, and proposes premises for rules that are not premises yet | "Which of my corrections are not premises yet?" | Only the premises you approve, and one decision note. |
| `brain-garden` | Drafts a skill when three premises share a repo and a rule | "Can these rules become a skill?" | A draft in `skills/drafts/`. |
| `brain-accept-skill` | Moves a draft to `skills/active/`, commits that move, and refreshes the links | "Accept the go-error-wrapping draft." | One commit in this repo. No push. |
| `brain-worktrees` | Lists the worktrees with state and parent, plans a split of one branch into reviewable PRs, applies the plan you approve, and cleans merged worktrees | "Split this branch into PRs." "¿Qué worktrees tengo?" "Limpia los worktrees mergeados." | Worktrees and a plan in `memory/splits/`, only after you approve. No commit. |
| `brain-workspace-audit` | Compares the agent config of the repos in each scope root with the brain: drift, broken links, version drift, name collisions, and rule contradictions. It compares a repo only with the premises of its own scope. | "Do the repo rules contradict the brain?" "Do the repo skills match the brain?" | An audit note, and brain changes you approve. Never a team repo. |

### The review in detail

1. It runs `brain scope` for the repo name and its scope.
2. It calls `premise_list` for that repo and scope.
3. It reads the third-party skills whose kind matches the changed files: `go`, `proto`, `python`, `ui`, and always `review`.
4. It reviews, then tries to prove each finding wrong. It drops a finding when the input cannot reach the code or when the problem is older than the diff. It reports how many findings it dropped.
5. It checks a finding that depends on library behavior against the official docs, with `brain-tp-source-driven-development`.
6. It reports code smells from a baseline of 12 (after Fowler, via mattpocock/skills) as "possible" notes, never as findings. `brain-tp-code-simplification` shapes the fix.
7. It tags each finding with the premise that produced it, and writes `applied`, `hits`, and `rejected` in the session note.

A flow can split the review into lenses, one agent each: `premises`, `security`, `tests`, and `simplify`. Each lens reads only its own skills. `review-branch` runs all four with a model per lens. The review edits no code. On your own branch, it applies the findings you name when you ask.

`brain premise stats` reads those lists later.

## Agents

| Agent | What it does | Say this | Tools |
| --- | --- | --- | --- |
| `brain-reviewer` | Reviews a diff against the premises of the repo scope in a fresh context, without the assumptions of the session that wrote the code. Verifies each finding. Takes a lens: `premises`, `security`, `tests`, or `simplify`. | "Review this diff." "Revisa este cambio." | Read, Grep, Glob, Bash, Write (session notes only), and the read-only premise tools. No Edit. |
| `brain-split-planner` | Plans a split of one branch into worktrees: parts, files and hunks, dependencies, conflicts, and merge order | "Plan how to split this branch." | Read, Grep, Glob, Bash. Read-only. |

Every agent has a skill of the same name, so a skill is the one entry point. The install writes that skill from `templates/agent-skill.md`. It collects the repo, the branch, the scope, and your request, and runs the agent in a fresh context. A tool that cannot run a subagent, such as Codex, follows the agent file in the same session.

The install links the agents into `~/.claude/agents`. It also writes an OpenCode copy of each one, with `mode: subagent`, and links it into `~/.config/opencode/agents`.

## Flows

A flow is a file in `flows/`. Its frontmatter says when it matches and what it uses. Its body lists the steps. `brain next` ranks the flows that match: more matching signals rank higher.

| Flow | Matches when | Uses | Model | Done when |
| --- | --- | --- | --- | --- |
| `start-ticket` | `qdrant` scope, on a clean `main` | Atlassian MCP, `brain-tp-grilling`, `brain-tp-planning-and-task-breakdown` | opus | The branch exists, the plan is in chat, and you approved a DoD that `brain dod lint` accepts |
| `self-review` | Your feature branch with no PR | `brain-reviewer` in a fresh context, `brain-tp-requesting-code-review`, `brain-worktrees` | opus | Each finding has your answer. It edits code only when you ask |
| `review-branch` | Any repo, when you ask to review the branch or PR of another author | `brain-reviewer` once per lens, `brain-tp-differential-review`, `brain-tp-doubt-driven-development` | opus and sonnet per lens | Each draft PR comment has your answer |
| `ui-change-verify` | `qdrant` scope, in `qdrant-cloud-ui` with UI files changed | `chrome-devtools` MCP | sonnet | `brain dod lint --done` passes and a screenshot shows the change |
| `proto-change` | `qdrant` scope, `.proto` files changed | `brain-tp-api-and-interface-design`, `brain-tp-golang-grpc` | opus | `buf breaking` is clean and each consumer has a pin to update |
| `db-migration` | Files in `alembic/versions` or `migrations` changed |  | sonnet | One alembic head, DB tests pass |
| `sync-with-main` | Feature branch behind `origin/main` |  | sonnet | Not behind, checks pass |
| `prepare-pr` | Clean feature branch with no PR | `brain-tp-git-workflow-and-versioning`, `brain-tp-verification-before-completion` | sonnet | `brain dod lint --done` passes and you have the PR draft |
| `address-review` | The PR is open or has changes requested | `brain-tp-receiving-code-review`, `brain-learn` | opus | Each comment has a fix or a drafted reply |
| `brain-care` | In this repo | `brain-workspace-audit`, `brain-harvest`, `brain-garden`, `brain-tp-writing-for-agents` | sonnet | `npm run check` passes and each flagged premise has a decision |
| `split-branch` | Feature branch, when you ask to split it or `brain-next` sees a big diff | `brain-split-planner`, `brain-worktrees` | opus for the plan, sonnet to apply | Each part has a worktree whose checks pass, and no change is lost |
| `grill-plan` | Any repo, when you ask to stress-test a plan ("grill this") | `brain-tp-grilling`, `brain-tp-doubt-driven-development` | opus | No open question is left and you confirm the shared understanding |

### Signals

| Signal   | Values                                                             |
| -------- | ------------------------------------------------------------------ |
| `scopes` | Scope names, or `*`                                                |
| `repos`  | Origin repo names, or `*`                                          |
| `kinds`  | `go`, `python`, `proto`, `ui`, `migration`, `docs`, `test`, `deps` |
| `branch` | `main` or `feature`                                                |
| `dirty`  | `true` or `false`                                                  |
| `pr`     | `none`, `draft`, `open`, `changes_requested`, `approved`           |
| `behind` | `true` or `false`                                                  |

### Change a flow

- Say "Use sonnet for self-review." The `brain-next` skill edits the `model` field and shows the diff.
- Say "Add a step to prepare-pr: run the e2e tests." The skill edits the steps.
- Do a task that no flow covers. At the end, the skill offers to save it as a new flow with the signals that would have matched.

[flows/README.md](../flows/README.md) has every field.

## Third-party skills

The repo keeps every third-party skill once, in `.agents/skills/`, in the open Agent Skills format that Claude Code, Codex, and OpenCode all read. The install links them next to the brain skills. `brain-reviewer` reads the ones whose kind matches the diff. A kind is a type of changed file, the same values that flows use. `brain skills check` confirms each one is present. `brain skills add` installs only into `.agents/skills/`, so no copy lands in another tool folder.

| Kind | Skills |
| --- | --- |
| `review` | `brain-tp-api-and-interface-design`, `brain-tp-doubt-driven-development`, `brain-tp-code-review-and-quality`, `brain-tp-security-and-hardening`, `brain-tp-code-simplification`, `brain-tp-source-driven-development`, `brain-tp-performance-optimization` |
| `go` | `brain-tp-deprecation-and-migration`, `brain-tp-observability-and-instrumentation`, `brain-tp-golang-code-style`, `brain-tp-golang-error-handling`, `brain-tp-golang-testing`, `brain-tp-golang-safety`, `brain-tp-golang-grpc`, `brain-tp-golang-performance`, `brain-tp-golang-observability`, `brain-tp-golang-security`, `brain-tp-golang-concurrency`, `brain-tp-golang-context` |
| `proto` | `brain-tp-api-and-interface-design`, `brain-tp-golang-grpc`, `brain-tp-protobuf` |
| `python` | `brain-tp-deprecation-and-migration`, `brain-tp-sqlalchemy-alembic-expert-best-practices-code-review`, `brain-tp-python-testing-patterns`, `brain-tp-fastapi-python` |
| `migration` | `brain-tp-sqlalchemy-alembic-expert-best-practices-code-review` |
| `test` | `brain-tp-vitest`, `brain-tp-python-testing-patterns`, `brain-tp-test-driven-development` |
| `ui` | `brain-tp-vercel-react-best-practices`, `brain-tp-vercel-composition-patterns`, `brain-tp-accessibility`, `brain-tp-web-design-guidelines`, `brain-tp-tanstack-query`, `brain-tp-tanstack-router`, `brain-tp-vitest`, `brain-tp-zod-validation`, `brain-tp-typescript-advanced-types`, `brain-tp-react-hook-form`, `brain-tp-frontend-design` |
| `workflow` | `brain-tp-using-agent-skills`, `brain-tp-retro`, `brain-tp-diagnosing-bugs`, `brain-tp-handoff`, `brain-tp-grilling`, `brain-tp-planning-and-task-breakdown`, `brain-tp-receiving-code-review`, `brain-tp-verification-before-completion`, `brain-tp-git-workflow-and-versioning`, `brain-tp-writing-for-agents`, `brain-tp-differential-review`, `brain-tp-requesting-code-review` |

`brain-reviewer` loads every kind except `workflow`. A `workflow` skill belongs to the flows that name it, so a review does not pay its context cost.

`brain-tp-web-design-guidelines` downloads its rules from GitHub each time it runs, so its rules can change between reviews.

Two internal skills help with skills: `find-skills` finds a third-party skill, and `skill-creator` writes and validates one. Say "Is there a skill for Go context cancellation?" or "Write a skill for our proto field numbers." A new skill goes to `skills/drafts/`.

Add a skill to the catalog with `brain skills add owner/repo --skill NAME --kind KIND`. Update the copies with `pnpm skills:update`. It also downloads the `../../references/` files that `addyosmani/agent-skills` skills link into `.agents/references/`, and `npm run check` fails when one is missing.

## Commands

The agent runs these. You can run them too.

### Premises

| Command | What it does |
| --- | --- |
| `brain premise list [--repo NAME] [--scope NAME] [--status active\|candidate]` | Active premises with their scope, or candidates with `--status candidate`. `--scope ""` lists what a repo in no scope gets. |
| `brain scope [--cwd DIR]` | The scope, repo, owner, and scope root of a directory |
| `brain root` | The path of the brain checkout |
| `brain premise add TEXT --strength S --scope SCOPE --repo R [--id ID] [--source PATH] [--status candidate]` | Add a premise. Rejects a bad strength, an unknown scope, and text that looks like a secret. |
| `brain premise seen ID --repo R --origin correction\|defect [--date YYYY-MM-DD]` | Record one repeat of a rule |
| `brain premise promote ID` | Make a candidate active |
| `brain premise show ID` | One premise |
| `brain premise rm ID` | Move a premise to `memory/dropped/` |
| `brain premise search QUERY [--repo NAME] [--scope NAME] [--status active\|candidate]` | Literal text or ID search. Defaults to active and candidate; optional filters match `list`. |
| `brain premise stats` | Per active premise: applied, hits, rejected, and last use, with a flag: `unused`, `stale` (not applied in 90 days), `noisy` (rejected 2 times or more, and at least as often as applied), or `idle` (applied 10 times or more with no hit). Per candidate: repeats and last repeat, with a flag: `ready` (2 corrections or 3 defects on 2 distinct days or more) or `expired` (no repeat in 30 days). |

Pass at least one `--repo` when you add a premise. Use `--repo "*"` for every repo in its scope.

Updates and deletes keep the Markdown body and additional Obsidian metadata. If you reuse an ID, deletion keeps both archived versions in `memory/dropped/`.

`brain premise stats` reads the `applied` and `rejected` lists in `memory/sessions/`. It marks a rule `unused` when no review applies it, or `stale` after 90 days without use. It marks a rule `noisy` after at least two rejections, when rejections equal or exceed applications.

### Next steps

| Command | What it does |
| --- | --- |
| `brain next [--cwd DIR] [--json] [--no-pr] [--request TEXT]` | Repo state and the matching flows. With `--request` and a `decide` block, also the flow that the local decision model suggests |
| `brain flows` | Every flow with its model |
| `brain worktree list [--cwd DIR] [--json]` | Each worktree with its branch, state (`main`, `active`, `merged`, `gone`, `detached`, `prunable`), parent branch, ahead, behind, and uncommitted files |
| `brain dod path [--cwd DIR]` | The DoD file of the branch |
| `brain dod init [--cwd DIR] [--title TEXT] [--replace]` | Writes the DoD of the branch from `templates/dod.md`, with the standing criteria of the repo. `--replace` overwrites the DoD of an earlier task on the same branch |
| `brain dod lint [--cwd DIR] [--done]` | Checks that each criterion names an observable outcome, a check that can fail, and a concrete pass condition, and that the standing criteria are there. With `--done`, also checks that each criterion is checked, with evidence for the current code and the current check |
| `brain dod run [--cwd DIR]` | Prints the tree, runs each command check at the repo top, and writes the time, the tree, a hash of the criterion, and the exit code as evidence. It checks a criterion only when the exit code and each quoted text of `pass` match. It refuses a check that commits, pushes, resets, cleans, or deletes a branch |

### Workspace and skills

| Command | What it does |
| --- | --- |
| `brain workspace check` | The conflicts between the repos in the scope roots and the brain, read from disk now: `broken`, `version`, `collision`. Exit 1 when it prints a line. |
| `pnpm skills:drift` | Short name for `brain workspace check` |
| `brain skills list` / `check` / `add` / `update` / `sync` / `remove` | Manage the third-party catalog and the vendored copies |
| `brain accept-skill NAME` | Move a draft to active and commit |
| `brain link-skills --target PATH [--apply]` | Link the brain and third-party skills into a tool path. Removes brain links to skills that are gone, and skips entries that another install owns. |
| `brain mcp` | Start the premise MCP server |
| `brain mcp check` | Start a fresh server over stdio and verify its code version, tool schemas, and shared premise store. This checks a new process, not a connection already held by an app. |
| `brain installed` | The install receipt: each skill, agent, command, MCP server, hook, and instruction block the install added |

### Repo checks

| Command                | What it does                                                         |
| ---------------------- | -------------------------------------------------------------------- |
| `npm run check`        | Tests, `brain skills check`, and the four checks in `scripts/`       |
| `scripts/install.sh`   | Install or update the whole setup                                    |
| `scripts/uninstall.sh` | Remove the setup. Keeps the repo, the notes, and the Chrome profile. |

The install receipt decision is in [the install receipt spec](superpowers/specs/2026-10-23-install-receipt-design.md). The scripts do not write that file yet.

## MCP servers

| Server | Tools | Use |
| --- | --- | --- |
| `brain-premises` | `premise_list`, `premise_get`, `premise_search`, `premise_add`, `premise_update`, `premise_seen`, `premise_delete` | The same premise store and scope validation as the CLI. `premise_update` changes only the fields you pass. `premise_seen` records one repeat. |
| `chrome-devtools` | Browser control, screenshots, console, network | UI checks with the review Chrome profile, which keeps test logins. Use this user server, not `plugin:ecc:chrome-devtools`. |
| Engram | `mem_save`, `mem_search`, and more | The session log. `brain-harvest` reads it. The markdown notes stay the source for rules. |
| Atlassian | Jira and Confluence | The `start-ticket` flow reads the issue. |

The install registers `brain-premises` and `chrome-devtools` in Claude Code and Codex from `mcp/snippets/`. OpenCode reads them from dotfiles. Obsidian waits for `mcp/snippets/obsidian.url` and `mcp/snippets/obsidian.key`.

## Hooks and settings

| Piece | What it does |
| --- | --- |
| Git confirmation rules in `~/.claude/settings.json` | Commit, push, hard reset, clean, and forced branch delete ask before they run, so the premises about commit and push hold even when the model misses them. The install adds the rules and the uninstall removes them. |
| Session premises hook | The install writes it for Claude Code, Codex, and OpenCode from [hooks/catalog.json](../hooks/catalog.json). In any git repo, it prints the scope, the premises of that scope, and the three best flows. It skips the pull-request lookup, so it stays fast. Codex skips a new hook until you trust it in `/hooks`. |
| `.claude/settings.json` in this repo | Allows the read-only premise commands and the tests. Asks before `git commit`, `git push`, and a premise delete. |

## Files and notes

| Path | Holds | Written by |
| --- | --- | --- |
| `memory/premises/` | Active and candidate premises, each with its `scope` | `brain premise add`, `premise_add` |
| `memory/dropped/` | Removed premises | `brain premise rm` |
| `memory/decisions/` | Decision notes | `brain-learn`, `brain-harvest` |
| `memory/patterns/` | Links from premises to a draft skill | `brain-garden` |
| `memory/sessions/` | One note per review | `brain-reviewer` |
| `memory/workspace/` | Audit notes | `brain-workspace-audit` |
| `templates/` | Shapes for each note | You and the skills |

Git keeps active and candidate premises of every scope in `memory/premises/`, the decision notes in `memory/decisions/`, the dropped premises in `memory/dropped/`, the templates, and the `.gitkeep` files that preserve the folder layout. Other memory files stay local: sessions and screenshots, draft patterns, workspace audits, and split plans. New memory folders are local by default.

The `source` of a premise names a decision note that git keeps, so a fresh clone can read the reason for each rule. A dropped premise reaches every clone, so a restore works on any machine. A fresh clone has no review history or usage counts, because sessions stay local.

Obsidian can open this repo as a vault. Add and remove premises with the CLI or the MCP server, not by hand, because the tools check the id, the strength, and secrets.

## Overlaps to know

- The skill `brain-reviewer` and the agent `brain-reviewer` are one review. The skill is the entry point, and the agent does the work.

## Learn it in a week

| Day   | Try this                                                                            |
| ----- | ----------------------------------------------------------------------------------- |
| 1     | Open a repo and read what the session hook prints. Say "What should I do next?"     |
| 2     | On a feature branch, say "Review this diff." Reject one finding and state the rule. |
| 3     | Say "Split this branch into PRs." Read the plan before you approve it.              |
| 4     | Say "Which of my corrections are not premises yet?" Approve the useful rows.        |
| 5     | In this repo, say "What should I do next?" and run `brain-care`.                    |
| Later | When you repeat a task twice, ask the `brain-next` skill to save it as a flow.      |
