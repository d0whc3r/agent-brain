# One code index per project across clones and worktrees: assessment

Date: 2026-10-25.

Summary: Do not use graphify as one shared code index for all the clones and worktrees of a repo. No tool that fits our use keeps one correct index for several worktrees, because each worktree holds a different branch, and graphify's own docs say "Avoid multiple branches writing into one output location". The better design is one project identity, which the brain already gets from the git origin, and one index per checkout, made automatic and kept free of copies. A full CodeGraph index of `qdrant-cloud-ui` took 4.3 s and a sync after a one-file edit took 1.4 s, so a separate index per worktree costs little. The proposed premise is short but not useful: it names a tool and a setup step, a reviewer cannot check it in a diff, and it is false with every tool checked. Nothing is installed or changed.

Status: proposal for evaluation. The user asked how graphify could give one indexed project to all the folders and worktrees of one repo, whether that rule would make a concise and useful premise, whether the idea is viable, and whether better options exist.

Location: `communications/` holds standalone communications. This document is not a flow, skill, agent, premise, hook, or MCP resource. It follows [the brain tools assessment](2026-10-25-brain-tools-assessment.md) and the design decision in [the agent brain design](../docs/superpowers/specs/2026-10-23-agent-brain-design.md): "Keep them. Do not add a third code-search server."

Contents:

