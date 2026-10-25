# Tools for the agent brain: assessment

Date: 2026-10-25.

Summary: The tool with the most value is a review regression set in promptfoo, because every later change to a premise, a prompt, a model, or a framework needs a number to beat. Cost per review comes free from `claude -p --output-format json` and ccusage. Parallel lenses need no framework: Claude Code and Codex run subagents in parallel, and only OpenCode needs a small Node fan-out. A second model as the verifier, and deterministic checks before the LLM (reviewdog, squawk), raise precision at low cost. Rule engines such as ast-grep wait until a premise states a code rule. Most orchestration frameworks, durable engines, hosted reviewers, and Python tools are rejected. Nothing is approved or implemented.

Status: proposal for evaluation. The user asked which other tools could add value to the brain after the crewAI assessment, and for a rating of each one.

Location: `communications/` holds standalone communications. This document is not a flow, skill, agent, premise, hook, or MCP resource. It follows [the crewAI assessment](2026-10-24-crewai-assessment.md).

Contents:

- [Recommendation](#recommendation)
- [Ranked options](#ranked-options)
- [Measure first: regression set and cost](#measure-first-regression-set-and-cost)
- [Parallel lenses without a framework](#parallel-lenses-without-a-framework)
- [A second model as the verifier](#a-second-model-as-the-verifier)
- [Deterministic checks before the LLM](#deterministic-checks-before-the-llm)
- [Ideas to borrow without a new tool](#ideas-to-borrow-without-a-new-tool)
- [Later options](#later-options)
- [Rejected options](#rejected-options)
- [Effect on the crewAI assessment](#effect-on-the-crewai-assessment)
- [Observed state](#observed-state)
- [Unknowns](#unknowns)
- [Applied premise snapshot](#applied-premise-snapshot)
- [Sources](#sources)

| Label | Meaning |
| --- | --- |
| Observed | Read from this checkout, a local command, or a local repo on this date. |
| Documented | Stated by an official source on this date. |
| Reported | Community posts, issues, papers summarized by a third party, or vendor benchmarks. Not reproduced here. |
| Proposed | A suggested change or experiment. Not implemented. |
| Unknown | Needs a measurement or a user decision. |

## Recommendation

Do these in order. Each step uses the tool subscriptions, runs locally, and adds no runtime dependency to `package.json`.

1. Build a review regression set in promptfoo. Seed it with 10 cases from `memory/sessions/` and with the Go, TypeScript, and Python PRs of the Martian Code Review Bench.
2. Record the cost of each review from `claude -p --output-format json`, and read weekly totals with ccusage.
3. Define the four lenses as Codex custom agents, so Codex runs them in parallel. Write a Node fan-out only for OpenCode.
4. Run the verification step on a second model family: `codex exec --output-schema` checks the findings of Claude. Calibrate it against 30 to 50 findings that the user labels.
5. In work repos, feed the reviewer the team linter findings on changed lines through `reviewdog -reporter=local`, and run squawk on SQL migrations.

Postpone ast-grep, GEPA, ACP, LangGraph.js, and scheduled runs until a measured need appears. The sections below give the reason for each.

## Ranked options

| Rank | Option | Area | Value | Cost | Fit | First step |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | promptfoo 0.125.0, MIT, Node | Evaluation | Shows whether a change makes reviews better or worse, with cost per case | `npx`, telemetry on by default | High | 10 cases from `memory/sessions/`, one `reviewer.mjs` provider over `claude -p` |
| 2 | Martian Code Review Bench, MIT | Evaluation data | 50 PRs in five languages with 173 labeled comments and judge prompts | Clone once | High | Run the brain on its Go and TypeScript PRs inside promptfoo |
| 3 | `claude -p` JSON cost and ccusage 20.0.44, MIT | Cost | Cost per review and per week with no setup. Both are estimates on a subscription | None | High | Write `total_cost_usd` into each session note |
| 4 | Codex custom agents in `.codex/agents/*.toml` | Orchestration | Parallel lenses in Codex with no code | Four TOML files | High | Define the four lenses and run one review |
| 5 | Node fan-out over `opencode run --format json` | Orchestration | Parallel lenses in OpenCode, the only host that runs them one after another | About 100 lines in the CLI | Medium | Measure first that OpenCode 2.1.4 still runs Task calls in sequence |
| 6 | Cross-model verifier with `codex exec --output-schema` | Review quality | Removes the self-preference of a Claude judge on Claude findings | One more call per finding | Medium | Label 30 to 50 findings, then measure true positive and true negative rates |
| 7 | reviewdog 0.21.2, MIT | Deterministic checks | Team linter findings on changed lines only, as reviewer input | One binary | Medium | Pipe the Go linter of one work repo through `-reporter=local -filter-mode=added` |
| 8 | squawk 2.70.0, Apache-2.0 | Deterministic checks | About 80 rules for Postgres migrations | One binary | Medium | Run it on the migrations of one recent diff |
| 9 | ast-grep 0.51.0, MIT | Deterministic checks | One binary for Go, Python, TypeScript, and Bash rules | One binary | Low now | Wait for a code-level premise |
| 10 | GEPA `optimize_anything` 0.1.4, MIT, Python | Prompt improvement | Improves a premise or the reviewer prompt from labeled findings | `uvx`, 20 or more full reviews per run | Low now | Wait for 30 or more labeled findings |

## Measure first: regression set and cost

The brain has no way today to tell whether a premise edit, a skill change, or a new model improves a review. `brain premise stats` shows which premises fire, not whether the findings are right.

promptfoo fits the brain best (Documented):

- It runs on Node, and it is MIT-licensed. OpenAI announced its purchase on 2026-03-09. The README says the license stays MIT.
- An ESM `file://reviewer.mjs` provider can start `claude -p --output-format json --json-schema <findings schema>`, `codex exec --output-schema <file>`, or `opencode run --format json`, and return `output`, `tokenUsage`, and `cost`.
- A `javascript` assertion checks that a finding cites the expected premise id and `file:line`. A `cost` assertion caps the spend per case. `llm-rubric` can use a local OpenAI-compatible server as the grader.
- Two reviewer prompts or two premise texts run side by side on the same cases.
- Set `PROMPTFOO_DISABLE_TELEMETRY=1`. promptfoo sends usage telemetry by default.

Use the provider routes that call your own CLI. promptfoo also has an `anthropic:claude-agent-sdk` provider that can reuse a Claude Code login. Anthropic forbids third-party products from offering claude.ai login, so that route has an open terms question (Unknown).

Seed the cases from two sources. The session notes in `memory/sessions/` give real diffs with known findings. The Martian Code Review Bench gives 50 PRs with 173 labeled comments and its judge prompts (Documented). Its precision divides matched comments by all comments, and its recall divides found labeled comments by all labeled comments.

For cost, `claude -p --output-format json` returns `total_cost_usd` and a split per model (Documented). On a subscription, this figure is an API-equivalent estimate, not a bill. ccusage reads the local logs of Claude Code, Codex, and OpenCode, and prints session, daily, and weekly totals (Documented). Claude Code OpenTelemetry with `OTEL_LOGS_EXPORTER=console` and `OTEL_LOG_TOOL_DETAILS=1` splits cost by subagent and skill, when that detail is needed (Documented).

## Parallel lenses without a framework

| Host | Lenses today | Change |
| --- | --- | --- |
| Claude Code | Parallel subagents | None |
| Codex | One after another (Observed, `flows/review-branch.md` step 3) | Codex runs custom agents from `.codex/agents/*.toml` in parallel by default, with `agents.max_concurrent_threads_per_session` as the limit (Documented). Unknown: whether this works inside `codex exec` |
| OpenCode | One after another | An issue reports that several Task calls run in sequence. It was closed as not planned on 2026-07-29, on version 1.15.11 (Reported). The local version is 2.1.4 (Observed). Measure before you build |

When OpenCode still runs the lenses in sequence, a Node fan-out in the brain CLI starts one `opencode run --format json` per lens and merges the results. OpenCode 2.1.4 connects to a background service by default, so each run skips the server start (Observed, `opencode run --help`). The SDK v2 client accepts `format: {type: "json_schema", schema}` for typed findings (Documented).

Billing: `claude -p` and the Agent SDK draw from subscription limits, per the Anthropic help article updated on 2026-10-07 (Documented). `--bare` never reads the subscription login, and the docs say bare mode will become the default for `-p` in a future release (Documented). Check that note on each Claude Code update before you script `claude -p`. OpenCode does not support Claude Pro or Max logins, because Anthropic prohibits it (Documented).

The Agent Client Protocol drives all three hosts through one protocol: OpenCode with `opencode acp` (Observed), and Claude Code and Codex through adapters (Documented). It is a later option for the case where three output formats cost more to parse than one adapter costs to run.

## A second model as the verifier

`review-branch` step 5 runs the adversarial check with Opus on findings from Opus and Sonnet. Research on LLM judges shows that a judge recognizes its own outputs and favors them (Documented, arXiv 2404.13076). Anthropic's eval guidance grades with a different model from the one that wrote the output (Documented).

Proposed change: ask `codex exec --output-schema` one binary question per finding: is this a real defect at this `file:line`, with a short critique. Label 30 to 50 findings by hand first. Report the true positive rate, the true negative rate, and Cohen's kappa against those labels, and measure again after each model change (Reported practice, hamel.dev and eugeneyan.com). No source confirms that a small Ollama model judges code findings well, so keep the local model out of this step.

## Deterministic checks before the LLM

A rule engine finds a pattern with no false judgment and no tokens. The LLM then judges only what a rule cannot check.

The active premises fit this idea poorly today (Observed, `brain premise list`):

- `no-hard-wrapped-markdown` is already enforced in this repo by oxfmt with `proseWrap: "never"`. The setting skips `memory/**` and `templates/**`.
- `proto-is-api-source` already has `buf lint` and `buf breaking` in the `proto-change` flow. buf 1.71.0 is installed.
- `no-co-author-no-footer` is a text check on commit messages and PR bodies. A case-insensitive regex in the brain does it with no new tool.
- `shell-rm-cp-no-prompt` is about commands that an agent runs in the user's shell, not about code in a diff. A `PreToolUse` hook fits it, as H13 of the hooks assessment proposes.
- The other 11 active premises need judgment or describe a process.

Two tools add value in the work repos now:

- reviewdog with `-reporter=local -filter-mode=added -diff="git diff origin/main"` prints the findings of the team linters on changed lines only (Documented). The reviewer reads that output as input and posts nothing. It reads its rules from the team config, so the team repo does not change.
- squawk checks Postgres migrations with about 80 built-in rules (Documented). Three Go services use `golang-migrate` style up and down SQL files with a Postgres driver in `go.mod` (Observed: `qdrant-cloud-platform-api`, `qdrant-cloud-production-governance`, and `serverless-backend`). The `db-migration` flow covers only alembic today (Observed), so these SQL migrations have no flow.

ast-grep is the best carrier for a future optional `check` field on a premise. It is one MIT binary with YAML rules for Go, Python, TypeScript, and Bash, a test command, and an experimental MCP server (Documented). Add it when a premise states a code rule. Then require one valid and one invalid snippet from the premise evidence, a passing `ast-grep test`, and zero hits on `origin/main`. Papers that compile natural-language rules into linter rules report about 70% accuracy for detailed configs, so test cases are the judge (Reported, LintCFG arXiv 2602.07783).

## Ideas to borrow without a new tool

| Idea | From | Use in the brain | Value |
| --- | --- | --- | --- |
| Read review rules from the base branch, never from the reviewed change | Claude Code Review (Documented) | When `brain-reviewer` reads a rule file of the reviewed repo, such as `AGENTS.md` or a repo skill, read it at the base commit. A PR cannot then change the rules it is reviewed against | High |
| A later commit that changes the flagged lines marks the finding as accepted | Martian Code Review Bench online mode (Documented) | An automatic acceptance signal for the regression set and for `brain premise stats` | Medium |
| Bad and Good code examples in each rule | Kodus rules (Documented) | An optional section in `templates/premise.md`. It helps the reviewer apply the rule and gives test snippets for a future check | Medium |
| A fingerprint per finding | PR-Agent (Documented) | A second review of the same branch does not raise a finding the user already answered | Low |
| Explicit rules rank above learned rules | CodeRabbit (Documented) | The brain already does this: a candidate is not an applicable rule | None |

## Later options

| Option | When it pays | Note |
| --- | --- | --- |
| GEPA `optimize_anything` with `claude -p` as the reflection model | After 30 or more labeled findings | Python through `uvx`, outside the brain. Each evaluation is a full review, so subscription rate limits cap a run. Its gskill post reports a skill pass rate from 79.3% to 98.3%, with charts that disagree on some figures |
| Desktop local scheduled tasks | Unattended Claude review on the subscription | Runs on this machine with local MCP config. Runs only while the app is open and the machine is awake |
| claude-code-action with `CLAUDE_CODE_OAUTH_TOKEN` | Review on each PR in personal repos | It does not read `~/.claude`. The workflow must check out the brain |
| Agent Client Protocol, `@agentclientprotocol/sdk` | Parsing three CLI formats becomes the main cost | Adapters change often, and the v2 draft is from 2026-07-20 |
| LangGraph.js with the SQLite checkpointer | An unattended review must wait days for the user | MIT, four dependencies. A JSON run file in the brain covers shorter waits |
| Arize Phoenix | One review needs a view of its subagent tree | One container, ELv2 license, local and free |
| Kodus | Reference for the rule format only | AGPL-3.0. Its rule files are the closest match to premises |

## Rejected options

| Option | Reason |
| --- | --- |
| Mastra | 83 MB and 30 dependencies for one fan-out |
| OpenAI Agents SDK JS, Vercel AI SDK, VoltAgent, Google ADK for TypeScript | API billing, and no gain over CLI calls |
| Inngest AgentKit | Last publish 2026-02-06. The server uses the SSPL license |
| Temporal, Restate, DBOS, Trigger.dev | A server, Postgres, or containers for state that a JSON file holds |
| Python frameworks: LangGraph, Pydantic AI, OpenAI Agents SDK, Microsoft Agent Framework, Google ADK, crewAI | A second runtime and API keys |
| CodeQL | The license does not permit private repos |
| Semgrep CE, Opengrep | Same role as ast-grep with heavier rules and single-function analysis in the free engine |
| Comby, GritQL | No release in four years, or no Go and Python support |
| commitlint | Case-sensitive trailer match, and no PR bodies. A regex does more |
| pre-commit, lefthook, Danger in CI | Need a file in the team repo, which AGENTS.md forbids |
| CodeRabbit, Greptile, Sourcery, Ellipsis, Braintrust | Paid or hosted. The user prefers local and free tools |
| Codex GitHub review, OpenCode GitHub agent | Cannot read the premises, or need API keys |
| Langfuse | Four services: PostgreSQL, ClickHouse, Redis, and S3 |
| Helicone | A gateway that sees only API traffic |
| DeepEval, Inspect AI, OpenAI Evals, Mastra evals, evalite | Python, no releases, a framework dependency, or a beta that stalled. promptfoo covers the need |
| DSPy, Ax, TextGrad, Anthropic prompt improver | GEPA covers the need, or the tool is stale or takes free text only |

## Effect on the crewAI assessment

Two findings change the crewAI use cases:

- C2, one lens engine for all three tools, loses most of its value. Codex runs custom agents in parallel. Only OpenCode needs a fan-out, and a Node script covers it.
- C1, unattended review, has a subscription route: Desktop local scheduled tasks with a JSON run file in the brain. crewAI stays an option only if that route fails.

## Observed state

- Installed: Claude Code 2.1.310, Codex CLI 0.164.0, OpenCode 2.1.4, gh 2.102.0, buf 1.71.0, and ShellCheck.
- Missing: promptfoo, ccusage, reviewdog, squawk, ast-grep, Semgrep, golangci-lint, ruff, markdownlint, lefthook, and pre-commit. `npx` covers promptfoo and ccusage with no install.
- `claude --help` lists `--json-schema`, `--bare`, `--max-budget-usd`, `--permission-prompts`, and `--agents`. `codex exec --help` lists `--output-schema`, `--json`, `--ephemeral`, and `resume`. `opencode --help` lists `serve`, `acp`, and `service`.
- The brain has 15 active premises and 3 candidates.

## Unknowns

- Whether Codex custom agents run in parallel inside `codex exec`.
- Whether OpenCode 2.1.4 still runs several Task calls in sequence.
- Whether the promptfoo Agent SDK provider with a Claude login fits Anthropic's terms for personal use.
- When `--bare` becomes the default for `claude -p`, and whether a flag will turn it off.
- The subscription rate limits under an eval run of 20 or more full reviews.
- Whether ccusage splits cost by subagent.

## Applied premise snapshot

- `docs-summary-first` (always): "Write each documentation file summary first: the title, a short summary of the main point and of what the reader must know or do, a table of contents when the file has four or more ## sections, and then the sections from most to least important, with background and detail last."
- `no-hard-wrapped-markdown` (never): "Hard-wrap Markdown prose. Write one line per paragraph."
- `stay-in-request-scope` (always): "Keep a change inside the request. Mention unrelated dead code and leave it in place." The missing flow for Go SQL migrations is reported, not added.
- `memory-only-what-repeats` (always): "Store a rule only when it is important." This assessment adds no premise.
- `no-commit-push-unasked` (never): "Commit or push without an explicit request in that turn." Nothing is committed.

## Sources

- [promptfoo custom provider](https://www.promptfoo.dev/docs/providers/custom-api/)
- [promptfoo Claude Agent SDK provider](https://www.promptfoo.dev/docs/providers/claude-agent-sdk/)
- [promptfoo telemetry](https://www.promptfoo.dev/docs/configuration/telemetry/)
- [Martian Code Review Bench](https://github.com/withmartian/code-review-benchmark)
- [Claude Code headless mode](https://code.claude.com/docs/en/headless)
- [Claude Code monitoring](https://code.claude.com/docs/en/monitoring-usage)
- [Claude Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [Anthropic help: subscription use of Claude Code](https://support.claude.com/articles/15036540)
- [ccusage](https://ccusage.com/guide/)
- [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- [OpenCode CLI](https://opencode.ai/docs/cli/)
- [OpenCode SDK](https://opencode.ai/docs/sdk/)
- [OpenCode providers](https://opencode.ai/docs/providers/)
- [OpenCode issue 29638](https://github.com/anomalyco/opencode/issues/29638)
- [Agent Client Protocol](https://agentclientprotocol.com/)
- [Desktop scheduled tasks](https://code.claude.com/docs/en/desktop-scheduled-tasks)
- [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions)
- [Claude Code Review](https://code.claude.com/docs/en/code-review)
- [Self-preference of LLM judges, arXiv 2404.13076](https://arxiv.org/abs/2404.13076)
- [Anthropic: develop tests](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)
- [Hamel Husain: LLM judges](https://hamel.dev/blog/posts/llm-judge/)
- [Eugene Yan: LLM evaluators](https://eugeneyan.com/writing/llm-evaluators/)
- [reviewdog](https://github.com/reviewdog/reviewdog)
- [squawk rules](https://squawkhq.com/docs/rules)
- [ast-grep lint rules](https://ast-grep.github.io/guide/project/lint-rule.html)
- [ast-grep MCP](https://github.com/ast-grep/ast-grep-mcp)
- [LintCFG, arXiv 2602.07783](https://arxiv.org/abs/2602.07783)
- [Kodus rules](https://docs.kodus.io/how_to_use/en/code_review/configs/repository_rules)
- [PR-Agent](https://github.com/The-PR-Agent/pr-agent)
- [CodeRabbit learnings](https://docs.coderabbit.ai/knowledge-base/learnings)
- [GEPA](https://github.com/gepa-ai/gepa)
- [GEPA with the Claude CLI as proposer](https://github.com/gepa-ai/gepa/blob/main/docs/docs/guides/claude-cli-as-proposer.md)
- [CodeQL CLI license](https://github.com/github/codeql-cli-binaries/blob/main/LICENSE.md)
- [Mastra workflows](https://mastra.ai/docs/workflows/overview)
- [LangGraph.js interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
