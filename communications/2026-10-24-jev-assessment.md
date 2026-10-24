# Jev integration assessment for independent AI review

Date: 2026-10-24.

Status: proposal for evaluation. The user requested an assessment and then an English record for another AI model to interpret and challenge. Implementation has not been approved or started.

Location: `communications/` holds standalone communications. This document is informational and is not registered as a flow, skill, agent, premise, hook, or MCP resource. References to existing flows below describe potential integration points.

## Purpose and evidence labels

Assess whether a decision model such as TypeSafe's Jev could simplify the review brain, improve consistency, and reduce repeated work across flows, skills, agents, and MCP integrations.

The original recommendation is to pilot intent-aware flow selection, followed by progressive skill selection. Treat that recommendation as a hypothesis to evaluate, rather than an accepted architecture decision.

| Label | Meaning |
|---|---|
| Observed | Read from the local repository or returned by a command during the assessment on this date. |
| Documented | Reported by the official TypeSafe documentation consulted on this date. This does not establish performance on this repository. |
| Proposed | A suggested change or experiment that is not implemented. |
| Unknown | A question that needs measurement, external-service verification, or a user decision. |

## Existing system

The brain is a personal repository shared by Claude Code, Codex, and OpenCode. Its central distinction is: premises are rules, skills are workflows, and Engram is the session log.

| Component | Current responsibility | Local reference |
|---|---|---|
| Scope resolution | Identify the repository and applicable personal, Qdrant, or global rules | [scope library](../lib/scope.mjs), [scope configuration](../brain.config.json) |
| Premise store | Store active and candidate rules, filter by scope and repository, validate mutations | [premise library](../lib/premise.mjs), [learning skill](../skills/active/brain-learn/SKILL.md) |
| CLI and MCP | Expose the same premise library and store | [CLI](../bin/brain.mjs), [MCP server](../lib/mcp.mjs) |
| Flow matching | Match repository-state signals and rank compatible flows | [flow library](../lib/flows.mjs), [flow format](../flows/README.md) |
| Skills and agents | Supply procedures, review lenses, and independent review contexts | [skill catalog](../skills/third-party.json), [reviewer](../agents/brain-reviewer.md), [split planner](../agents/brain-split-planner.md) |
| Session hook | Load the scope, active premises, and three matching flows; skip the PR network lookup | [session hook](../bin/session-premises.mjs) |
| Definition of Done | Record observable outcomes, checks, pass conditions, and evidence tied to the current tree | [DoD library](../lib/dod.mjs), [DoD template](../templates/dod.md) |
| Workspace audit | Detect missing skills, version differences, and name collisions | [workspace library](../lib/workspace.mjs) |

The flow bodies are procedures that an agent follows. The CLI matcher selects candidates from frontmatter; it does not execute those procedures as a workflow engine. Adding a classifier alone would not automate every step of a flow.

## Observed verification and operational findings

These results describe the working tree examined during the original assessment. The tree contained extensive pre-existing uncommitted changes. These observations are a dated snapshot, not a certification of the repository's later state.

| Check | Observed result | Interpretation |
|---|---|---|
| `npm run check` | Exit 0; 108 tests, 108 passes, 0 failures | Tests and the MCP, skill, layout, path, and snippet checks passed locally. |
| `brain dod lint --done` | `ok: 7 criteria, each with evidence for tree f008db1e3b0b` | The existing branch DoD passed. Its title was `DoD system for the brain`; it did not cover Jev integration or every external service. |
| `brain workspace check` | Exit 1; 71 reported entries | The workspace was not free of configuration drift or unreadable skills. |
| Connected `premise_list` | `Brain code changed after this server started. Reconnect brain-premises to load the current version.` | The existing app connection was stale. The CLI remained usable. |

Workspace findings were counted as follows:

| Scope | `broken`: no readable `SKILL.md` | `version`: content differs from brain | Total |
|---|---:|---:|---:|
| Qdrant | 31 | 13 | 44 |
| Personal | 1 | 26 | 27 |
| Total | 32 | 39 | 71 |

The `broken` category includes both broken links and other entries without a readable `SKILL.md`. A checked example was `qdrant-cloud-cluster-api/.claude/skills/fastapi-python`: its symlink target was `../../.agents/skills/fastapi-python`, and that target did not exist. The personal `monedix/.agents/skills/monedix-testing-workspace` entry existed but lacked `SKILL.md`.

A version difference is not automatically a defect. A repository may intentionally adapt a skill. Each difference needs comparison before deciding whether to change either copy.

The successful MCP check starts a fresh server and verifies its version, schemas, and shared store. It does not restart an app's existing connection. This explains why local checks passed while the connected tool rejected calls. See [MCP integration notes](../docs/integrations.md).

