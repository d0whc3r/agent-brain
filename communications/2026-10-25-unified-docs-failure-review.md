# Unified documentation failure review

The two reports contain 31 source findings: 16 are confirmed, 14 are partly confirmed, and 1 is false. The six findings from the earlier premise review add six distinct causes; none is an exact duplicate of the 25-finding report. Several original failure claims and proposed fixes need narrower wording. The retained issues comprise 2 critical, 15 high, and 13 low findings; the false finding is excluded. A follow-up on 2026-10-25 fixed 28 findings and skipped 3. The [Resolution](#resolution) section records each disposition.

Date: 2026-10-25. Reviewed repository: `d0whc3r/agent-brain`, commit `f379367cdf5b26f9aff5c4105d9a8c795c65b968`. Scope: `personal`, with qdrant-specific instructions checked against the premises applicable to their intended repositories.

Status: independent review and consolidation. This requested communication is not a premise, decision note, skill, or session-memory entry.

Contents:

- [Resolution](#resolution)
- [Inputs and method](#inputs-and-method)
- [Comparison and disposition](#comparison-and-disposition)
- [Review of F1 to F25](#review-of-f1-to-f25)
- [Additional findings F26 to F31](#additional-findings-f26-to-f31)
- [Unified correction order](#unified-correction-order)
- [Evidence and verification](#evidence-and-verification)
- [Applied premise snapshot](#applied-premise-snapshot)

## Resolution

A follow-up session on 2026-10-25 checked each finding against the sources at commit `f379367` again, and the user approved the fixes. It fixed 28 findings and skipped 3. It found the prefix claim of F7 false, and F16 wider than reported: `brain-next` also ran `brain-split-planner` before the body of `split-branch` ran it again. Nothing was committed.

| Finding | Disposition | Changed files |
| --- | --- | --- |
| F1 | Fixed. A new untracked file gets a DoD criterion that lints and formats it by its path. | `flows/ui-change-verify.md`, `dod/qdrant-cloud-ui.md` |
| F2 | Fixed. A part copies its files with `git restore --source=<source> --worktree`. A scratch repo showed the added, changed, and deleted paths in the working tree, and an empty `git diff --cached`. | `skills/active/brain-worktrees/SKILL.md` |
| F3 | Fixed. The approval of the plan is not a commit request. A stack waits for the commit of each parent, and its proof runs after the commits. | `skills/active/brain-worktrees/SKILL.md`, `flows/split-branch.md` |
| F4 | Fixed. Garden asks the user to name the draft in chat. | `skills/active/brain-garden/SKILL.md` |
| F5 | Fixed. The main session opens the page. `brain-reviewer` runs only for a diff review. | `docs/use-cases.md` |
| F6 | Fixed. Brain care follows `brain-workspace-audit`, `brain-harvest`, and `brain-garden` by name. | `flows/brain-care.md` |
| F7 | Fixed in part. The audit no longer claims drift since a previous scan. The prefixes stay, because the prefix claim is false. | `skills/active/brain-workspace-audit/SKILL.md`, `docs/use-cases.md`, `docs/catalog.md` |
| F8 | Fixed. The reviewer and the catalog point to `kindsOf` instead of a partial copy. | `agents/brain-reviewer.md`, `docs/catalog.md` |
| F9 | Fixed. The tip states the origin-based behavior of a copy. | `docs/getting-started.md` |
| F10 | Fixed. The docs name `brain-tp-find-skills` and `brain-tp-skill-creator`, and a draft goes to the brain. | `docs/use-cases.md`, `docs/catalog.md`, `docs/getting-started.md` |
| F11 | Fixed. A PR review fetches `pull/<n>/head` into a detached worktree and reads the base and head commits with `gh pr view`. | `flows/review-branch.md` |
| F12 | Fixed in the docs. The `merged` row says that a new branch is also `merged`. A squash-merged branch stays until the user asks for `git branch -D`. The label in `lib/worktrees.mjs` is unchanged. | `skills/active/brain-worktrees/SKILL.md` |
| F13 | Fixed. Harvest reads the repo path from the `cwd` field of a session file. | `skills/active/brain-harvest/SKILL.md` |
| F14 | Fixed. The catalog says that the install does not register the Obsidian MCP, and links its setup notes. | `docs/catalog.md` |
| F15 | Fixed. The rule names the qdrant scope-root `AGENTS.md` and forbids code patterns from copies. | `AGENTS.md` |
| F16 | Fixed. `brain-next` runs an agent only at the step that names it. The review flows no longer list the wrapper skill. | `skills/active/brain-next/SKILL.md`, `flows/review-branch.md`, `flows/self-review.md` |
| F17 | Fixed. The docs refer to the `check` script in `package.json`. | `CONTRIBUTING.md`, `docs/catalog.md` |
| F18 | Fixed. Harvest uses the threshold that `brain-learn` states, and the catalog keeps the stats flags in one row. | `skills/active/brain-harvest/SKILL.md`, `docs/catalog.md` |
| F19 | Skipped. Node 24 ships npm, and `scripts/install.sh` prints the PATH export line. | None |
| F20 | Fixed. `brain-next` uses a connected server with the same tools when the Claude Code server name is absent. | `skills/active/brain-next/SKILL.md` |
| F21 | Fixed. The catalog names the parts with a prefix and the `chrome-devtools` exception. | `docs/catalog.md` |
| F22 | Skipped. The finding is false. | None |
| F23 | Fixed. The case routes a review before a PR to the `self-review` flow. | `docs/use-cases.md` |
| F24 | Skipped. "No decision note" says what to write, and a kept historical source does not conflict with it. F28 fixes the example. | None |
| F25 | Fixed. The intent paragraph uses the past tense. | `docs/superpowers/specs/2026-10-23-install-receipt-design.md` |
| F26 | Fixed. Shared validation rejects an empty or whitespace-only text, and `TestRejectEmptyText` covers add and a hand-edited file. | `lib/premise.mjs`, `lib/premise.test.mjs` |
| F27 | Fixed. Harvest lists the candidates, reuses a candidate id, records only new occurrences, and promotes a `ready` candidate. | `skills/active/brain-harvest/SKILL.md` |
| F28 | Fixed. An explicit ask promotes a matching candidate at once, and the example updates and promotes it. | `skills/active/brain-learn/SKILL.md` |
| F29 | Fixed. The example and the template cover both cluster repos. | `skills/active/brain-learn/SKILL.md`, `templates/premise.md` |
| F30 | Fixed. Garden writes a new skill only under `skills/drafts`, plus the pattern note and the decision status. | `skills/active/brain-garden/SKILL.md`, `docs/use-cases.md` |
| F31 | Fixed in the docs. `update` fixes a field, and a bad `seen` entry is fixed by hand. No `--seen` flag was added, because one repair case does not justify a new interface. | `docs/catalog.md` |

## Inputs and method

Report A is `communications/2026-10-25-docs-failure-review.md`, read from the `docs-failure-review` worktree at the same commit as the main checkout. It is an untracked report in `.claude/worktrees/docs-failure-review/communications/`, not a file present in the main checkout. Its SHA-256 is `f8fa963560f2a2e7c18bb8d5678a437691df403fc918bb32b4ee77b605974931`.

Report B is the earlier standalone `agent-brain-premise-review-2026-10-25.md`, read from `/private/tmp/`. Its SHA-256 is `f142f785fcd3e73f415ea60994a42ab32f451e4eeb0e420daf6e3cc893f73dad`.

This report follows A's **How to review**: inspect the cited sources, check commands and implementation behavior, try to disprove each failure, and assess the proposed fix. A's F1–F25 retain their IDs. B's F1–F6 become F26–F31. The user's instruction to create this communication authorizes this new file; the reviewed sources remain unchanged.

Verdicts apply to the claim described in each block. `confirmed` can describe a reproduced implementation defect or a directly observable instruction gap; it does not mean that an autonomous agent was observed failing. `partly` retains only the narrower supported claim. `false` removes the alleged defect from the correction queue. Severity is reassessed using A's definitions, and low findings are improvements to clarity or maintenance rather than proof of runtime failure.

## Comparison and disposition

| Report B | Unified ID | Comparison with report A | Disposition |
| --- | --- | --- | --- |
| F1, empty premise text | F26 | New. A's passing premise check does not test this invalid-input case. | Retain as a validation defect. |
| F2, harvest omits existing candidates | F27 | New. A checked coverage across repositories; it did not check candidate coverage under the default active status. | Retain as a workflow gap. |
| F3, explicit activation of an existing candidate | F28 | Partial overlap with A F24's example-ID concern; different cause: the existing-candidate transition is not stated. | Retain the missing transition; count the example's duplicate-add symptom here once. |
| F4, RPC example repository coverage | F29 | Shares the example with A F24, but concerns repository filtering rather than ID collision or historical evidence. | Retain as a separate coverage defect. |
| F5, garden write restrictions | F30 | Shares the garden document with A F4, but concerns allowed output paths rather than slash-command wording. | Retain as a separate instruction contradiction. |
| F6, malformed observation repair | F31 | New. No equivalent recovery-path finding appears in A. | Retain as a management-interface and documentation gap. |

There are no exact cross-report duplicates and no direct logical contradiction between the six retained B claims and A's 25 finding claims. Shared files are not sufficient evidence of duplication. Two apparent conflicts need qualification: an empty repository filter does not include candidates automatically, and a demoted candidate's old decision source is historical evidence rather than a newly created candidate decision.

A F24's example-ID symptom and B F3's missing reuse/promotion path overlap. The correction queue counts that symptom under F28, while F24 keeps only the narrower provenance-documentation clarification. The original claims that natural-language acceptance cannot authorize its documented commit, that all browser reviews are impossible, and that any use of `always` or `never` must receive a new confirmation are not retained in that form.

## Review of F1 to F25

### F1

- Title: UI verification and the standing DoD order `git add -N`.
- Verdict: confirmed
- Severity: Critical
- Reason: `flows/ui-change-verify.md:12` and `dod/qdrant-cloud-ui.md:3` explicitly require intent-to-add, while `memory/premises/cloud-ui-lint-fix-branch.md:3` forbids that workaround and `memory/premises/no-commit-push-unasked.md:14` includes it in staging. The contradiction is direct; no staging command was executed to establish it.
- Fix: agree. Remove the staging step in both places and explicitly check each new untracked file by path, using the lint and format commands named by the active premise.

### F2

- Title: The split copy command changes the index and mishandles deletions.
- Verdict: confirmed
- Severity: Critical
- Reason: `skills/active/brain-worktrees/SKILL.md:36` prescribes path checkout from a source tree, which updates the index as well as the working tree; its default overlay behavior also fails to reproduce deleted source paths. This conflicts with `memory/premises/no-commit-push-unasked.md:14`; the [Git checkout reference](https://git-scm.com/docs/git-checkout) documents the behavior.
- Fix: Use `git restore --source=<source> --worktree -- <paths>` for the intended working-tree-only copy and validate additions, modifications, deletions, and renames. The [Git restore reference](https://git-scm.com/docs/git-restore) already specifies removal of tracked paths absent from the source, so an unconditional additional `rm` step is unnecessary.

### F3

- Title: Stack completion and its proof depend on commits that require a separate request.
- Verdict: partly
- Severity: High
- Reason: `skills/active/brain-worktrees/SKILL.md:38` already acknowledges that a stacked part needs its parent committed, so the procedure does contain the safety boundary. However, its commit-to-commit proof at line 39 and `flows/split-branch.md:17` do not clearly represent the pending state when the user has approved the split but has not requested those commits.
- Fix: Preserve the explicit commit request and describe the pause before each dependent part; claim stack completion only after the required commits and proof exist. Reject treating generic plan approval as commit authorization, and reject a plain `git diff <source>` as a complete working-tree proof because it omits untracked additions.

### F4

- Title: Skill acceptance wording and the garden handoff disagree.
- Verdict: partly
- Severity: Low
- Reason: `skills/active/brain-accept-skill/SKILL.md:3` and line 12 explicitly authorize acceptance in chat, and neither `AGENTS.md:53` nor `memory/premises/no-commit-push-unasked.md:14` says that slash syntax is the only qualifying request. The actual residual conflict is `skills/active/brain-garden/SKILL.md:22` telling the user to type a slash command despite `AGENTS.md:77` and the documented natural-language entry point.
- Fix: Change the garden handoff to ask the user to read and name the draft to accept. A broader change to commit authorization is not required to resolve the alleged critical failure.

### F5

- Title: Browser review routing does not assign the browser work clearly.
- Verdict: partly
- Severity: Low
- Reason: The delegated reviewer has no browser tools in `agents/brain-reviewer.md:4`, but `docs/use-cases.md:93` also directs the calling session to open the page, so the whole case is not inherently impossible. The unclear part is why its first action invokes a diff-review agent through `templates/agent-skill.md:14` for a browser-only request.
- Fix: Assign the screenshot and console check explicitly to the main session, and invoke the diff reviewer only when a diff review is also requested. This is a routing clarification, not evidence that the main session lacks browser capabilities.

### F6

- Title: Brain care references an absent skill name.
- Verdict: confirmed
- Severity: High
- Reason: `flows/brain-care.md:10` names `/workspace-audit`, while its own skill list at line 5 and `skills/active/brain-workspace-audit/SKILL.md:2` name `brain-workspace-audit`. No matching `workspace-audit` entry exists in the brain's skill and agent catalog.
- Fix: agree. Say to load `brain-workspace-audit`; do not require the user to type a slash command.

### F7

- Title: Workspace audit promises historical drift. The claim of wrong prefixes is false.
- Verdict: partly
- Severity: High
- Reason: `skills/active/brain-workspace-audit/SKILL.md:3` promises drift since a previous scan, but line 14 explicitly says there is no snapshot, and `docs/use-cases.md:166` offers a historical question without a history step. Its lines 16–18 expect `conflict broken`, `conflict version`, and `conflict collision`. `lib/workspace.mjs:183` returns `broken`, `collision`, and `version`, and `bin/brain.mjs:252` prints each line with a `conflict\t` prefix, so the expected prefixes match the output of `brain workspace check`.
- Fix: Describe a present-state audit, and keep the prefixes. If historical detection is required, define its history source rather than claiming the existing scan provides it.

### F8

- Title: The reviewer's copied file-kind mapping omits supported kinds.
- Verdict: partly
- Severity: High
- Reason: `agents/brain-reviewer.md:40` omits `.js`, `docs`, `test`, and `migration` cases present in `lib/flows.mjs:35`, line 41, and line 52; `docs/catalog.md:105` is also narrower than line 180. The claimed universal loss of SQLAlchemy review is overstated because `docs/catalog.md:174` already assigns that skill to `python`, including ordinary Python Alembic files.
- Fix: Use the canonical `kindsOf` result for the actual reviewed path range and align the catalog. `brain next --json --no-pr` is suitable only when its computed changed paths match that range; it is not automatically correct for a stacked or explicitly bounded review.

### F9

- Title: The getting-started guide claims the hook ignores copy directories.
- Verdict: confirmed
- Severity: High
- Reason: `docs/getting-started.md:122` claims that names containing `-copy` are ignored, but `bin/session-premises.mjs:43` resolves the repository and lists its premises without that exclusion. `docs/getting-started.md:38` correctly describes origin-based rule selection, while the separate copy filter in `lib/workspace.mjs:41` is neither a session-hook guard nor a name-substring rule.
- Fix: agree. Replace the false hook-protection claim with origin-based behavior and keep the separate prohibition on learning code patterns from copies clear.

### F10

- Title: Helper skill references use ambiguous names and an unanchored path.
- Verdict: confirmed
- Severity: High
- Reason: `docs/use-cases.md:144` and line 150 name unprefixed helpers and relative `.agents/skills/` paths while the documented user works in another code repository. `lib/skills.mjs:84` installs vendored copies under `brain-tp-` names, and `docs/catalog.md:184` repeats the ambiguous helper names.
- Fix: agree. Name `brain-tp-find-skills` and `brain-tp-skill-creator`, or anchor source paths with `brain root`; preserve the distinction between installed names and vendored source names.

### F11

- Title: The PR review worktree assumes the head branch exists on origin.
- Verdict: confirmed
- Severity: High
- Reason: `flows/review-branch.md:10` constructs the review worktree from `origin/<branch>`, which does not identify a fork PR head, and the related branch command in `agents/brain-reviewer.md:39` makes the same assumption. [GitHub's PR checkout instructions](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/checking-out-pull-requests-locally) document fetching the PR head by number from the base repository.
- Fix: Fetch the PR head into a dedicated local review ref, or fetch it and create a detached worktree from `FETCH_HEAD`; pass the resolved base and head commits to every lens. Do not switch the user's checkout, and do not perform a real PR checkout merely to validate this document claim.

### F12

- Title: The merged label is broader than actual merge completion, and squash cleanup has no supported branch-deletion path.
- Verdict: partly
- Severity: High
- Reason: `lib/worktrees.mjs:116` labels any clean branch with zero commits ahead as `merged`, including a branch with no work yet; `skills/active/brain-worktrees/SKILL.md:20` then calls it safe to remove, although cleanup still requires approval at line 55. Its line 55 uses ancestry-based `git branch -d` and line 59 forbids force deletion, so a branch whose changes were squash-merged can leave that cleanup sequence incomplete, rather than being impossible to remove forever.
- Fix: Distinguish clean/no-ahead status from demonstrated merge completion. Preserve approval, verify PR/content state before proposing cleanup, and report a blocked branch deletion unless the user explicitly requests a narrowly scoped exception; do not turn automatic force deletion into the default. See the [Git branch deletion reference](https://git-scm.com/docs/git-branch).

### F13

- Title: Harvest treats an encoded Claude project key as a repository path.
- Verdict: confirmed
- Severity: High
- Reason: `skills/active/brain-harvest/SKILL.md:14` equates the project directory name with the repository path, but the existing project directory for this checkout is encoded with hyphens. Passing that key to `brain scope` produces an encoded repository name rather than `agent-brain`; a hyphen cannot uniquely distinguish a path separator from a literal hyphen in the original name.
- Fix: Resolve the original working directory from authoritative project/session metadata, reading only the needed metadata, then verify the path and origin. Do not replace every hyphen with a slash or accept the first existing decoding without checking identity.

### F14

- Title: The Obsidian registration prerequisite can be read as automatic installer support.
- Verdict: partly
- Severity: Low
- Reason: `docs/catalog.md:261` and the dated setup record at `docs/setup-history.md:66` say registration waits for two files, but do not explicitly promise that the installer consumes them. `mcp/snippets/obsidian.md:17`, `docs/integrations.md:56`, and the installer resolve the actual behavior: configure the optional client connection separately.
- Fix: Clarify the catalog sentence by linking the manual configuration procedure. Keep the dated setup record historical; do not treat its old pending state as a present installer requirement or add an Obsidian installation feature to fix the wording.

### F15

- Title: The copy-directory rule has an implicit reference and an unclear object of learning.
- Verdict: partly
- Severity: Low
- Reason: `AGENTS.md:80` says "that workspace file" after line 79 names the qdrant scope-root `AGENTS.md`, so the intended reference is inferable rather than wholly absent. `skills/active/brain-harvest/SKILL.md:17` explicitly distinguishes user corrections in copies from code patterns, and `agents/brain-reviewer.md:38` reinforces that distinction.
- Fix: Name the qdrant scope-root instruction file directly and say that code in those copies is not a pattern source. Do not broaden the ban to the user's corrections or assume that the workspace scanner's copy heuristic is automatically the same list the user intended.

### F16

- Title: Generic flow dispatch and flow-body dispatch can invoke the reviewer repeatedly.
- Verdict: confirmed
- Severity: High
- Reason: `flows/review-branch.md:4` and `flows/self-review.md:6` list the reviewer wrapper as a skill as well as naming the agent, while `skills/active/brain-next/SKILL.md:23` loads skills, line 24 runs agents, and line 27 then follows bodies that dispatch reviews again. `templates/agent-skill.md:14` makes loading the wrapper executable, so these instructions expose duplicate dispatch paths; a duplicate session note was not observed in a runtime experiment.
- Fix: Define one dispatch owner: use flow metadata to declare requirements and let the body invoke each review once with its intended lens or worktree. Merely deleting the wrapper from `skills` leaves the generic `agents` dispatch plus the body's dispatch, so the original proposed fix is incomplete.

### F17

- Title: Descriptions of the repository check omit current steps.
- Verdict: confirmed
- Severity: Low
- Reason: `CONTRIBUTING.md:13` and `docs/catalog.md:246` enumerate subsets of the command sequence in `package.json:13`. The discrepancy is documentation drift; it does not mean omitted checks fail to run when `npm run check` is invoked.
- Fix: Refer to the package script as the authoritative sequence and keep prose focused on how to invoke it and interpret failure. Moving a complete copied list into one other document still leaves code and prose to synchronize.

### F18

- Title: Promotion and noise thresholds are repeated in procedural documentation.
- Verdict: partly
- Severity: Low
- Reason: `skills/active/brain-learn/SKILL.md:24`, `skills/active/brain-harvest/SKILL.md:26`, and `docs/catalog.md:206` and line 215 repeat values owned by `lib/stats.mjs:14`, but the inspected values currently agree. This is a drift risk rather than a reproduced threshold mismatch, and harvest assesses proposed rows before they exist in the store.
- Fix: Have learn use the existing stats readiness result and make the canonical stats rules the authority for batch assessment. Do not replace harvest's assessment with a requirement to run stats on unimported rows, or add those rows before the approval at `brain-harvest:29`.

### F19

- Title: The README's short requirements omit package installation and PATH details.
- Verdict: partly
- Severity: Low
- Reason: `README.md:16` is shorter than the prerequisite table in `docs/getting-started.md:22` and line 24, and `scripts/install.sh:79` needs pnpm or npm. However, `scripts/install.sh:89` already detects the PATH omission and prints an export instruction, so the claimed unexplained failure is overstated.
- Fix: Link the complete setup requirements or briefly mention the package manager and post-install PATH requirement. Do not claim that the installer provides no diagnosis for a missing command path.

### F20

- Title: Start-ticket hardcodes a host-specific Atlassian server name.
- Verdict: partly
- Severity: Low
- Reason: `flows/start-ticket.md:7` requires `claude_ai_Atlassian`, and `skills/active/brain-next/SKILL.md:25` stops the step when the named server is not connected. This creates a portability gap for a host with an equivalent Jira connection under another name, but does not prove that the name can exist only in Claude Code or that every other host fails.
- Fix: Express the Jira capability the step needs and resolve it against the current host's connected tools; document the Claude server name as an example. Do not assert that a usable connected equivalent is absent solely from its prefix.

### F21

- Title: The catalog overstates which installed parts have a prefix.
- Verdict: confirmed
- Severity: Low
- Reason: `docs/catalog.md:30` says every installed part has a prefix, while the server table at line 257 and `scripts/install.sh:159` use `chrome-devtools`. This is an inaccurate generalization, not a registration failure.
- Fix: agree. Restrict the statement to prefixed skills, agents, and the premise server, or state the exception.

### F22

- Title: Always or never allegedly requires another confirmation before learning.
- Verdict: false
- Severity: Excluded
- Reason: `skills/active/brain-learn/SKILL.md:3` and line 22 intentionally treat an explicit imperative such as "never use that here" as a rule request, consistent with the explicit-versus-implicit distinction in `memory/premises/memory-only-what-repeats.md:3`. No keyword parser or example of merely mentioning the word being stored automatically was demonstrated, so the proposed mandatory confirmation changes policy rather than repairs a proven defect.
- Fix: Reject the proposed blanket confirmation. Interpret intent and scope, use `once` when the instruction is limited to one change, and ask only when the persistence or scope is actually unclear.

### F23

- Title: The current-work case does not explicitly route into the multi-worktree self-review flow.
- Verdict: partly
- Severity: Low
- Reason: `docs/use-cases.md:79` invokes the reviewer wrapper, while line 81 describes the question asked by `self-review`; the actual question exists in `flows/self-review.md:12`. Thus the missing routing explanation is real, but the statement that the workflow never asks the question is false when self-review is selected, and a narrowly requested current diff does not inherently require reviewing other worktrees.
- Fix: Make the conditional route explicit when the user requests the self-review flow, or clearly label the paragraph as a separate flow's behavior. Preserve a simple current-diff review when that is the requested scope.

### F24

- Title: Existing candidates retain decision sources, and the example uses an existing ID.
- Verdict: partly
- Severity: Low
- Reason: The sources on `memory/premises/new-rpc-in-cluster-service-go.md:10` and `memory/premises/verify-against-origin-main.md:9` are explained by the demotion history in `memory/decisions/2026-10-24-memory-tiers.md:14`; `skills/active/brain-learn/SKILL.md:19` should therefore distinguish creating a new decision from retaining provenance. A blind replay of its example ID can collide, but step 4 at line 34 already requires reuse detection, so the example alone does not establish an unguarded live add.
- Fix: Clarify that candidates need no new decision note and may retain historical sources. Do not clear evidence merely to satisfy the table; consolidate the example's reuse/promotion symptom under F28 rather than counting it twice or just choosing another eventually colliding sample ID.

### F25

- Title: The built receipt spec retains prospective wording from before implementation.
- Verdict: partly
- Severity: Low
- Reason: `docs/superpowers/specs/2026-10-23-install-receipt-design.md:37` retains "do not write the receipt yet", while line 4 and the summary at line 7 explicitly say it was built and describe what the installer writes. The tense is stale, but the built status is not unknowable and the spec's historical context matters.
- Fix: If editing the spec, label the intent paragraph as pre-implementation context or change its tense. Treat this as editorial clarity, not a contradiction requiring changes to the receipt implementation.

## Additional findings F26 to F31

### F26

- Title: An active premise with empty text passes shared validation.
- Verdict: confirmed
- Severity: High
- Reason: `lib/premise.mjs:198` never requires nonempty text, although `templates/premise.md:18` requires an actionable sentence; adding `text: ""` with a valid explicit ID is accepted and `scan` returns zero problems. The current notes are not empty, and the invalid generated slug that can reject an ID-less add does not protect hand-edited existing notes.
- Fix: Reject absent, empty, and whitespace-only text in shared validation, and cover both creation and a hand-edited note. This does not require automatic natural-language sentence counting.
- Comparison: New relative to A; B F1. A's successful check of the current notes does not refute the invalid-input reproduction.

### F27

- Title: Harvest's repeat detection omits existing candidates.
- Verdict: confirmed
- Severity: High
- Reason: `skills/active/brain-harvest/SKILL.md:21` loads only the default active status, while its add paths at lines 30 and 32 do not explain candidate reuse; `lib/premise.mjs:47` and `lib/mcp.mjs:229` preserve the status filter even with an empty repo. A repeated add with the same candidate ID returns `EEXIST`, and a new ID would fragment observations; the optional model hint occurs after the add.
- Fix: Load both statuses, match rule and scope/coverage, reuse the existing candidate, and record only new observations after the required approval. Do not convert a rediscovered candidate into a new premise.
- Comparison: New relative to A; B F2. A's checked-and-sound empty-repo statement is correct only about repository coverage within the requested status, not about candidate completeness.

### F28

- Title: Learn does not state the explicit-request transition for an existing candidate.
- Verdict: confirmed
- Severity: Low
- Reason: `skills/active/brain-learn/SKILL.md:34` requires reuse, but line 39 does not directly state what to do when an explicit lasting instruction matches a candidate that has not reached the repetition threshold, and the example at line 52 says to add it. The promotion commands make the intended action possible; this is a confirmed instruction gap, not an observed autonomous-agent failure.
- Fix: State the existing-candidate branch: write the decision, update that ID's source, and promote it without requiring more repetitions. Keep an already active match active instead of duplicating it.
- Comparison: B F3 partially overlaps A F24's example-ID symptom. It adds a distinct missing state transition; the shared duplicate-add symptom is counted here once.

### F29

- Title: The RPC learning example omits cluster-api from its repository coverage.
- Verdict: confirmed
- Severity: High
- Reason: `skills/active/brain-learn/SKILL.md:48` and `templates/premise.md:6` restrict the example to cluster-service, even though its correction originates in cluster-api; recording an observation there does not change `repos`. Promoting that fixture returns one rule for cluster-service and zero for cluster-api, while the actual current RPC premise already covers both.
- Fix: Include both affected repositories in the example and template, and keep observation origin separate from rule coverage.
- Comparison: New cause relative to A F24; B F4. Sharing the example does not make a repository-filter defect the same as an ID or provenance issue.

### F30

- Title: Garden requires a new pattern note outside its permitted output directory.
- Verdict: confirmed
- Severity: High
- Reason: `skills/active/brain-garden/SKILL.md:21` requires creating `memory/patterns/<name>.md`, but line 28 permits new files only under `skills/drafts/`; `docs/use-cases.md:132` repeats the restriction. The existing-decision update at line 20 is not itself a literal violation of the new-file limit, so the contradiction is specifically the new pattern note.
- Fix: Restrict new skill files to drafts while explicitly allowing the workflow's required pattern note and existing-decision status updates. Align the use-case summary with that write scope.
- Comparison: New relative to A; B F5. A F4's garden slash-command handoff is a separate wording issue.

### F31

- Title: The published repair path cannot replace malformed observations.
- Verdict: confirmed
- Severity: High
- Reason: `docs/catalog.md:213` says to repair skipped invalid files with `brain premise update`, but `lib/premise-cli.mjs:109` and `lib/mcp.mjs:105` expose no replacement `seen` field, while the shared validator at `lib/premise.mjs:207` rejects an existing invalid date on every update. Appending another observation retains the bad one; the internal store can replace the list, but that is not the published agent interface.
- Fix: Define a supported, narrowly scoped observation-repair path and document its handling of evidence and metadata. Archive-and-recreate is possible but is not the promised update operation and must not silently discard provenance.
- Comparison: New relative to A; B F6. Neither structural validity of the current notes nor preservation of their Markdown body solves this recovery case.

## Unified correction order

| Order | Findings | Retained work |
| --- | --- | --- |
| 1 | F1, F2 | Remove staging instructions that conflict with active premises; preserve working-tree-only changes. |
| 2 | F3, F11, F12, F16 | Make stack completion, PR-head resolution, cleanup limits, and review dispatch explicit. |
| 3 | F26, F27, F28, F29, F30, F31 | Close validation, candidate reuse/activation, example coverage, output-scope, and repair gaps. |
| 4 | F6, F7, F8, F9, F10, F13 | Correct skill routing, scan claims, canonical file kinds, copy behavior, and project-path resolution. |
| 5 | F4, F5, F14, F15, F17, F18, F19, F20, F21, F23, F24, F25 | Clarify the narrower documented behavior and reduce stale or ambiguous summaries. |
| Excluded | F22 | Preserve the current explicit-instruction policy; no blanket confirmation change is justified. |

This is a review queue, not approval to modify active skills, premises, team repositories, or git history. A later implementation should keep each correction tied to its supported claim and verify the revised behavior.

## Evidence and verification

The repository stayed at the reviewed commit while source claims were checked. No real PR checkout, index-changing copy, branch removal, or live premise mutation was used to test the allegations. Git index and deletion semantics were checked against the official references cited in F2 and F12; fork-head retrieval was checked against GitHub's documentation in F11.

Read-only implementation checks produced the following results:

```text
kinds: ["docs","migration","python","test","ui"]
workspace prefixes:
broken    fixture/repo/.agents/skills/missing    no readable SKILL.md
collision fixture/repo/.agents/skills/brain-learn    same name as brain skill brain-learn
version   fixture/repo/.agents/skills/shared    local differs from brain .agents/skills/shared brain
```

The kind fixture included a JavaScript page, a Python test, an Alembic migration, an SQL migration, and Markdown. The workspace fixture called the exported conflict formatter directly; it did not scan or modify a team repository. The CLI adds a `conflict\t` prefix to each of those lines at `bin/brain.mjs:252`, which the fixture skipped. The worktree list also showed a clean, zero-ahead worktree at the reviewed commit labelled `merged`, which confirms that the label alone is not evidence of a completed PR.

An existing encoded Claude project directory was checked by name only. `brain scope --cwd=-Users-josep-projects-github-agent-brain` returned the encoded repository name in the personal scope, rather than `agent-brain`; no session contents or credentials were read for that check.

The standalone report B contains a combined reproduction script for F26, F27, F29, and F31. Re-running that script produces these results in isolated temporary stores:

```text
F1 empty text accepted: true
F1 scan problems: 0
F2 default list contains candidate: false
F2 reimport same candidate: EEXIST
F6 update with malformed seen: seen entries must be YYYY-MM-DD REPO correction|defect, with a real date
F4 promoted example, cluster-service rules: 1
F4 promoted example, cluster-api rules: 0
```

Those labels retain B's numbering; use the comparison table to map them to this report. The complete harvest, learn, browser, and flow-dispatch sequences were not executed by an autonomous agent, so their reported effects are derived from instructions and the inspected interfaces. The open OpenCode cache notes in A remain outside this 31-finding consolidation; neither report's DoD-body observation establishes an additional retained finding.

Completion checks for this document are the approved two-criterion task DoD: account for all 31 findings with evidence and fix assessment, and pass `npm run check`, followed by `brain dod lint --done`. Check output and final task evidence are reported by the delivering session rather than asserted here before execution.

## Applied premise snapshot

The CLI loaded the current rules for `agent-brain` and `personal`; no connected premise MCP tool was available in this session. The following 16 active rules governed the review. These quotations are a dated evidence snapshot, not another authoritative rule store.

- **never — abstraction-needs-two-uses:** "Add an interface, design pattern, extension point, config option, boolean flag, or forwarding wrapper with fewer than two real variants in the code now, where a test fake counts only if it replaces a network service, the clock, or another dependency that a test cannot run for real."
- **always — brain-memory-is-shared:** "Save a lasting rule or correction as a brain premise, not only in the memory of one tool, so every tool applies it."
- **always — comments-only-what-code-cannot-say:** "Make the code explain itself with names, small functions, named constants, and types, and write a comment only for what the code cannot say: the reason, a constraint, a workaround, a non-obvious invariant, the contract of a public API, or a link to an issue, a spec, or an ADR."
- **always — docs-summary-first:** "Write each documentation file summary first: the title, a short summary of the main point and of what the reader must know or do, a table of contents when the file has four or more ## sections (in an agent file such as SKILL.md or AGENTS.md, only when it is longer than 100 lines), and then the sections from most to least important, with background and detail last."
- **always — dod-before-done:** "Before a task changes files in a git repo, agree its Definition of Done with the brain-dod skill, and call the task done only when brain dod lint --done prints ok."
- **always — memory-only-what-repeats:** "Store a rule only when it is important: an explicit ask becomes a premise, any other correction becomes a candidate that waits for a repeat, and ephemeral facts such as branch state, ticket details, review findings, and what git or the code records go into no memory."
- **never — no-co-author-no-footer:** "Add a Co-Authored-By trailer, or a tool footer such as Generated with Claude Code, to a commit or a PR."
- **never — no-commit-push-unasked:** "Run git add, git commit, or git push without an explicit request in that turn."
- **never — no-hard-wrapped-markdown:** "Hard-wrap Markdown prose."
- **never — no-pr-comment-unasked:** "Post a comment or a reply on a PR without an explicit request in that turn."
- **never — no-schema-or-deploy-unasked:** "Change a database schema or deploy to production without an explicit request in that turn."
- **never — no-silent-fallback:** "Return an undocumented default, or swallow an error without a log, for missing required config, invalid input, or a failed call."
- **always — one-place-per-rule:** "Keep each rule, constant, format, and schema in one place: merge two copies as soon as one change of the rule must edit both, and keep code that only looks alike apart until a third copy shows one shared rule."
- **always — read-and-reuse-first:** "Before you write code, read the code the change touches, its callers, and its tests, and search the repo for a helper, type, constant, or pattern that does the same job under the same rule; use it instead of writing a second version."
- **always — shell-rm-cp-no-prompt:** "Write command rm -f and command cp -f, because rm and cp are interactive aliases in the user shell and a prompt hangs an agent."
- **always — stay-in-request-scope:** "Keep a change inside the request, and mention unrelated dead code or stale text instead of changing it."

The qdrant-cloud-ui rule set was also loaded to check the intended scope of the UI workflow. It includes the 16 global rules above and these four scoped rules; these are comparison references, not personal-repository rules.

- **always — cloud-ui-lint-fix-branch:** "Lint and format changed files in qdrant-cloud-ui with pnpm fix:branch, and a new untracked file by its path with pnpm run lint --fix <file> and pnpm run format <file>, never with a repo-wide run or git add -N."
- **never — cloud-ui-no-prettier-no-dir-format:** "Run prettier, or run oxfmt --write on a directory, in qdrant-cloud-ui."
- **never — engine-repo-read-only:** "Edit a file in the engine repo qdrant/ of the qdrant scope root."
- **always — proto-is-api-source:** "Start an API change in the proto of qdrant-cloud-public-api, and make the services and the UI follow it."