- [Recommendation](#recommendation)
- [Rating of the proposed premise](#rating-of-the-proposed-premise)
- [graphify as the shared index](#graphify-as-the-shared-index)
- [One identity, one index per tree](#one-identity-one-index-per-tree)
- [Alternatives compared](#alternatives-compared)
- [Observed state of this workspace](#observed-state-of-this-workspace)
- [Measurements](#measurements)
- [Stale text and config found](#stale-text-and-config-found)
- [graphify pilot, if wanted](#graphify-pilot-if-wanted)
- [Unknowns](#unknowns)
- [Applied premise snapshot](#applied-premise-snapshot)
- [Sources](#sources)

| Label      | Meaning                                                                         |
| ---------- | ------------------------------------------------------------------------------- |
| Observed   | Read from this checkout, a local command, or a local repo on this date.         |
| Measured   | Timed on this machine on this date: Apple M4 Pro, 24 GB.                        |
| Documented | Stated by the official README, docs, changelog, license, or source of the tool. |
| Reported   | GitHub issues, pull requests, blog posts, or reviews. Not reproduced here.      |
| Proposed   | A suggested change or experiment. Not implemented.                              |
| Unknown    | Needs a measurement or a user decision.                                         |

## Recommendation

Do these steps in order. Each step is Proposed. Steps 1 and 2 need a decision of the user, because they change the earlier design decision to keep two code-search servers.

1. Keep one index per checkout. A clone and a linked worktree each get their own index. Do not point two branches at one index. The section [One identity, one index per tree](#one-identity-one-index-per-tree) gives the reason.
2. Choose one primary code index for Claude Code, Codex, and OpenCode, and remove the "first" order of the other one. Today two hooks give two "first" orders (Observed). The proposed primary is CodeGraph, for three reasons:
   - It is the index in use: 18 `.codegraph/` folders under `~/projects`, against one codebase-memory-mcp project (Observed).
   - It detects a borrowed index: when a nested worktree walks up to the index of the main checkout, it warns (Documented, `sync/worktree.ts`).
   - `codegraph install` registers it in Codex CLI and opencode with one command (Observed, `codegraph --help`).

   Before the choice, check that CodeGraph answers a protobuf question in `qdrant-cloud-public-api`. Its language list does not name protobuf (Unknown). codebase-memory-mcp documents protobuf and gRPC routes, and it runs in all three hosts already. When protobuf matters more than the points above, make codebase-memory-mcp the primary instead, and upgrade it from 0.8.1 to 0.12.1 first.

3. Make the index of a new worktree automatic. The `brain-worktrees` skill and the `split-branch` flow create worktrees with `git worktree add ../<repo>-<slug>`. Add one step after it: `codegraph init -y <path>`. The index lives inside the worktree folder, so `git worktree remove` deletes it with the worktree (Observed in a scratch repo). This step changes an active skill, so it waits for the user to accept that skill change.
4. Keep `.codegraph/` out of git status in every repo. Add `.codegraph/` to the global excludes file `~/.gitignore`. Today only some repos have it in `.git/info/exclude`, and a fresh clone shows `?? .codegraph/` (Observed). A team `.gitignore` does not change.
5. Keep copies out of every index. The CodeGraph index at the scope root `~/projects/qdrant` holds 3,854 files from `qdrant-cloud-ui-copy` and `qdrant-cloud-ui-copy2`, 13.3% of its 28,962 files (Observed). An agent that queries it can quote stale copy code as the reference. Keep this index, because it is the only one that links the UI, the protos, and the Go services across repos. Add exclude globs for the copy folders and the worktree folders to its `.codegraph/config.json`, then run `codegraph index ~/projects/qdrant`. Keep the engine repo `qdrant/` in it only when cross-repo questions need it.
6. Use the brain identity as "one project". `resolveRepo` in `lib/scope.mjs` names a repo from its origin, so the three clones of `qdrant/qdrant-cloud-ui` and all their worktrees already share premises and the standing DoD in `dod/qdrant-cloud-ui.md` (Observed). The index does not need the same key. No change is needed.
7. Do not install graphify now. Revisit it when [#3889](https://github.com/Graphify-Labs/graphify/issues/3889) (a store keyed by the git common dir) and [#4740](https://github.com/Graphify-Labs/graphify/issues/4740) (TypeScript files skip the cache) close. Its possible role then is a read-only architecture map of the default branch, not the reference for the code you change.

## Rating of the proposed premise

The request implies this premise:

> always: Index each repo once with graphify, and make every clone and worktree of that repo query that one index.

| Test | Result |
| --- | --- |
| One literal sentence | Yes. |
| A coding or review rule | No. It is a setup step. AGENTS.md says "Premises are rules. Skills are workflows." |
| A reviewer can check it in a diff | No. A diff does not show which index an agent queried. |
| Stays true when a tool changes | No. It names one tool. |
| True with the tools available | No. A shared index shows the code of one branch in every worktree. CodeGraph, codebase-memory-mcp, Serena, and graphify all say so or build one index per tree. |
| Fits the design | No. The design says "Do not add a third code-search server." |

Verdict: concise, not useful. The need belongs in the install script, the `brain-worktrees` skill, and the global excludes file, as the [Recommendation](#recommendation) describes.

One rule in this area would make a valid premise, because a reviewer can check it and no tool change makes it wrong:

> never: Take a code pattern, a symbol, or a call path from a clone or a worktree other than the checkout you change.

It covers the borrowed index of a nested worktree, the root index that holds the copies, and the copy folders. Two places already hold its copy-folder form: section 8 of this repo's AGENTS.md and the `qdrant` scope root AGENTS.md. The user did not ask for this rule, so `memory-only-what-repeats` makes it a candidate at most. When the user promotes it, `one-place-per-rule` asks that both AGENTS.md lines point to the premise instead of repeating it. This assessment adds no premise.

## graphify as the shared index

graphify is a Python CLI and assistant skill, PyPI package `graphifyy`, version 0.9.95 of 2026-10-23, Apache-2.0, with about 135,000 GitHub stars and 1,635 open issues (Documented, GitHub API). Graphify Labs is a YC S26 company. Its paid Graphify Cloud lists "monorepo and cross-repo support" as a cloud feature (Documented, README).

What it does (Documented, README):

- It parses code with tree-sitter for about 40 languages, with no LLM. Docs, PDFs, and images go through an LLM pass. `--code-only` or `GRAPHIFY_BACKEND=none` keeps the run local.
- It writes `graphify-out/` in the scan root: `graph.json`, `GRAPH_REPORT.md`, `graph.html`, `cache/`, and `manifest.json`.
- `graphify query`, `graphify path`, and `graphify explain` read `graph.json`. An MCP server serves the same graph, and since 0.9.5 one server can serve many projects through a `project_path` argument.
- `graphify hook install` adds `post-commit` and `post-checkout` hooks that rebuild the graph.
- `graphify install` adds a Claude Code `PreToolUse` nudge on Bash search commands and on `Read|Glob`, and an AGENTS.md block for Codex and OpenCode.

What it offers for several checkouts of one repo:

| Item | Evidence |
| --- | --- |
| `GRAPHIFY_OUT` sets the output folder, as a name or an absolute path | Added in 0.6.9 for "sharing one graph across multiple git worktrees" ([#686](https://github.com/Graphify-Labs/graphify/issues/686)). Honoured by every CLI command since 0.8.45. The `/graphify` skill still ignores it ([#2571](https://github.com/Graphify-Labs/graphify/issues/2571), open). Documented, Reported |
| Docs advice on shared output | "Avoid multiple branches writing into one output location." "Set `GRAPHIFY_OUT` to a worktree-specific directory when you use a shared or custom output setup." Documented, team workflows guide |
| Git hooks in a linked worktree | Both hooks stop in a linked worktree since 0.9.14 ([#1809](https://github.com/Graphify-Labs/graphify/issues/1809)). A commit in a worktree rebuilds no graph. Documented |
| Read the main graph from a worktree | Fails with "graph file not found". [#2008](https://github.com/Graphify-Labs/graphify/issues/2008) and its fix [PR #2064](https://github.com/Graphify-Labs/graphify/pull/2064) are open. Reported |
| One store per repo, keyed by the git common dir | Proposed in [#3889](https://github.com/Graphify-Labs/graphify/issues/3889), open since 2026-09-28: worktrees read the graph, only the primary checkout writes it. Reported |
| Copy the main graph into a worktree | [#2654](https://github.com/Graphify-Labs/graphify/issues/2654), open: the incremental pass treats the whole corpus as changed. [#4740](https://github.com/Graphify-Labs/graphify/issues/4740), open: on a 19,397-file monorepo, `graphify update` re-extracted every file in 3 to 7 minutes with about 6 GB of memory, even with no change. A commenter found that `.ts`, `.tsx`, `.js`, and `.jsx` files skip the AST cache on every run. Reported |
| Duplicate worktree code in one graph | Until 0.9.14, nested worktrees were scanned: one repo grew from about 9,400 to about 210,000 nodes ([#1810](https://github.com/Graphify-Labs/graphify/issues/1810)). A worktree next to its clone is still scanned twice when the scan root is a plain workspace folder ([#4683](https://github.com/Graphify-Labs/graphify/issues/4683), open). Documented, Reported |
| A committed `graphify-out/` | It conflicts on every parallel branch. The maintainer advice in [#1626](https://github.com/Graphify-Labs/graphify/issues/1626) is to not track it. Reported |

Viability:

- One shared graphify index for all checkouts: not viable now. The tool has no shared store, its docs advise against it, and its hooks skip worktrees.
- A graph per worktree: viable but costly for our repos. TypeScript skips the cache, so each update of `qdrant-cloud-ui` parses every TypeScript file again. The output folder lands in team repos unless `GRAPHIFY_OUT` is absolute.
- A read-only map of the default branch: viable with a small shell wrapper that sets an absolute `GRAPHIFY_OUT` per origin and builds only from the primary checkout. It adds a third code-search tool, a Python toolchain, and a third assistant hook next to the rtk Bash rewrite and the codebase-memory-mcp hooks.

What graphify does better than the indexes we have: one graph over code and docs, community detection, the `GRAPH_REPORT.md` overview, and `graphify prs --conflicts`, which lists open PRs that touch the same graph communities (Documented). None of these is a code reference for the checkout you change.

Benchmarks: the project reports 82.0% key-fact coverage against 70.8% for a grep and read baseline on ERPNext, from six questions on its own harness, at about 140,000 tokens per query (Documented, BENCHMARKS.md). The README headline of 71.5 times fewer tokens comes from a 52-file mixed corpus. A review estimates 6.8 to 49 times on repos of 500 or more files (Reported, roborhythms). Another review advises a two-week pilot on 20 real questions with a pinned version (Reported, wavect). No independent benchmark on code questions was found.

Two more facts:

- An old review says the Claude Code hook died when Claude Code 2.1.117 removed the Grep and Glob tools. graphify fixed it: the hook now matches Bash ([#578](https://github.com/Graphify-Labs/graphify/issues/578), closed 2026-04-27). Documented
- The README says every query goes to `~/.cache/graphify-queries.log` by default. The configuration page says query logging is off by default. Unknown which one is right for 0.9.95.

## One identity, one index per tree

A worktree exists to hold a different branch. A code index describes one tree. One index shared by several worktrees answers for one tree only. In the other worktrees it hides the new symbols and shows the deleted ones. The CodeGraph maintainer closed the request to share an index ([#155](https://github.com/colbymchenry/codegraph/issues/155), 2026-05-26) with this reason: "a single index can't correctly represent multiple branches at once". The Serena maintainer said "There are no plans to do this" ([#805](https://github.com/oraios/serena/issues/805)).

A correct shared index needs two layers. GitNexus shows the design: one fixed graph per commit, shared by every clean checkout at that commit, and a private copy-on-write graph for a checkout with local edits. Its key is the worktree link or the normalized origin URL (Documented, GitNexus CLI reference). Cursor does a server-side form: it reuses the index of a similar tree, matched by a Merkle-tree similarity hash (Documented, Cursor blog). Neither fits us: GitNexus has a noncommercial license, and the Cursor index serves only Cursor.

What "one project" can mean today is one identity. The brain gives it already, from the origin. The index stays per tree, and the [Measurements](#measurements) show that a per-tree index of our repos costs seconds, not minutes. A shared index would save little.

## Alternatives compared

| Tool | Shares one index across worktrees | Project key | Hosts | License | Verdict |
| --- | --- | --- | --- | --- | --- |
| CodeGraph 1.6.2 | No, by design. Warns on a borrowed index. Share request [#1236](https://github.com/colbymchenry/codegraph/issues/1236) open | Nearest `.codegraph/` folder | Claude Code now. `codegraph install` covers Codex and opencode | MIT | Primary candidate |
| codebase-memory-mcp 0.12.1, local 0.8.1 | No. Overlay request [#573](https://github.com/DeusData/codebase-memory-mcp/issues/573) closed, "design work". An opt-in `.codebase-memory/graph.db.zst` snapshot seeds a new clone | Name from the absolute path | All three, one daemon | MIT | Primary candidate when protobuf matters most |
| graphify 0.9.95 | No. Manual `GRAPHIFY_OUT`, store request [#3889](https://github.com/Graphify-Labs/graphify/issues/3889) open | Output folder path | All three, through the skill and AGENTS.md | Apache-2.0 | Later, as a read-only map |
| GitNexus 1.6.13-rc | Yes, a graph per commit plus a private copy for local edits. Only in release candidates; npm `latest` is 1.6.12 | Worktree link or origin URL | MCP | PolyForm Noncommercial 1.0.0 | Rejected for the `qdrant` scope. Watch for the `personal` scope |
| Serena 2.1.0 | No, "no plans" | Project path | MCP | GPL-3.0-or-later | Rejected. A language server per worktree, no sharing |
| claude-context 0.1.15 | No. Collection name from the path hash, [#271](https://github.com/zilliztech/claude-context/issues/271) open | md5 of the absolute path | MCP | MIT | Rejected. Needs Milvus or Zilliz Cloud, and the user chose local tools with no paid service |
| code-graph-rag 0.3.13 | No. Worktree bugs open | Folder name plus hash | MCP | MIT | Rejected. Needs a Memgraph server |
| Cursor index reuse | Yes, server side | Merkle similarity | Cursor only | Closed | Not usable from our hosts |

Notes on the two candidates (Documented unless marked):

- CodeGraph keeps the index in `<root>/.codegraph/codegraph.db`. A file watcher with a 2,000 ms delay syncs it, and optional `post-commit`, `post-merge`, and `post-checkout` hooks run `codegraph sync` when the watcher is off. Its own numbers: 62% fewer tokens and 88% fewer tool calls on seven repos (maintainer measurement).
- codebase-memory-mcp keeps the index in `~/.cache/codebase-memory-mcp/`. A git-polling watcher covers projects that a live MCP session registered. It parses Go, TypeScript, Python, Rust, and protobuf with gRPC routes. Open issues report a stalled full index in a linked worktree (#1300), duplicate index workers from two sessions (#2673), and stale indexes that are never pruned (#1431) (Reported).

## Observed state of this workspace

Hosts and hooks:

- Claude Code registers `codegraph` and `codebase-memory-mcp`. Codex and OpenCode register only `codebase-memory-mcp`.
- Claude Code hooks: `UserPromptSubmit` runs `codegraph prompt-hook`. `PreToolUse` with matcher `Grep|Glob` runs `cbm-code-discovery-gate`, which only adds context. `SessionStart` runs `cbm-session-reminder` for `startup`, `resume`, `clear`, and `compact`.
- The global CLAUDE.md says to use CodeGraph first. The `cbm-session-reminder` text says "ALWAYS use codebase-memory-mcp tools FIRST".

Indexes:

- CodeGraph: 18 `.codegraph/` folders under `~/projects` at depth four or less.
- codebase-memory-mcp: one project, `stickman-battle`, 1.8 MB. The installed version is 0.8.1. The latest release is 0.12.1 of 2026-10-16.
- The scope root index `~/projects/qdrant/.codegraph` is 1.2 GB with 28,962 files and 297,582 nodes. It holds 1,845 files of `qdrant-cloud-ui-copy`, 2,007 of `qdrant-cloud-ui-copy2`, and 2,300 of the engine repo `qdrant/`. Its newest file entry is from 2026-10-23 12:59.

Same repo in several folders:

- `qdrant/qdrant-cloud-ui` has three clones: `qdrant-cloud-ui`, `qdrant-cloud-ui-copy`, and `qdrant-cloud-ui-copy2`.
- `MadsLorentzen/ai-job-search` has two clones: `~/projects/ai-job-search` and `~/projects/github/ai-job-search`.
- `qdrant-cloud-ui-copy2` has four linked worktrees in `qdrant-cloud-ui-copy2-wt/`, on the branches of SVL-61, SVL-62, and SVL-70, created on 2026-10-23.
- `qdrant-cloud-ui-copy` has one linked worktree under `~/projects/qdrant/worktrees/`.
- `monedix` has one worktree nested in `.claude/worktrees/` and one detached worktree under `~/.claude/jobs/`.
- `qdrant-cloud-ui-buf-plugins` has one prunable worktree in `/private/tmp/restack`.

Ignore entries:

- `qdrant-cloud-ui` lists `.codegraph/` in `.git/info/exclude`. Linked worktrees share that file.
- The global excludes file is `~/.gitignore`, and it has no `.codegraph` entry.

## Measurements

Each run used a `git clone --local` copy in the session scratchpad, so no work repo changed. The scratch copies and the scratch codebase-memory-mcp projects were deleted after the runs.

| Repo, commit | Tracked files | Tool | Action | Wall time | Result |
| --- | --- | --- | --- | --- | --- |
| `qdrant-cloud-ui`, `4efc66b84` of 2026-10-22 | 2,243 | CodeGraph 1.6.2 | Full index of the clone | 4.59 s | 24,058 nodes, 57,995 edges, 108 MB |
| Same | 2,243 | CodeGraph 1.6.2 | Full index of a linked worktree | 4.33 s | Same counts. Before the index, the worktree had none, because it is a sibling folder |
| Same | 2,243 | CodeGraph 1.6.2 | `codegraph sync` after one edited `.tsx` file | 1.38 s | The new constant was found |
| Same | 2,243 | codebase-memory-mcp 0.8.1 | Full index of the clone | 1.36 s | 13,634 nodes |
| Same | 2,243 | codebase-memory-mcp 0.8.1 | Full index of the linked worktree | 1.29 s | A second project, keyed by the worktree path |
| `qdrant-cloud` | 10,442 | CodeGraph 1.6.2 | Full index of the clone | 4.75 s | 7,390 nodes, 25 MB |

Also observed in the scratch runs:

- `codegraph init` does not add `.codegraph/` to any ignore file. The fresh clone showed `?? .codegraph/`.
- With `.codegraph/` in the main `.git/info/exclude`, a linked worktree shows a clean status, and `git worktree remove` succeeds and deletes the index.

Four worktrees of `qdrant-cloud-ui` with CodeGraph cost about 430 MB of disk and about 18 s of index time in total.

## Stale text and config found

These items are outside the request. They are reported here and not changed.

- The `qdrant` scope root AGENTS.md lists `qdrant-cloud-ui-copy2/` as a stale copy to "never modify". That clone has four active feature worktrees from 2026-10-23.
- The `cbm-code-discovery-gate` hook matches `Grep|Glob`. Claude Code 2.1.310 runs here, and this session has no Grep or Glob tool. graphify fixed the same problem in its own hook ([#578](https://github.com/Graphify-Labs/graphify/issues/578)). The hook probably never fires (Unknown until a hook log confirms it).
- codebase-memory-mcp is four minor versions behind: 0.8.1 installed, 0.12.1 released.
- The worktree of `qdrant-cloud-ui-buf-plugins` in `/private/tmp/restack` is prunable.

## graphify pilot, if wanted

Run this only after the user agrees, because it downloads and runs a third-party tool. Use a scratch clone, so no work repo changes.

1. Clone `qdrant-cloud-ui` with `git clone --local` into a scratch folder.
2. Run `GRAPHIFY_BACKEND=none uvx --from graphifyy==0.9.95 graphify extract . --code-only --out <scratch>/graph`. Record the wall time and the node count.
3. Edit one `.tsx` file, then run `graphify update` with the same output folder. Record the time. A time close to step 2 confirms the TypeScript cache bypass of #4740.
4. Ask 10 real questions about `qdrant-cloud-ui` through `graphify query` and through `codegraph explore`. Record correct answers and tokens for each.
5. Keep graphify only when it answers more questions correctly than CodeGraph, or answers a kind of question that CodeGraph cannot.

A per-origin output folder for the read-only map could come from a wrapper such as this one (Proposed, not tested):

```bash
repo=$(git remote get-url origin | sed -E 's#.*[:/]([^/]+)/([^/]+)$#\1__\2#; s#\.git$##')
export GRAPHIFY_OUT="$HOME/.cache/graphify/$repo"
```

## Unknowns

- Whether CodeGraph answers protobuf questions, such as which service implements an RPC of `qdrant-cloud-public-api`.
- Index times of codebase-memory-mcp 0.12.1 against 0.8.1.
- Whether the next `codegraph sync` of the scope root index adds the four worktrees of `qdrant-cloud-ui-copy2-wt/` as more copies.
- Whether the `cbm-code-discovery-gate` hook fires at all in Claude Code 2.1.310.
- Which graphify query log default holds in 0.9.95.
- Whether the docs and community layer of graphify answers questions that CodeGraph cannot, for our repos.

## Applied premise snapshot

- `docs-summary-first` (always): "Write each documentation file summary first: the title, a short summary of the main point and of what the reader must know or do, a table of contents when the file has four or more ## sections, and then the sections from most to least important, with background and detail last."
- `no-hard-wrapped-markdown` (never): "Hard-wrap Markdown prose."
- `dod-before-done` (always): "Before a task changes files in a git repo, agree its Definition of Done with the brain-dod skill, and call the task done only when brain dod lint --done prints ok." The user approved the DoD of this task before the file was written.
- `stay-in-request-scope` (always): "Keep a change inside the request, and mention unrelated dead code or stale text instead of changing it." The section [Stale text and config found](#stale-text-and-config-found) lists four items and changes none.
- `memory-only-what-repeats` (always): "Store a rule only when it is important: an explicit ask becomes a premise, any other correction becomes a candidate that waits for a repeat." This assessment adds no premise.
- `one-place-per-rule` (always): "Keep each rule, constant, format, and schema in one place." The candidate premise would replace two AGENTS.md copies, not add a third.
- `abstraction-needs-two-uses` (never): "Add an interface, design pattern, extension point, config option, boolean flag, or forwarding wrapper with fewer than two real variants in the code now." No `brain index` command or index config is proposed for the brain.
- `no-commit-push-unasked` (never): "Run git add, git commit, or git push without an explicit request in that turn." Nothing is staged or committed.

## Sources

- [graphify repository and README](https://github.com/Graphify-Labs/graphify)
- [graphify CHANGELOG](https://github.com/Graphify-Labs/graphify/blob/v8/CHANGELOG.md)
- [graphify BENCHMARKS](https://github.com/Graphify-Labs/graphify/blob/v8/BENCHMARKS.md)
- [graphify team workflows](https://docs.graphify.com/guides/team-workflows)
- [graphify configuration](https://docs.graphify.com/reference/configuration)
- graphify issues: [#578](https://github.com/Graphify-Labs/graphify/issues/578), [#686](https://github.com/Graphify-Labs/graphify/issues/686), [#1626](https://github.com/Graphify-Labs/graphify/issues/1626), [#1809](https://github.com/Graphify-Labs/graphify/issues/1809), [#1810](https://github.com/Graphify-Labs/graphify/issues/1810), [#2008](https://github.com/Graphify-Labs/graphify/issues/2008), [#2571](https://github.com/Graphify-Labs/graphify/issues/2571), [#2654](https://github.com/Graphify-Labs/graphify/issues/2654), [#3889](https://github.com/Graphify-Labs/graphify/issues/3889), [#4683](https://github.com/Graphify-Labs/graphify/issues/4683), [#4740](https://github.com/Graphify-Labs/graphify/issues/4740), and [PR #2064](https://github.com/Graphify-Labs/graphify/pull/2064)
- [Roborhythms graphify review](https://www.roborhythms.com/graphify-review/)
- [Wavect graphify review](https://wavect.io/blog/graphify-review-codebase-knowledge-graph/)
- [CodeGraph repository](https://github.com/colbymchenry/codegraph), issues [#155](https://github.com/colbymchenry/codegraph/issues/155) and [#1236](https://github.com/colbymchenry/codegraph/issues/1236)
- [codebase-memory-mcp repository](https://github.com/DeusData/codebase-memory-mcp), issue [#573](https://github.com/DeusData/codebase-memory-mcp/issues/573)
- [codebase-memory-mcp preprint, arXiv 2603.27277](https://arxiv.org/abs/2603.27277)
- [Serena repository](https://github.com/oraios/serena), issue [#805](https://github.com/oraios/serena/issues/805)
- [claude-context repository](https://github.com/zilliztech/claude-context), issue [#271](https://github.com/zilliztech/claude-context/issues/271)
- [GitNexus repository](https://github.com/abhigyanpatwari/GitNexus), [PR #3374](https://github.com/abhigyanpatwari/GitNexus/pull/3374), and [npm package](https://www.npmjs.com/package/gitnexus)
- [code-graph-rag repository](https://github.com/vitali87/code-graph-rag)
- [Cursor: secure codebase indexing](https://cursor.com/blog/secure-codebase-indexing)
- [Local premise management and memory tools](2026-10-24-memory-tools-assessment.md), for the choice of local tools with no paid service