No Jev integration was found in the inspected flows, agents, libraries, CLI, MCP configuration, active skills, or scripts. No hosted Jev requests were made. No operational problems identified above were repaired during the assessment.

## Documented Jev capabilities and limits

The official documentation consulted on 2026-10-24 listed `jev-1.14.0` as the current stable model. An evaluated integration should pin a version when fitting thresholds, because aliases such as `jev-latest` can move. [Models](https://docs.typesafe.ai/models).

Jev accepts state and typed questions through `POST https://api.typesafe.ai/v1/systemone`. The relevant primitives are `Choice` for a selection from supplied options, `Noul` for the probability of a yes/no statement, and `Score` for evaluation against ordered descriptive levels. Responses include the answering model and token usage. [System One API](https://docs.typesafe.ai/api/system-one).

Jev's role would be a structured decision function inside the brain. The existing LLM-based agents would continue research, writing, tool execution, and explanations. TypeSafe explicitly documents this distinction for coding-agent integrations. Setting a flow's existing agent `model` field to Jev would not provide that integration. [Jev with coding agents](https://docs.typesafe.ai/introduction/coding-agents).

Choice and Score expose distributions and a derived `confidence` value. Noul returns a probability without a separate confidence field. Confidence measures the returned distribution; a threshold is not a guarantee of the corresponding empirical accuracy. Thresholds require evaluation for each task and model version. [Confidence](https://docs.typesafe.ai/confidence).

English is the primary training language. Spanish user requests need their own evaluation. The default context limits were documented as 64k tokens per request and 32k per question; a pilot should send only the context needed for its decision. [Models and language support](https://docs.typesafe.ai/models).

Images and Box questions were documented as experimental, behind an explicit header. Images were documented for Jev 1.13 and 1.14, with Box requiring 1.14. Older text-only notes should not be treated as the current full API contract. Experimental image support does not establish suitability for a production UI verification gate. [Images](https://docs.typesafe.ai/images).

TypeSafe documents literal interpretation, numeric precision, indirection, irrelevant context, adversarial content, and option-order effects as limitations of Jev 1.13. These are useful evaluation cases; their exact severity on 1.14 remains unmeasured here. [Jev 1.13 limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

## Proposed integration opportunities

Priority expresses the original qualitative assessment. It is not a measured return on investment.

| Existing point | Priority | Proposed Jev decision | Responsibility retained by code, the agent, or the user |
|---|---|---|---|
| `brain next` | High | Select a flow using the user's request and repository facts, from compatible candidates plus an explicit no-match option | Code computes facts and admissible candidates; existing flow selection and approval requirements remain in force. |
| Skill selection | High | Rank optional skills and load a small relevant subset progressively | Skills explicitly required by the flow and all applicable hard premises remain mandatory. |
| `brain-learn` | High | Classify a user intervention as ephemeral, an implicit correction, or an explicit request to retain a rule; suggest existing equivalents | Scope validation, repeat tracking, promotion rules, and authorized mutations remain in the current system. |
| `brain-harvest` and `brain-garden` | High | Group semantically equivalent rules and propose coherent premise clusters | Code counts occurrences and dates; current scope boundaries, approvals, and draft-only rules remain. |
| Workspace audit | High | Compare skill versions for semantic changes, contradictions, or cosmetic differences; prioritize review | File existence, readable targets, hashes, and broken-link detection remain deterministic. |
| `address-review` | Medium-high | Classify comments as a defect claim, clarification, preference, or design suggestion | The agent verifies each claim against code before changing it. |
| `self-review` and `review-branch` | Medium | Suggest duplicate findings and prioritize their examination | The current evidence checks and required review lenses remain; Jev alone does not discard findings or approve a change. |
| `start-ticket` and `grill-plan` | Medium | Identify missing information and prioritize an unresolved question | The agent investigates facts and writes the plan; the user resolves decisions requiring their judgment. |
| `split-branch` | Medium | Compare proposed groupings against stated reviewability criteria | The planner and Git checks establish dependencies, conflicts, and preservation of changes. |
| DoD and `prepare-pr` | Medium | Assess requirement coverage and flag apparently weak criteria | Commands produce evidence; `brain dod lint --done` remains the completion gate. |
| `proto-change`, `db-migration`, and `sync-with-main` | Low | Possibly prioritize investigation when several issues are present | Buf, descriptors, Alembic, Git, and tests perform exact compatibility and state checks. |
| `ui-change-verify` | Experimental | Classify console errors or suggest additional checks; evaluate image judgments separately | Browser interaction, screenshots, tests, and evidence remain in the current flow. |
| Agent and model selection | Medium, later | Recommend an existing review profile based on the task | Preserve configured minimum coverage and model requirements until a separate evaluation justifies a policy change. |
| MCP tools | Supporting integration | Expose the same narrow decision function to each client | MCP remains a transport adapter; the shared library owns the decision logic. |
| SessionStart hook | Low | No remote decision call proposed at startup | Keep the local context load; evaluate intent after a user request is available. |

### Why flow selection is the first candidate

Observed: `matchFlows` requires every configured signal to match, then ranks by the number of configured signals and breaks ties by name. `brain next` currently accepts directory and output options, but not the user's request. See [flow matching](../lib/flows.mjs) and [CLI handling](../bin/brain.mjs).

Proposed: preserve this deterministic eligibility filter and use Jev to choose among its results when a request is available. The same repository state could support different user intentions, such as reviewing work, preparing a PR, or examining simplifications. An explicit no-match outcome would allow a request to remain outside the catalog.

This adds an intent decision while preserving existing state constraints. Whether it improves on the agent's current selection needs measurement.

### Why skill selection is the second candidate

The catalog contains many skills whose descriptions and full instructions consume context. Selecting relevant optional material is a repeated semantic decision.

TypeSafe publishes a skill-suggestion example that ranks a catalog, examines a shortlist, and can reject every candidate. That example supports the proposed pattern, but its published results are not measurements of this brain or its clients. [Official skill-suggestion example](https://docs.typesafe.ai/cookbooks/skill_suggestion).

The pilot would need to demonstrate reduced context or repeated work without omitting mandatory skills. A suggestion layer alone may improve selection without reducing the catalog already injected by a client; actual context savings depend on the client integration.

## Proposed minimum architecture

```text
User request + locally computed repository facts
    -> deterministic eligibility and scope filters
    -> narrow Jev question over a closed candidate set
    -> response validation and decision policy
    -> existing agent and flow procedure
    -> existing checks and completion evidence
```

One shared library function would support both CLI and MCP callers. The existing Markdown files would remain the source for flow procedures. The first experiment would not introduce a second premise store, a generic decision DSL, or a new service for every decision.

An illustrative CLI extension is `brain next --request "Review the current change" --json`, with a corresponding narrow MCP tool calling the same function. These interfaces are proposals, not existing commands or accepted contracts.

For that first decision, the input would contain the user request, scope, relevant repository facts, candidate flow IDs and descriptions, and the criteria needed to distinguish them. The result would select a supplied ID or the no-match outcome. Code would validate the result against the candidate set before it affected routing.

Decision failure, timeout, invalid output, or insufficient confidence would preserve the existing selection path. A Jev recommendation would not itself authorize a commit, push, external message, premise promotion, or any other action whose authorization is governed elsewhere.

Selecting an MCP server already declared in a chosen flow is a direct lookup. There is little benefit in asking Jev to repeat that lookup. MCP's value here is exposing one consistent decision implementation across clients.

### Input-quality issue to resolve

Observed: `prState` returns `none` for a branch without an open PR and also in its catch path when the `gh` query fails. Thus `none` can represent a failed lookup rather than a known absence. See [repository context collection](../lib/flows.mjs).

Proposed: distinguish an unknown PR state from a confirmed absence before making automated routing depend on that field. A model should not compensate for ambiguous facts supplied by code.

## Decision boundaries

- Code resolves repository scope and filters premises. Every applicable active `always` and `never` premise remains in force.
- Code owns counts, dates, thresholds for repeated corrections, exact file checks, and Git state.
- The current learning procedures determine when to propose, store, promote, or drop a rule. Semantic similarity is evidence for comparison, not proof that two rules are interchangeable.
- Agents establish reachability, causality, library behavior, and supporting evidence for review findings. Jev can prioritize their attention.
- Commands and direct observations produce completion evidence. A semantic coverage score cannot manufacture evidence or close the DoD.
- User authorization remains governed by the request and existing policy. Model confidence does not grant permission.
- A pilot can use synthetic or approved examples. Sending work code or other sensitive material to an additional provider needs an established data-handling basis.

## Alternatives and trade-offs

| Option | Benefit | Cost or limit |
|---|---|---|
| Keep deterministic routing and refine metadata | Small change, local operation, predictable behavior | Metadata alone does not interpret arbitrary user intent. |
| Keep the current LLM's selection | No additional provider or decision layer | Selection quality and repeated context costs remain to be measured. |
| Add Jev for one bounded decision | Typed output, explicit uncertainty, shared behavior across clients | Adds network failure modes, question maintenance, evaluation work, and provider dependence. |

The first option may be sufficient if the main problem is missing metadata. Jev earns its place only if an experiment shows a useful improvement over both current routing and a simpler metadata change.

The principal expected benefit at personal usage volume is more consistent selection and less repeated agent work. Low inference cost alone does not justify integration complexity.

## Proposed evaluation and adoption sequence

1. Address the stale MCP connection and investigate unreadable skills. Compare version differences before deciding which are defects. This is proposed follow-up work, not work completed by this communication.
2. Build an initial set of 50-100 labeled flow-selection cases, with Spanish and English requests. Include ambiguous requests, multiple eligible flows, no suitable flow, and explicit requests that remain subject to authorization rules. This is an exploratory sample, not sufficient evidence of general reliability.
3. Compare three baselines where practical: current deterministic suggestions, the existing agent's choice, and the Jev-assisted choice. Include a held-out subset when tuning questions or thresholds.
4. Run Jev in observation mode first. Record its proposed choice without allowing it to change execution, then inspect disagreements.
5. Measure correct routing, appropriate abstention, mandatory-skill omissions, context loaded, total agent calls, total cost, and end-to-end latency. Evaluate fallback behavior for network failure and invalid responses.
6. Add progressive skill selection only if flow selection shows a benefit. Preserve required skills and premises throughout.
7. Evaluate maintenance uses next: candidate deduplication, premise clustering, and semantic comparison of skill versions. Keep acceptance and activation rules unchanged.
8. Consider model selection or reduced review coverage only through a separate evaluation. The first pilot would retain all current required lenses and verification steps.

Thresholds and acceptable error rates remain open decisions. The experiment should state its acceptance conditions before tuning and should report false confident decisions as well as abstentions. Include quoted instructions, contradictory content, reordered choices, and cross-scope lookalikes as challenging cases.

Evaluation records are technical experiment data. This proposal does not turn transient branch state, routing choices, or individual findings into lasting premises or session memory.

## Cost estimate

The documented price at the time of the assessment was USD 0.042 per million input tokens, with output tokens free. At 5,000 billable input tokens per decision, 1,000 decisions would cost approximately USD 0.21 in Jev inference: `5,000 * 1,000 / 1,000,000 * 0.042`. [Pricing](https://docs.typesafe.ai/models).

This is arithmetic from the published rate, not a measured workload estimate. It excludes the existing agent's calls, retries, multiple-stage selection, integration maintenance, and any future price changes. Total savings depend on whether Jev removes work rather than merely adding a call.

## Questions for independent assessment

The next reviewer should challenge the recommendation and distinguish evidence from assumptions. Useful questions are:

1. Does intent-aware selection solve a recurring problem here, or would clearer flow metadata be sufficient?
2. Which proposal removes the most repeated work relative to its implementation and maintenance cost?
3. Can each decision be expressed as a narrow closed-set question with enough relevant state?
4. Which failure could silently remove a required skill, review lens, premise, or check, and how would the pilot expose it?
5. Does each target client allow the proposed context reduction, or would the full skill catalog remain loaded regardless?
6. Are the existing baseline, labeled cases, acceptance conditions, and disagreement review adequate for an initial experiment?
7. Should workspace semantic comparison or rule deduplication precede flow selection instead?
8. Are the operational findings correctly separated from integration opportunities, and which should be resolved first?
9. Is the shared CLI/MCP function the smallest useful integration, or does it introduce unnecessary coupling?
10. What evidence would justify adoption, postponement, or rejection of Jev for this repository?

A useful response would identify factual corrections, rank opportunities, compare the smallest viable experiment with simpler alternatives, and state unresolved questions. Implementation remains outside this communication's authorization.

## Applied premise snapshot

The audit used the active premises returned for repository `qdrant-review-brain`, scope `personal`. The connected MCP rejected the call because it was stale, so the CLI supplied the list. These quotations record the audit's constraints; current authoritative rules remain in [the premise store](../memory/premises/).

| ID | Strength | Exact rule text |
|---|---|---|
| `brain-memory-is-shared` | always | "Save a lasting rule or correction as a brain premise, not only in the memory of one tool, so every tool applies it." |
| `dod-before-done` | always | "Agree a Definition of Done before work starts, call a task done only when brain dod lint --done passes, and make each review report that result: each criterion names an observable outcome, a check, a concrete pass condition, and fresh evidence." |
| `memory-only-what-repeats` | always | "Store a rule only when it is important: an explicit ask becomes a premise, any other correction becomes a candidate that waits for a repeat, and ephemeral facts such as branch state, ticket details, review findings, and what git or the code records go into no memory." |
| `no-co-author-no-footer` | never | "Add a Co-Authored-By trailer, or a tool footer such as Generated with Claude Code, to a commit or a PR." |
| `no-commit-push-unasked` | never | "Commit or push without an explicit request in that turn." |
| `no-hard-wrapped-markdown` | never | "Hard-wrap Markdown prose. Write one line per paragraph." |
| `no-pr-comment-unasked` | never | "Post a comment or a reply on a PR without an explicit request in that turn." |
| `shell-rm-cp-no-prompt` | always | "Write command rm -f and command cp -f, because rm and cp are interactive aliases in the user shell and a prompt hangs an agent." |
| `stay-in-request-scope` | always | "Keep a change inside the request. Mention unrelated dead code and leave it in place." |
