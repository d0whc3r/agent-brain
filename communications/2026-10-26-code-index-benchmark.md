# Code index tools for coding agents: benchmark

Date: 2026-10-26.

Summary: With Opus on our repos, no code index tool made the agent more accurate or clearly cheaper. In 116 headless sessions, every configuration answered all eight questions correctly. Opus made at most nine index calls for eight questions, even when the prompt made the tool the main way to navigate. CodeGraph was the most expensive configuration in both rounds, and it misses Go calls through an interface. The native language servers, gopls and the TypeScript 7 compiler, gave exact answers in milliseconds and keep no index. The proposal is grep plus one custom LSP plugin, and the removal of CodeGraph.

Status: proposal for evaluation. The user asked which code tool is the most efficient, with freedom to replace every tool in use, and asked to measure every candidate before a decision. Nothing is installed or changed outside the session scratchpad.

Location: `communications/` holds standalone communications. This document is not a flow, skill, agent, premise, hook, or MCP resource. It follows [the code index assessment](2026-10-25-code-index-assessment.md), and it answers the open questions of that assessment with measurements.

Contents:

- [Recommendation](#recommendation)
- [Agent benchmark](#agent-benchmark)
- [Tool benchmark](#tool-benchmark)
- [Language servers](#language-servers)
- [Method](#method)
- [Limits](#limits)
- [Findings outside the request](#findings-outside-the-request)
- [Cleanup](#cleanup)
- [Applied premise snapshot](#applied-premise-snapshot)
- [Sources](#sources)

| Label      | Meaning                                                                         |
| ---------- | ------------------------------------------------------------------------------- |
| Observed   | Read from this checkout, a local command, or a local repo on this date.         |
| Measured   | Timed or counted on this machine on this date: Apple M4 Pro, 24 GB.             |
| Documented | Stated by the official README, docs, changelog, license, or source of the tool. |
| Reported   | GitHub issues, pull requests, blog posts, or reviews. Not reproduced here.      |
| Proposed   | A suggested change or experiment. Not implemented.                              |
| Unknown    | Needs a measurement or a user decision.                                         |

## Recommendation

Do these steps in order. Each step is Proposed, and each step needs a decision of the user.

1. Remove CodeGraph: the `codegraph` MCP server, the `codegraph prompt-hook` hook, the CodeGraph block of the global CLAUDE.md, and the `.codegraph/` folders. It was the most expensive configuration in both agent rounds, about 13% above the mean of the configurations that never called their tool. It found 2 of 9 Go calls through an interface, and it indexes no `.proto` file (Measured).
2. Add one LSP plugin for Claude Code with two servers: `gopls serve` for `.go`, and the TypeScript 7 native server `tsc --lsp -stdio` for `.ts` and `.tsx`. Do not use the official `typescript-lsp` plugin for `qdrant-cloud-ui`. Its server fails on TypeScript 7 (Measured, see [Language servers](#language-servers)).
3. Add `buf lsp serve` for `.proto` to the same plugin after `buf registry login`. Today the buf.build token of this machine is invalid, so the server answers nothing (Observed).
4. In OpenCode, set `"lsp": true` (Documented). Whether its TypeScript server works with TypeScript 7 is Unknown.
5. Do not install graphify, Codanna, or code-review-graph. None of them was correct on Go calls through an interface, none of them reads `.proto` files, and Opus did not use them unless the prompt forced it (Measured).
6. Keep codebase-memory-mcp only when Codex or `.proto` questions need it, and upgrade it from 0.8.1 to 0.12.1 first. It is the only index that resolved every Go interface call and parsed the `.proto` files. Opus did not call it unless forced, and it was not measured in Codex.
7. The LSP plugin is the one piece of code tool configuration worth keeping in the brain. Every repo uses it, the official TypeScript plugin fails on TypeScript 7, and the installer already registers MCP servers and hooks. This changes the brain installer, so it waits for the user.

## Agent benchmark

Each cell is one isolated `claude -p` session with Opus, run once for each of the eight questions. "Suggested" adds the line "Use the X tools for code navigation when they help." "Forced" adds "Use X as your first and main way to navigate code. Use Grep or Read only to confirm a detail those tools do not give." The [Method](#method) section has every flag (Measured).

| Configuration | Correct | Cost of 8 questions | Input tokens | Output tokens | Tool calls | Index calls | Time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Grep and Read only | 8/8 | 1.77 USD | 1,090,172 | 21,494 | 52 | none | 206 s |
| LSP, suggested | 8/8 | 1.65 USD | 961,938 | 20,015 | 47 | 0 | 178 s |
| LSP, forced | 8/8 | 1.51 USD | 871,900 | 19,238 | 43 | 6 | 183 s |
| CodeGraph, suggested | 8/8 | 2.00 USD | 1,333,997 | 22,860 | 59 | 5 | 222 s |
| CodeGraph, forced | 8/8 | 1.96 USD | 1,371,133 | 23,110 | 57 | 7 | 218 s |
| codebase-memory-mcp 0.12.1, suggested | 8/8 | 1.75 USD | 1,114,668 | 21,490 | 51 | 0 | 199 s |
| codebase-memory-mcp 0.12.1, forced | 8/8 | 1.83 USD | 1,429,419 | 23,337 | 63 | 4 | 220 s |
| graphify, suggested | 8/8 | 1.40 USD | 883,226 | 20,392 | 42 | 0 | 188 s |
| graphify, forced | 8/8 | 1.73 USD | 1,132,073 | 21,006 | 57 | 7 | 203 s |
| Codanna, suggested | 8/8 | 1.72 USD | 1,147,268 | 22,142 | 49 | 0 | 200 s |
| Codanna, forced | 8/8 | 1.58 USD | 1,114,636 | 18,296 | 54 | 9 | 178 s |
| code-review-graph, suggested | 8/8 | 1.79 USD | 1,212,340 | 20,757 | 51 | 0 | 191 s |
| code-review-graph, forced | 8/8 | 1.72 USD | 1,181,177 | 20,858 | 56 | 5 | 207 s |

How to read the table:

- Accuracy did not separate the tools. Opus answered every question with Grep and Read, including the nine Go calls through an interface.
- Opus rarely calls an index tool. With the suggestion, five of six tools got no call at all. With the forced prompt, each tool got four to nine calls for eight questions.
- Run-to-run noise is about 10%. Six configurations never called their tool, so they ran as plain Grep and Read, and they cost from 1.40 to 1.79 USD. The 1.40 USD of graphify with the suggestion is noise for that reason.
- CodeGraph cost the most in both rounds, at 2.00 and 1.96 USD. Its `explore` answer is 20 to 25 KB, and the larger context costs more input tokens on each later turn.
- LSP, forced, was the cheapest configuration that used its tool, at 1.51 USD. The gap to Grep and Read is inside the noise.
- The 116 sessions cost about 25 USD in total.

## Tool benchmark

Each tool answered the same eight questions with its best single command, run directly with no agent. An ambiguous name got one more call with the qualified name. The answer was graded against the ground truth from `git grep` and a read of the code (Measured).

The questions:

| ID | Repo | Question | Ground truth |
| --- | --- | --- | --- |
| G1 | `qdrant-cloud-cluster-service` | Which functions call `clusterProvider.ListClusters`? | 2 call sites: `internal_agent_list_clusters.go:105` and `internal_list_clusters.go:57` |
| G2 | `qdrant-cloud-cluster-service` | What does `backupService.CreateBackup` check before it creates a backup? | 6 checks: `backupRetention`, `backupDisplayName`, `GetCluster`, `GetClusterPackageType`, `hybridEnvClusterBackupCapability`, `HasValidPaymentInformation` |
| G3 | `qdrant-cloud-cluster-service` | What code breaks if I change the signature of `clusterProvider.GetCluster`? | 9 call sites in 7 files, all through the `ClusterProvider` interface |
| T1 | `qdrant-cloud-ui` | Which files use the hook `useIsClusterFreeTier`? | 15 files |
| T2 | `qdrant-cloud-ui` | How does `useRpcPermissions` decide whether the user may call an RPC? | `useEffectivePermissions` and `checkRpcPermissions` in `api/permissions.ts` |
| T3 | `qdrant-cloud-ui` | Where does the Connect permissions interceptor check RPC permissions? | `api/interceptors/connect/permissions.ts:24`, through `assertRpcPermissions` and `checkRpcPermissions` |
| P1 | `qdrant-cloud-public-api` | Which RPCs does `BackupService` define? | 12 RPCs in `backup.proto` |
| P2 | `qdrant-cloud-public-api` | What permission does the `RestoreBackup` RPC require? | `restore:backups` |

Correct items:

| Question | LSP | CodeGraph 1.6.2 | codebase-memory-mcp 0.12.1 | graphify 0.9.95 | Codanna 0.17.1 | code-review-graph 2.3.9 |
| --- | --- | --- | --- | --- | --- | --- |
| G1 (2) | 2/2, gopls | 1/2 with `explore`, 0/2 with `callers` | 2/2 | 0/2 | 0/2 | 0/2, 58 rows, all tests |
| G2 (6) | 6/6, gopls call hierarchy | 6/6, with source | 6/6, names only | 2/6 | 3/6 | 6/6 |
| G3 (9) | 9/9, gopls | 2/9 with `explore`, 0/9 with `impact` | 9/9 | 0/9 | 0/9 | 5 of 7 files, among 78 rows |
| T1 (15) | 15/15, TS 7 | 15/15 with `callers` | 14/15 | 15/15, unlabeled and truncated | 15/15 | 15/15 |
| T2 (3) | 3/3, TS 7 | 3/3 | 3/3 | 3/3, names only | 3/3 | 2/3 |
| T3 (3) | 3/3, after a symbol search | 3/3 | 3/3 | 3/3, names only | 2/3 | 2/3 |
| P1 (12) | no answer, buf token | 11/12, from generated code | 12/12, from `.proto` | 12/12, from generated code | 0/12 | 12/12, from generated code |
| P2 (1) | no answer, buf token | 1/1, from generated comments | 1/1, with one more read | 0/1 | 0/1 | 0/1 |

Index, update, and cost of each answer:

| Tool | Index of Go repo, 322 files | Index of proto repo, 399 files | Index of UI, 2,246 files | Update after one `.tsx` edit | Peak memory, UI | Disk, UI | Answer size | Query time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LSP | none | none | none | live | 188 MB, TS 7 | none | about 1 KB | 2 to 53 ms warm |
| CodeGraph 1.6.2 | 1.6 s | 2.4 s | 4.2 s | 2.0 s | 1,383 MB | 108 MB | 20 to 25 KB, `explore` | 0.2 to 0.6 s |
| codebase-memory-mcp 0.12.1 | 1.6 s | 1.7 s | 3.7 s | 2.5 s | 196 MB | 94 MB in `~/.cache` | 1 to 4.5 KB | 0.8 to 2 s |
| graphify 0.9.95 | 5.7 s | 7.6 s | 12.2 s | 15.0 s | 322 MB | 18 MB | 6.7 KB, truncated at 2,000 tokens | 0.3 to 0.6 s |
| Codanna 0.17.1 | 5.6 s | 2.4 s | 3.1 s | 1.0 s | 947 MB | 11 MB | 0.3 to 11 KB | 0.01 to 0.35 s |
| code-review-graph 2.3.9 | 4.2 s | 2.7 s | 9.0 s | 1.5 s | 236 MB | 321 MB | 6 to 30 KB, 120 KB for G3 | 0.2 to 0.4 s |

Notes on each tool:

- CodeGraph does not link a Go call through an interface-typed struct field, such as `s.clusterProvider.GetCluster(...)`, to the interface method. It indexes 0 of 32 `.proto` files ([#1563](https://github.com/colbymchenry/codegraph/issues/1563), open). Its one-call `explore` with verbatim source is its strength for flow questions such as G2.
- codebase-memory-mcp 0.12.1 resolved every Go interface call, including calls through `tx.Clusters`. It parsed all 32 `.proto` files as gRPC routes, with 8 partial parses and 1 failed file, `common.proto`. Its answers have no source, and an ambiguous name needs a second call. It keeps the index in `~/.cache/codebase-memory-mcp`, keyed by the absolute path.
- graphify returns a node list with no source, cut at a 2,000-token budget. Its update after one edit parsed all 2,025 TypeScript files again, which confirms [#4740](https://github.com/Graphify-Labs/graphify/issues/4740). Its MCP server needs the `graphifyy[mcp]` extra.
- Codanna 0.17.1 has no node for a Go interface method, so it finds no caller through an interface. It downloads an embedding model to `~/.codanna/models` on the first index. Its MCP server locks the index, so parallel sessions on one repo fail to connect. crates.io has 0.16.0 only, so the test built 0.17.1 from the git tag.
- code-review-graph matches calls by name. For `GetCluster` it returned 78 rows, mostly tests, and it missed 2 of the 7 files. Its index of the UI is 321 MB.

## Language servers

The scratch script `lsp.mjs` drove each server over stdio, as Claude Code does, and timed each request twice, cold and warm (Measured).

| Server | Startup | First request | Warm request | Result |
| --- | --- | --- | --- | --- |
| gopls v0.22.0 | 152 ms | 1.6 s, workspace load | 2 to 53 ms | G1 2/2, G2 6/6, G3 9/9 |
| TypeScript 7.0.2, `tsc --lsp -stdio` | 15 ms | 163 ms | 0 to 14 ms | T1 15/15, T2 3/3, T3 found through `workspace/symbol` and references |
| typescript-language-server 6.0.2 | failed | none | none | "The TypeScript of the workspace (TypeScript 7.0.2 ...) provides no tsserver.js. No other valid TypeScript installation was found. Exiting." |
| buf 1.71.0, `buf lsp serve` | 24 ms | empty | empty | `buf build` fails: "your Buf API token for buf.build is invalid" |

What this means:

- `qdrant-cloud-ui` depends on `typescript` `^7.0.2`, the native compiler, which ships no `tsserver.js`. The official Claude Code plugin `typescript-lsp` runs `typescript-language-server`, which needs that file. A custom `.lsp.json` entry that runs `tsc --lsp -stdio` works.
- The test ran the native binary `@typescript/typescript-darwin-arm64/lib/tsc`. Whether `node_modules/.bin/tsc --lsp -stdio` behaves the same is Unknown.
- An LSP plugin declares its servers in `.lsp.json` with `command`, `args`, and `extensionToLanguage`. Claude Code resolves `${CLAUDE_PROJECT_DIR}` in `command` and `args` (Documented, [plugin reference](https://code.claude.com/docs/en/plugins-reference)). That can point the TypeScript server at the compiler of each repo. This is Proposed and not tested.
- Claude Code turns on its `LSP` tool only through a code intelligence plugin. OpenCode needs `"lsp": true`, and its agent `lsp` tool is experimental. Codex has no native LSP ([#8745](https://github.com/openai/codex/issues/8745), open). These host facts are Documented and come from the research pass, with the links in [Sources](#sources).
- In the agent benchmark, the LSP plugin loaded and the `LSP` tool was present in every LSP session. With the suggestion, Opus used it in no session. With the forced prompt, it used it six times, all on G2.

## Method

Repos, cloned with `git clone --local` into the session scratchpad, so no work repo changed:

| Repo | Commit | Tracked files | Main languages |
| --- | --- | --- | --- |
| `qdrant-cloud-cluster-service` | `f93b205`, 2026-10-21 | 322 | Go |
| `qdrant-cloud-public-api` | `e5223e8f`, 2026-10-22 | 399 | protobuf (32 files), generated Go, TypeScript, and Python |
| `qdrant-cloud-ui` | `4efc66b84`, 2026-10-22 | 2,246 | TypeScript 7, React |

Tool versions: CodeGraph 1.6.2, codebase-memory-mcp 0.12.1 (release binary), graphify 0.9.95 (`graphifyy`, with `--code-only` and `GRAPHIFY_BACKEND=none`, so no LLM call), Codanna 0.17.1 (built from the git tag `v0.17.1`), code-review-graph 2.3.9, gopls v0.22.0, TypeScript 7.0.2, typescript-language-server 6.0.2, buf 1.71.0, and Claude Code 2.1.310.

Tool benchmark: each tool indexed each repo once, timed with `/usr/bin/time -l`. Each question ran with the command that fits it best: `explore`, `callers`, or `impact` for CodeGraph, `trace_path`, `search_graph`, or `search_code` for codebase-memory-mcp, `query` or `affected` for graphify, `find_callers`, `get_calls`, `analyze_impact`, or `search_symbols` for Codanna, and `query` or `search` for code-review-graph. The update test appended one exported function to `TierBadge.tsx`, ran the update command, and checked that the new symbol was found. A grade that matched only a file name was checked by hand against the real call lines, because a definition file can match a callers question.

Agent benchmark: each session ran in the repo of its question with these flags:

```bash
claude -p "<question> Answer from the code in this repository. List every relevant symbol with its file path and line number. Do not edit files." \
  --model opus --setting-sources project,local --strict-mcp-config --mcp-config <one tool> \
  --allowedTools Read Grep Glob <read-only Bash commands> <the tool> \
  --disallowedTools Edit Write NotebookEdit WebFetch WebSearch Agent Task \
  --max-turns 40 --no-session-persistence --output-format stream-json --verbose
```

- `--setting-sources project,local` keeps out the user CLAUDE.md, hooks, plugins, and MCP servers. A probe session confirmed that it saw no CodeGraph instruction and no MCP tool.
- The LSP configuration used `--plugin-dir` with a `.lsp.json` for gopls and `tsc --lsp -stdio`, and allowed the `LSP` tool.
- The index folders were added to `.git/info/exclude` of each clone, so Grep did not search them.
- The final answer was graded against the ground truth, with file and line pairs for G1 and G3. Cost, tokens, turns, and time come from the `result` event. Tool calls come from the `tool_use` blocks.
- Two harness faults were fixed and their sessions run again. graphify failed to start because its venv lacked the `mcp` package. Codanna failed to connect in four sessions because four sessions opened its index at once, so its sessions ran one at a time.

## Limits

- Each configuration answered each question once. Run-to-run noise is about 10%.
- The eight questions all have answers that grep can find. The repos have 322 to 2,246 files. Larger repos, questions across repos, or weaker models can change the result. One benchmark reports that Haiku got 12 of 12 structural answers with a graph and 8 of 12 with grep ([nefayran/code-graph-vs-grep](https://github.com/nefayran/code-graph-vs-grep), Reported).
- Only Opus in Claude Code was measured. Codex and OpenCode were not measured.
- `buf lsp` was not measured, because the buf.build token of this machine is invalid.
- The forced prompt still left the choice to the model, so it measures a strong hint, not a tool-only agent.
- Independent benchmarks agree that graph indexes save no clear tokens with a strong model: CodeGraph −24% output tokens on django with Codex ([repowise](https://repowise.dev/blog/comparisons/serena-vs-graphify-vs-codegraph-vs-repowise)), and CodeGraph, codebase-memory-mcp, and Serena +22% to +27% tokens on zod with GPT-5.5 ([samchon](https://dev.to/samchon/i-made-ts-compiler-graph-mcp-10x-fewer-tokens-in-claude-code-1aea)). Both are Reported.

## Findings outside the request

These items are outside the request. They are reported here and not changed.

- 11 codebase-memory-mcp 0.8.1 processes and 9 CodeGraph watcher processes from sessions since 2026-10-24 were still running on this date. Four of them have no terminal (Observed).
- `buf build` in `qdrant-cloud-public-api` fails with "your Buf API token for buf.build is invalid". `buf registry login` fixes it (Observed).
- The folder `mcp/` at the root of this repo masks a missing Python package named `mcp` for Python that runs from the repo root without `-I`. It gave a false "mcp ok" during the test (Observed).

## Cleanup

- The test wrote these items outside the scratchpad, and all of them were removed: the scratch indexes, `activity.db`, and `logs/` in `~/.cache/codebase-memory-mcp`, and the folders `~/.codanna` and `~/.code-review-graph`.
- The six CodeGraph watcher processes of the scratch clones were stopped.
- No file of the user configuration and no work repo changed. The scratch clones and scripts stay in the session scratchpad.

## Applied premise snapshot

- `docs-summary-first` (always): "Write each documentation file summary first: the title, a short summary of the main point and of what the reader must know or do, a table of contents when the file has four or more ## sections, and then the sections from most to least important, with background and detail last."
- `no-hard-wrapped-markdown` (never): "Hard-wrap Markdown prose."
- `dod-before-done` (always): "Before a task changes files in a git repo, agree its Definition of Done with the brain-dod skill, and call the task done only when brain dod lint --done prints ok." The user approved the DoD of this task before the file was written.
- `stay-in-request-scope` (always): "Keep a change inside the request, and mention unrelated dead code or stale text instead of changing it." The section [Findings outside the request](#findings-outside-the-request) lists three items and changes none.
- `abstraction-needs-two-uses` (never): "Add an interface, design pattern, extension point, config option, boolean flag, or forwarding wrapper with fewer than two real variants in the code now." The proposed LSP plugin adds no option. It holds two real servers, Go and TypeScript.
- `memory-only-what-repeats` (always): "Store a rule only when it is important: an explicit ask becomes a premise, any other correction becomes a candidate that waits for a repeat." This benchmark adds no premise.
- `no-commit-push-unasked` (never): "Run git add, git commit, or git push without an explicit request in that turn." Nothing is staged or committed.

## Sources

- [The code index assessment](2026-10-25-code-index-assessment.md), the earlier document on one index across clones and worktrees
- [CodeGraph repository](https://github.com/colbymchenry/codegraph), issue [#1563](https://github.com/colbymchenry/codegraph/issues/1563) (no protobuf parser)
- [codebase-memory-mcp repository](https://github.com/DeusData/codebase-memory-mcp), issues [#2709](https://github.com/DeusData/codebase-memory-mcp/issues/2709) (agents do not call the tool), [#2743](https://github.com/DeusData/codebase-memory-mcp/issues/2743) (stale graph after a watcher restart), [#2718](https://github.com/DeusData/codebase-memory-mcp/issues/2718) (no call edge through a TS barrel file), [#2711](https://github.com/DeusData/codebase-memory-mcp/issues/2711) and [#2533](https://github.com/DeusData/codebase-memory-mcp/issues/2533) (memory and reindex loop on macOS)
- [graphify repository](https://github.com/Graphify-Labs/graphify), issues [#4740](https://github.com/Graphify-Labs/graphify/issues/4740) (TypeScript skips the cache) and [#3570](https://github.com/Graphify-Labs/graphify/issues/3570) (incremental rebuilds drop edges)
- [Codanna repository](https://github.com/bartolli/codanna)
- [code-review-graph repository](https://github.com/tirth8205/code-review-graph)
- [Claude Code plugin reference](https://code.claude.com/docs/en/plugins-reference), for the `.lsp.json` format
- [Claude Code code intelligence plugins](https://code.claude.com/docs/en/plugins/code-intelligence.md)
- [OpenCode LSP servers](https://opencode.ai/docs/lsp) and [OpenCode tools](https://opencode.ai/docs/tools)
- [Codex LSP request #8745](https://github.com/openai/codex/issues/8745)
- [buf editor and LSP integration](https://buf.build/docs/cli/editors-lsp/)
- Benchmarks by others, all Reported: [repowise comparison](https://repowise.dev/blog/comparisons/serena-vs-graphify-vs-codegraph-vs-repowise), [samchon @ttsc/graph](https://dev.to/samchon/i-made-ts-compiler-graph-mcp-10x-fewer-tokens-in-claude-code-1aea), [nefayran/code-graph-vs-grep](https://github.com/nefayran/code-graph-vs-grep), and [Kothari Techno Trick](https://kotharitechnotrick.com/grep-vs-codegraph-vs-graphify-vs-codebase-memory-mcp-a-real-token-cost-benchmark-for-ai-coding-agents/)
