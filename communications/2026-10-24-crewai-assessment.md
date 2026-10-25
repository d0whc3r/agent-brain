# crewAI for the agent brain: assessment

Date: 2026-10-24.

Summary: crewAI Flows can run the fixed part of a review (lens fan-out, merge, and verification) as typed, persisted, and resumable code, with Claude for hard steps and Ollama for cheap steps. The cost is a Python 3.10 to 3.13 sidecar of about 690 MB, per-token API billing outside the tool subscriptions, default telemetry, and fast release churn. crewAI Memory, Knowledge, and `crewai train` would create a second rule store, which the brain forbids. The recommendation is to keep crewAI out of the brain core, to try a Node fan-out over the headless tool CLIs first, and to pilot one crewAI Flow only for unattended review or for one shared lens engine. Nothing is approved or implemented.

Status: proposal for evaluation. The user asked for a deep exploration of how crewAI Crews and Flows could apply to the brain, what they need, and which use cases they serve.

Location: `communications/` holds standalone communications. This document is not a flow, skill, agent, premise, hook, or MCP resource.

Contents:

- [Recommendation](#recommendation)
- [Use cases](#use-cases)
- [Brain flows as crewAI Flows](#brain-flows-as-crewai-flows)
- [What a pilot needs](#what-a-pilot-needs)
- [Decision boundaries](#decision-boundaries)
- [Alternatives and trade-offs](#alternatives-and-trade-offs)
- [Proposed evaluation and adoption sequence](#proposed-evaluation-and-adoption-sequence)
- [Documented crewAI capabilities](#documented-crewai-capabilities)
- [Reported community experience](#reported-community-experience)
- [Observed brain state](#observed-brain-state)
- [Unknowns](#unknowns)
- [Questions for independent assessment](#questions-for-independent-assessment)
- [Applied premise snapshot](#applied-premise-snapshot)
- [Sources](#sources)

| Label      | Meaning                                                              |
| ---------- | -------------------------------------------------------------------- |
| Observed   | Read from this checkout or from a local command on this date.        |
| Documented | Stated by official crewAI docs, PyPI, or crewAI source on this date. |
| Reported   | Community posts, issues, blogs, and benchmarks. Not reproduced here. |
| Proposed   | A suggested change or experiment. Not implemented.                   |
| Unknown    | Needs a measurement or a user decision.                              |

## Recommendation

Do not move the brain core to crewAI. Premises, flows, skills, the CLI, and `brain-premises` stay in Node.

The part of crewAI that matches the brain is the Flow. A Flow is event-driven Python code with typed state, `@router` branches, concurrent listeners, persistence, and human feedback (Documented). Crews add role, goal, and backstory tokens to every call, and the hierarchical manager is unreliable (Reported). The brain already has a Flow equivalent: markdown flows that a host agent follows, with subagents for the lenses.

crewAI pays off in two cases only:

1. Unattended review. A review runs with no chat session open, keeps its state, waits for the user's answer, and resumes later.
2. One lens engine for all three tools. Codex and OpenCode run the review lenses one after another today (Observed, `flows/review-branch.md` step 3). A Flow behind one MCP tool runs them in parallel in every tool, with typed findings and mixed models.

Try a Node fan-out over `claude -p`, `codex exec`, and `opencode run` first. It needs no new dependency and uses the tool subscriptions. Pilot crewAI only if that script cannot hold state, resume, or mix Ollama and Claude well enough.

## Use cases

Ranked by fit. Each use case is Proposed.

| ID | Use case | crewAI parts | Value | Fit | Main risk |
| --- | --- | --- | --- | --- | --- |
| C1 | Unattended PR review of teammates: run the lenses, verify, store draft findings, wait for the user, record accepted defect classes | Flow, `@persist`, `@human_feedback` with an async provider, `and_` | High | Best | Work code goes to a personal API key. Policy decision |
| C2 | One review engine for Claude Code, Codex, and OpenCode, exposed as an MCP tool | Flow behind a FastMCP wrapper, `MCPServerStdio` to `brain mcp` | Medium | Good | Two agent loops per review: the host and crewAI |
| C3 | Brain care batch: classify harvested memories, dedupe against premises, cluster for `brain-garden`, write a proposal report | Flow with local Ollama steps, `@router` | Medium | Medium | Small local models are weak at structured output |
| C4 | Reviewer regression set: seeded diffs, expected findings, a score per lens after a premise or prompt change | Flow, `Agent.kickoff(response_format=...)` | Medium | Low | A plain Node script does the same. `crewai test` only gives an LLM score from 1 to 10 |
| C5 | Learn rules with `@human_feedback(learn=True)`, Memory, or `crewai train` | Memory, train pickle | None | Reject | Second rule store. LLM consolidation edits or deletes records |

### C1 and C2: the lens Flow

The Flow replaces steps 3 and 5 of `review-branch`: one lens per listener, then merge, then the adversarial check. The host agent keeps steps 1, 2, and 6 to 8, because those steps need the user's approval, a worktree, and the PR.

```python
# Proposed sketch. Not run.
from pydantic import BaseModel
from crewai import Agent
from crewai.flow.flow import Flow, and_, listen, start
from crewai.flow.persistence import persist

class Finding(BaseModel):
    severity: str
    file: str
    line: int
    text: str
    source: str  # premise id or lens name

class Findings(BaseModel):
    items: list[Finding] = []

class ReviewState(BaseModel):
    diff: str = ""
    premises: str = ""
    found: dict[str, list[Finding]] = {}
    kept: list[Finding] = []

OPUS = "anthropic/claude-opus-5-5"
SONNET = "anthropic/claude-sonnet-5-5"

def run_lens(state: ReviewState, lens: str, model: str) -> list[Finding]:
    agent = Agent(role=f"{lens} reviewer", goal=f"Report {lens} findings in the diff.",
                  backstory="Read-only reviewer. Quote each premise you apply.", llm=model)
    out = agent.kickoff(f"{state.premises}\n\n{state.diff}", response_format=Findings)
    return out.pydantic.items

@persist
class ReviewLenses(Flow[ReviewState]):
    @start()
    def load(self):
        ...  # git diff and premise_list through MCPServerAdapter, in plain code

    @listen(load)
    def premises(self):
        self.state.found["premises"] = run_lens(self.state, "premises", OPUS)

    @listen(load)
    def security(self):
        self.state.found["security"] = run_lens(self.state, "security", SONNET)

    @listen(load)
    def tests(self):
        self.state.found["tests"] = run_lens(self.state, "tests", SONNET)

    @listen(load)
    def simplify(self):
        self.state.found["simplify"] = run_lens(self.state, "simplify", SONNET)

    @listen(and_(premises, security, tests, simplify))
    def verify(self):
        ...  # dedupe in code, then one adversarial agent on OPUS per finding
```

The four lens listeners run at the same time (Documented in source: the runtime gathers the listeners of one event). Use `and_` for the merge step. With `or_`, the first lens wins and the runtime cancels the others (Documented in source).

For C1, add a `@human_feedback` step after `verify` with `learn=False`. An async provider raises `HumanFeedbackPending`, and `Flow.from_pending(id).resume(feedback)` continues later (Documented). The step after the feedback calls `premise_seen`, or `premise_add` with `--status candidate`, for each accepted defect class. That keeps step 7 of `review-branch` intact.

For C2, wrap the Flow in a FastMCP stdio server with one tool, `review_diff(diff, repo)`. crewAI has no documented way to expose a Flow as an MCP server (Documented absence). The FastMCP wrapper is a community pattern (Reported).

### C3: brain care batch

`brain-care` runs `brain premise stats`, `brain workspace check`, `brain-harvest`, and `brain-garden`. A Flow can run the harvest and garden parts at night on Ollama: read memories in code, classify each item (rule, defect class, or ephemeral) with a local model, dedupe with `premise_search`, cluster, and write one report under `memory/decisions/`. The user approves each row in chat, as `brain-harvest` requires today.

`lib/decide.mjs` already asks a local Ollama model for flow hints in Node (Observed). Extend that file before you add Python for classification.

## Brain flows as crewAI Flows

| Brain flow | Part that fits a crewAI Flow | Part that stays in the host agent |
| --- | --- | --- |
| `review-branch` | Steps 3 and 5: lenses, merge, verify | Worktree, DoD approval, draft comments, user answers |
| `self-review` | Step 3: lenses per worktree | Fixes, refactors, `brain-learn` on rejections |
| `brain-care` | Harvest classification, garden clustering | Keep or drop decisions, `npm run check` |
| `grill-plan`, `start-ticket`, `address-review` | None. They are conversations | All |
| `split-branch`, `sync-with-main`, `prepare-pr` | None. They write git state after approval | All |
| `ui-change-verify` | None. It needs the Chrome DevTools MCP server in the session | All |
| `db-migration`, `proto-change` | None. They edit code | All |

Three of 12 flows have a part that fits. Each of those parts is a fan-out, a merge, and a check, with no file edits.

## What a pilot needs

| Need | Detail | Label |
| --- | --- | --- |
| Python runtime | `uv python install 3.13`. The local Python is 3.14.2, and crewAI requires `>=3.10,<3.14` | Observed, Documented |
| Separate project | A `crew/` directory with its own `pyproject.toml` and `uv.lock`, or a separate repo. Pin `crewai[anthropic]==1.15.30` and `mcp`. Do not install the `litellm` or `tools` extras | Proposed |
| Model access | `ANTHROPIC_API_KEY`, billed per token. The tool subscriptions do not cover crewAI. The key is unset in this shell. Ollama covers the cheap steps with `ollama/<model>` or `custom_openai=True` | Observed, Documented |
| Spend cap | crewAI has no budget cap, and `usage_metrics` can overcount (issue #7259). Set the limit in the Anthropic console | Reported |
| Privacy | `CREWAI_DISABLE_TELEMETRY=true`, `OTEL_SDK_DISABLED=true`, and `CREWAI_TRACING_ENABLED=false`. Telemetry is on by default and reports which coding assistant runs the process. Never set `share_crew` | Documented |
| No Memory or Knowledge | Keep `memory=False` and no knowledge sources. Both default to OpenAI embeddings and need `OPENAI_API_KEY` | Documented |
| Brain seam in | `MCPServerStdio(command="<abs>/brain", args=["mcp"], env={"BRAIN_ROOT": ..., "PATH": ...})` with a tool filter for `premise_list`, `premise_get`, and `premise_search`. crewAI passes only six environment variables, has no `cwd` field, and drops the server instructions. Use `MCPServerAdapter` for one Node process per run instead of one per call | Documented in source |
| Brain seam out | A `brain crew` subcommand that runs `uv run` and parses JSON, or a FastMCP server registered in `mcp/snippets/` and `scripts/install.sh` for the three tools. Turn off verbose output, because stdout noise can break stdio JSON-RPC | Proposed, Unknown |
| Read tools | Lens agents need diff and file reads. Write small read-only `BaseTool` classes over `git show` and file reads. Do not use crewai-tools file or web tools: they had path traversal, SSRF, and file-read CVEs in 2026 | Documented |
| Checks | `npm run check` must cover the Python part: a lint, a format check, and a test. `scripts/check-layout.sh` must accept the new directory | Proposed |
| Policy | Code of `qdrant` scope repos would go through a personal API key. The user decides whether that is allowed. Until then, run the pilot only on `personal` scope repos | Unknown |

## Decision boundaries

- Premises stay the only rule store. crewAI Memory, Knowledge, `@human_feedback(learn=True)`, and `crewai train` hold no rules. AGENTS.md says the CLI and the premise MCP call one library and keep no second database.
- crewAI writes to the brain only through `premise_seen` and `premise_add --status candidate`, after the user accepts a finding.
- crewAI posts no PR comment, makes no commit, and pushes nothing.
- The host agent keeps every interactive flow, every edit, and every browser check.
- No hierarchical process, no code execution, and no crewAI AMP feature.

## Alternatives and trade-offs

| Option | Language | Billing | Parallel lenses in Codex and OpenCode | New dependencies | Fit |
| --- | --- | --- | --- | --- | --- |
| Current markdown flows and subagents | Node, host agent | Subscriptions | No, one after another | None | Baseline |
| Claude Code Workflow tool | Claude Code script | Subscription | Not applicable | None | Parallel and deterministic in Claude Code only. `flows/README.md` documents a `workflow` field. No flow sets it, and `lib/flows.mjs` does not read it (Observed) |
| Node fan-out over `claude -p`, `codex exec`, and `opencode run` | Node | Subscriptions | Yes | None | Smallest step. No typed state or resume unless written |
| Claude Agent SDK, TypeScript | Node | API key | Yes | One package | Claude only |
| Mastra workflows | TypeScript | API keys | Yes | Several | Closest Node match to crewAI Flows: branch, parallel, suspend, and resume |
| crewAI Flows sidecar | Python | API keys | Yes, through MCP | About 690 MB and 137 packages | C1 and C2 only |
| LangGraph | Python or JS | API keys | Yes | Several | Most common migration target from crewAI. Checkpoint per node, interrupt and resume |

Anthropic's "Building effective agents" advises to start with direct API calls, because frameworks hide the prompts and the responses (Documented). Community reports repeat a pattern: prototype in crewAI, then rebuild in LangGraph or plain code (Reported).

## Proposed evaluation and adoption sequence

1. The user decides two policies: a personal API key for crewAI, and whether `qdrant` scope code may go through it.
2. Spike the Node fan-out over the headless CLIs on one branch. Record the wall time, the findings, and any rate limit.
3. Continue only if the spike fails at state, resume, or mixed models. Then build the C1 lens Flow in a sidecar, on `personal` scope repos, with the privacy variables set.
4. Run it on 10 branches that `review-branch` already reviewed. Record per branch: findings the user accepted, findings the user rejected, findings missed against the earlier review, tokens, USD, and wall time.
5. Adopt when the accepted share is equal to or higher than the current review, and the cost per branch stays under a cap the user sets before step 4. Otherwise reject, and write a decision note under `memory/decisions/`.

## Documented crewAI capabilities

Version 1.15.30, released 2026-10-24. MIT license. Python `>=3.10,<3.14`. About two stable releases each week since June 2026, plus daily pre-releases.

| Area | Facts |
| --- | --- |
| Flows | `@start`, `@listen`, `@router`, `or_`, `and_`. State as a dict or a Pydantic model with an automatic id. `@persist` on SQLite by default. Checkpoints in `./.checkpoints/`. `kickoff(restore_from_state_id=...)` forks a state. `flow.plot()` writes HTML. The docs recommend a Flow first for production |
| Single steps | `Agent(...).kickoff(prompt, response_format=Model)` returns typed output. `LLM(model=...).call(prompt)` makes one call |
| Human feedback | `@human_feedback(message, emit, provider, learn)`, version 1.8.0 or later. `HumanFeedbackPending` and `Flow.from_pending(id).resume(...)` for async answers. `learn=True` writes lessons into Memory |
| Crews | Sequential or hierarchical. Tasks with `expected_output`, `output_pydantic`, `context`, `async_execution`, and guardrails that retry three times by default |
| Models | Native Anthropic with `crewai[anthropic]`. `max_tokens` is required for Anthropic. Ollama through the `ollama/` prefix or `custom_openai=True`. A model per agent |
| MCP client | `Agent(mcps=[MCPServerStdio(...)])` with a static tool filter, or `MCPServerAdapter`. Tools only: no prompts, resources, or server instructions |
| Skills | `Agent(skills=["./skills"])` loads `SKILL.md` files by name and description first, then the body when it applies |
| Hooks and events | `@on(InterceptionPoint.PRE_TOOL_CALL, ...)` and seven other points. `HookAborted` stops a step. `BaseEventListener` for the event bus |
| Memory | One `Memory` class on LanceDB in `./.crewai/memory`. Default embedder OpenAI `text-embedding-3-large`, default analysis model `gpt-4o-mini`. Consolidation can update or delete records |
| Telemetry | On by default. Sends versions, role names, tool names, model names, and the coding assistant name, such as `claude_code`. Opt out with `CREWAI_DISABLE_TELEMETRY=true` |
| Security | CERT VU#221883: four CVEs in 2026 for code execution, file read, and SSRF. CodeInterpreterTool removed. LiteLLM is optional after the malicious 1.82.7 and 1.82.8 releases |
| Paid platform | Trace UI, `crewai eval`, `crewai deploy`, the skill registry, the hallucination guardrail, and A2A serving at scale need CrewAI AMP |

## Reported community experience

- Consensus: Flows are the useful part of crewAI. Several sources advise Flows over autonomous Crews in production.
- Consensus: Crews use about two to three times the tokens of LangGraph for the same task. The benchmarks have thin methods. One benchmark of 2,000 runs found the most parse, retry, and loop failures in crewAI.
- Consensus: the hierarchical manager often does not delegate. Issue #8368, fixed on 2026-10-23, showed the manager delegating to itself after the first run.
- Debugging is hard: default prompt text is hidden unless you override it, and print calls inside task callbacks do not show.
- Claude issues in October 2026: #8341 is open (a crash on empty tool arguments), and #8233 is closed (400 errors with Sonnet 5.5 and Opus 5.5). MCP issue #8045 is open: crewAI drops empty `[]` and `{}` arguments.
- Install size: a research subagent measured 689 MB and 137 packages for `crewai==1.15.30` on Python 3.12, with a 9-second first import.
- Upgrades break import paths, and teams pin versions.
- Local models: small models fail at tool calls. One maintainer reported that a 14B model works where a 7B model fails.
- No official crewAI PR-review example exists. Community repos use one agent per lens and a consolidating reviewer, in sequence, with no quality data.

## Observed brain state

- The brain is Node ESM with two runtime dependencies: `@modelcontextprotocol/sdk` and `yaml`. It has no Python.
- `brain-premises` starts as `${HOME}/.local/bin/brain mcp` with `BRAIN_ROOT` in the environment (`mcp/snippets/brain-premises.json`).
- `brain premise list` has no JSON output. A Python step reads premises through MCP.
- Local tools: Python 3.14.2, uv 0.13.1, and Ollama with `nimble-v3-16k`, `qwen3.5:9b`, and `qwen3.5:4b`.
- `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are unset in the shell.

## Unknowns

- Whether the user's employer allows `qdrant` scope code through a personal API key.
- The token cost of the lens Flow on this workload, against the current subagent review.
- Whether crewAI stdout output breaks a FastMCP stdio wrapper.
- Whether open-source crewAI can serve A2A without AMP.
- The subscription rate limits for parallel headless runs of `claude -p`, `codex exec`, and `opencode run`.
- Which crewAI release contains the fix for MCP issue #8299, where only the first content block reached the agent.

## Questions for independent assessment

1. Is unattended review (C1) a real need, or does the user always review in a session?
2. Does a Node fan-out over headless CLIs give parallel lenses in Codex and OpenCode at an acceptable quality, and does it make C2 unnecessary?
3. Is the Claude Code Workflow tool a better first step for parallel lenses, given that `flows/README.md` already documents a `workflow` field?
4. Is Mastra a better fit than crewAI if a workflow engine becomes necessary, because it keeps the brain in one language?
5. Do the decision boundaries keep crewAI from becoming a second rule store?

## Applied premise snapshot

- `docs-summary-first` (always): "Write each documentation file summary first: the title, a short summary of the main point and of what the reader must know or do, a table of contents when the file has four or more ## sections, and then the sections from most to least important, with background and detail last."
- `no-hard-wrapped-markdown` (never): "Hard-wrap Markdown prose. Write one line per paragraph."
- `brain-memory-is-shared` (always): "Save a lasting rule or correction as a brain premise, not only in the memory of one tool, so every tool applies it." The decision boundaries keep rules out of crewAI Memory for this reason.
- `memory-only-what-repeats` (always): "Store a rule only when it is important." This assessment adds no premise.
- `stay-in-request-scope` (always): "Keep a change inside the request." The unused `workflow` field is reported, not changed.
- `no-commit-push-unasked` (never): "Commit or push without an explicit request in that turn." Nothing is committed.

## Sources

- [crewAI on PyPI](https://pypi.org/project/crewai/)
- [crewAI releases](https://github.com/crewAIInc/crewAI/releases)
- [crewAI introduction](https://docs.crewai.com/en/introduction)
- [Flows](https://docs.crewai.com/en/concepts/flows)
- [Production architecture](https://docs.crewai.com/en/concepts/production-architecture)
- [Human feedback in flows](https://docs.crewai.com/en/learn/human-feedback-in-flows)
- [Checkpointing](https://docs.crewai.com/en/concepts/checkpointing)
- [Agents](https://docs.crewai.com/en/concepts/agents)
- [Tasks](https://docs.crewai.com/en/concepts/tasks)
- [LLMs](https://docs.crewai.com/en/concepts/llms)
- [LiteLLM removal guide](https://docs.crewai.com/en/learn/litellm-removal-guide)
- [MCP overview](https://docs.crewai.com/en/mcp/overview)
- [MCP security](https://docs.crewai.com/en/mcp/security)
- [Memory](https://docs.crewai.com/en/concepts/memory)
- [Knowledge](https://docs.crewai.com/en/concepts/knowledge)
- [Skills](https://docs.crewai.com/en/concepts/skills)
- [Execution hooks](https://docs.crewai.com/en/learn/execution-hooks)
- [Telemetry](https://docs.crewai.com/en/telemetry)
- [Training](https://docs.crewai.com/en/concepts/training)
- [CERT VU#221883](https://kb.cert.org/vuls/id/221883)
- [AIMultiple agentic frameworks benchmark](https://aimultiple.com/agentic-frameworks)
- [Claude Agent SDK vs LangGraph vs CrewAI benchmark](https://pasqualepillitteri.it/en/news/3095/claude-agent-sdk-vs-langgraph-vs-crewai-benchmark-2026-en)
- [vadim.blog: crewAI unique features](https://vadim.blog/crewai-unique-features)
- [agentmail: best AI agent frameworks 2026](https://agentmail.to/blog/best-ai-agent-frameworks-2026)
- [Thoughtworks Radar: CrewAI](https://www.thoughtworks.com/en-in/radar/languages-and-frameworks/crewai)
- [Issue #8368: hierarchical manager delegates to itself](https://github.com/crewAIInc/crewAI/issues/8368)
- [Issue #7259: usage metrics overcount](https://github.com/crewAIInc/crewAI/issues/7259)
- [GaneshPokharel-tech/crewai-code-reviewer](https://github.com/GaneshPokharel-tech/crewai-code-reviewer)
- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Mastra suspend and resume](https://mastra.ai/docs/workflows/suspend-and-resume)
- [LangGraph.js interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
