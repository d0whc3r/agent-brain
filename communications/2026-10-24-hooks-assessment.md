# Agent hooks for brain flows: assessment for independent AI review

Date: 2026-10-24.

Summary: The original proposal adds three hooks now (H1, H2, and H3), pilots three (H4, H5, and H6), and postpones or rejects the rest. The independent assessment at the end ranks the next decision differently: add only H3 now, set Claude Code `attribution` to `false`, and add `permissions.ask` rules for pull-request comments. Nothing is approved or implemented.

Status: proposal for evaluation. The user asked for an assessment of how lifecycle hooks could support the brain flows, and then for an English record that another AI model can evaluate and challenge. Implementation has not been approved or started. An independent assessment is appended. It does not approve implementation.

Location: `communications/` holds standalone communications. This document is informational and is not registered as a flow, skill, agent, premise, hook, or MCP resource. References to existing flows below describe potential integration points.

Contents:

- [Purpose and evidence labels](#purpose-and-evidence-labels)
- [Existing system](#existing-system)
- [Observed state](#observed-state)
- [Documented hook capabilities](#documented-hook-capabilities)
- [Reported community experience](#reported-community-experience)
- [Proposed use cases](#proposed-use-cases)
- [Proposed design rules](#proposed-design-rules)
- [Decision boundaries](#decision-boundaries)
- [Alternatives and trade-offs](#alternatives-and-trade-offs)
- [Proposed evaluation and adoption sequence](#proposed-evaluation-and-adoption-sequence)
- [Unknowns](#unknowns)
- [Questions for independent assessment](#questions-for-independent-assessment)
- [Applied premise snapshot](#applied-premise-snapshot)
- [Sources](#sources)
- [Independent assessment](#independent-assessment)

## Purpose and evidence labels

Assess where hooks in Claude Code, Codex, and OpenCode could make brain rules and flow steps deterministic, and where they would add cost, noise, or risk.

The original recommendation is to add three hooks now, to pilot three more with measurements, and to postpone the rest. Treat that recommendation as a hypothesis to evaluate, rather than an accepted architecture decision.

| Label | Meaning |
| --- | --- |
| Observed | Read from the local repository, the local tool configuration, or a command output during the assessment on this date. |
| Documented | Reported by the official documentation of Claude Code, Codex, OpenCode, or Gemini CLI, consulted on this date. This does not establish behavior on this machine. |
| Reported | Stated by a third-party blog, guide, security report, or issue tracker. Not verified against official documentation. |
| Proposed | A suggested change or experiment that is not implemented. |
| Unknown | A question that needs measurement, verification, or a user decision. |

## Existing system

The brain is a personal repository shared by Claude Code, Codex, and OpenCode. Premises are rules, skills are workflows, and Engram is the session log. A flow is a Markdown procedure. `brain next` ranks flows from repository state, and the `brain-next` skill runs the chosen flow. The agent follows the flow body. No engine executes the steps.

Observed enforcement points today:

| Mechanism | What it enforces | Deterministic | Local reference |
| --- | --- | --- | --- |
| SessionStart hook in Claude Code | Prints the scope, the active premises, and the three best flows into the session context | Yes, for context only | [session hook](../bin/session-premises.mjs), [installer](../scripts/install.sh) |
| `permissions.ask` rules in Claude Code | Asks before `git commit`, `git push`, `git reset --hard`, `git clean`, and `git branch -D` | Yes, but it matches the command prefix only | [setup-config](../scripts/setup-config.mjs) |
| Brain block in `~/.codex/AGENTS.md` | Tells the Codex model to run `brain scope` and `premise_list` at session start | No: the model must follow it | [setup-config](../scripts/setup-config.mjs) |
| Flow bodies and their "Done when" lines | Steps and completion conditions | No: the model must follow them | [flows](../flows/README.md) |
| `brain dod lint --done` | Completion gate with evidence tied to the current tree | The check is deterministic. Running it depends on the model | [DoD library](../lib/dod.mjs), [prepare-pr](../flows/prepare-pr.md) |
| `brain-reviewer` output contract | The review quotes each active `always` and `never` premise | No: the model must follow it | [reviewer](../agents/brain-reviewer.md), [AGENTS.md](../AGENTS.md) section 4 |

The gap: most rules and flow steps take effect only when the model reads and follows them. Hooks can move selected, narrow checks into the harness.

## Observed state

| Item | Observed result | Interpretation |
| --- | --- | --- |
| Tool versions | `2.1.310 (Claude Code)`, `codex-cli 0.164.0` | Claude Code is newer than v2.1.295, which documents `onFailure: "block"`. |
| Brain SessionStart entry in `~/.claude/settings.json` | Command `node <brain>/bin/session-premises.mjs 2>/dev/null \|\| true`, no matcher, timeout 10 | With no matcher, it fires on `startup`, `resume`, `clear`, `compact`, and `fork`. It reinjects premises after compaction. It fails open on purpose. |
| Hook output in this session | The brain context appeared after `/clear` | The hook ran as configured. |
| Other user-level Claude Code hooks | `PreToolUse`: an rtk script that rewrites Bash input (`updatedInput`) and a `Grep\|Glob` hook. `UserPromptSubmit`: codegraph. `SessionStart`: cbm reminders and herdr state. `Stop`: gstack timeline | A new `PreToolUse` hook on Bash runs next to an existing input rewrite. |
| Plugin hooks in this session | ECC GateGuard blocked the first Bash command and the first file write until the agent stated a list of facts. Caveman, ponytail, Engram, and cbm injected context at session start | Hook friction and context volume are already high. Each new hook competes with these. |
| `~/.codex/hooks.json` | One `SessionStart` hook (herdr state). No brain hook | Codex receives the brain rules only as instructions. |
| Session hook input | `session-premises.mjs` reads `cwd` from the stdin JSON | The same script can read the Codex input, which also carries `cwd` (Documented). |
| DoD location | `.git/brain-dod/<branch>.md`, with evidence tied to `treeFingerprint` | A hook can detect a DoD for the branch, and stale evidence, without network calls. |
| Attribution instruction | The Claude Code session context contained an instruction to end commit messages with a `Co-Authored-By` line and PR descriptions with a "Generated with Claude Code" line | This conflicts with the `never` premise `no-co-author-no-footer`. The same context says user instructions take precedence, but the conflict repeats in every session. |
| Review consent | Step 2 of `review-branch` asks the user before `brain dod run`, because the commands run PR code with the user's credentials | Only the flow text enforces this consent. See [review-branch](../flows/review-branch.md). |

## Documented hook capabilities

### Claude Code

- About 33 events. The relevant ones here are `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `Stop`, `SubagentStop`, `PreCompact`, `PostCompact`, `SessionEnd`, `WorktreeCreate`, and `WorktreeRemove`. [Hooks reference](https://code.claude.com/docs/en/hooks).
- Handler types: `command`, `http`, `mcp_tool`, `prompt` (one model call), and `agent` (experimental verifier with Read, Grep, and Glob). `SessionStart` supports only `command` and `mcp_tool`.
- Exit 2 blocks on events that can block. Other non-zero exits are non-blocking errors, so the action proceeds unless the hook sets `onFailure: "block"` (v2.1.295 and later).
- `PreToolUse` returns `permissionDecision` (`allow`, `deny`, `ask`, `defer`), `permissionDecisionReason`, `updatedInput`, and `additionalContext`. The `if` field filters with permission rule syntax, such as `Bash(git commit:*)`.
- `Stop` returns `decision: "block"` with a `reason`, and the reason becomes the next instruction. Its input carries `stop_hook_active` and `last_assistant_message`. After eight consecutive continuations, Claude Code ends the turn. `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` raises that cap.
- Hooks in skill frontmatter register when the skill is invoked and stay for the rest of the session. `once: true` removes a skill hook after its first successful run.
- Hooks in subagent frontmatter run only while that subagent runs. Claude Code converts a `Stop` hook there to `SubagentStop`. Project subagent hooks run only after the user accepts workspace trust.
- Default timeouts: 600 s for `command`, 30 s for `prompt`, and 60 s for `agent`. `UserPromptSubmit` lowers `command` hooks to 30 s. `SessionEnd` hooks share a budget of 1.5 s by default.
- Security: command hooks run with full user permissions. Interactive sessions hold back hooks until the user accepts workspace trust. `-p` and SDK sessions treat the folder as trusted.

### Codex

- 12 events: `SessionStart`, `SubagentStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SubagentStop`, `Stop`, `Interrupt`, and `SessionEnd`. [Codex hooks](https://learn.chatgpt.com/docs/hooks).
- Configuration in `hooks.json` or inline `[hooks]` tables in `config.toml`, at user level (`~/.codex/`) or repository level (`<repo>/.codex/`). Hooks are enabled by default.
- Only `command` and `mcp_tool` handlers run. Codex parses `prompt` and `agent` handlers and skips them.
- Each non-managed hook needs review and trust in `/hooks`. Trust is tied to the hook hash, so a new or changed hook is skipped until the user trusts it again.
- `PreToolUse` accepts `permissionDecision: "deny"` and `allow` with `updatedInput`. `ask` is unsupported: the hook fails and the tool call continues.
- `PreToolUse` covers Bash, `exec_command`, `apply_patch` (which also matches `Edit` and `Write`), MCP tools, and other local function tools. It does not cover hosted tools such as `WebSearch`. The documentation calls tool hooks "a guardrail, not a complete enforcement boundary".
- `Stop` with `decision: "block"` continues the turn with a new prompt built from `reason`. `Stop` and `UserPromptSubmit` ignore matchers.
- Plain stdout becomes context for `SessionStart`, `SubagentStart`, and `UserPromptSubmit`.

### OpenCode

- Plugins are JavaScript modules loaded from `~/.config/opencode/plugins/`, `.opencode/plugins/`, or npm packages listed in the configuration. [OpenCode plugins](https://opencode.ai/docs/plugins).
- `tool.execute.before` blocks a tool call when it throws an error. Events include `session.idle`, `session.compacted`, and `file.edited`. `experimental.session.compacting` adds context to compaction.
- The page documents no hook that forces a finished turn to continue.

### Gemini CLI

- A similar model: `BeforeTool`, `AfterAgent`, and other events in `settings.json`, exit 2 to block, and `CLAUDE_PROJECT_DIR` as an alias of `GEMINI_PROJECT_DIR`. The brain does not use Gemini CLI today. [Gemini CLI hooks](https://geminicli.com/docs/hooks/reference/).

## Reported community experience

- Instructions in `CLAUDE.md` or `AGENTS.md` are probabilistic. Hooks run in the harness, so the check runs whether or not the model thinks of it. [Agent Patterns](https://agentpatterns.ai/instructions/enforcing-agent-behavior-with-hooks/), [bitbytebit](https://bitbytebit.substack.com/p/agent-hooks-deterministic-guardrails).
- Hooks fail in silence. One audit found that five of seven guardrails enforced nothing, because of an early `set -e` exit and a JSON field-name mismatch. [daily.dev](https://daily.dev/posts/i-audited-my-ai-agent-s-guardrails-most-of-them-weren-t-running--iejklp8mp).
- Stop hooks can loop. Every published example checks `stop_hook_active` first. An open issue reports that the flag can stay `false` across repeated fires when system reminders interleave with stop attempts. [Issue 54360](https://github.com/anthropics/claude-code/issues/54360), [Coding with Roby](https://codingwithroby.substack.com/p/the-stop-hook-that-wont-let-claude).
- `UserPromptSubmit` hooks that suggest skills became reliable for some authors. One early version fired on almost every prompt, and the model learned to ignore it. The fix was word-boundary matching, scoring, a cap of three suggestions, and a calmer tone. [Pilot Shell](https://pilot-shell.com/blog/skill-activation-hook), [Scott Spence](https://scottspence.com/posts/claude-code-skills-dont-auto-activate).
- `PostToolUse` formatters add a latency cost to every tool call. A formatter and a linter in the same hook can undo each other's edits. `PostToolUse` cannot undo a tool call. [bestagent.dev](https://bestagent.dev/claude-code-hooks-2026).
- Check Point reported that project hooks in an untrusted repository ran without consent. Anthropic patched the issue and changed the trust warning. [BankInfoSecurity](https://www.bankinfosecurity.com/malicious-repo-files-could-hijack-claude-code-sessions-a-30854), [The Register](https://www.theregister.com/2026/02/26/clade_code_cves/).

## Proposed use cases

Value and risk express the original qualitative assessment. They are not measurements.

| ID | Hook | Behavior | Rule or flow served | Value | Risk | Portability | Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H1 | `PreToolUse` on `Bash(git commit:*)`, `Bash(gh pr create:*)`, `Bash(gh pr edit:*)` | Deny when the command, or the file of `-F`, contains `Co-Authored-By` or "Generated with" | `no-co-author-no-footer` | High | Low | Claude Code and Codex. OpenCode through `tool.execute.before` | Now |
| H2 | `Stop` in the frontmatter of `agents/brain-reviewer.md`, run as `SubagentStop` | Block when `last_assistant_message` lacks an active `always` or `never` premise id, or lacks the verdict. The reason lists what is missing | `AGENTS.md` section 4: "A review: the output quotes each active `always` and `never` premise for that repo." | High | Low | Claude Code only | Now |
| H3 | `SessionStart` in `~/.codex/hooks.json` | Run the existing `session-premises.mjs` | Same context as Claude Code | High for Codex sessions | Low | Codex | Now |
| H4 | `Stop` | When the branch DoD exists, its evidence does not match `treeFingerprint`, and the last message claims completion, block once with the `brain dod lint --done` problems | `dod-before-done`, the `prepare-pr`, `self-review`, and `ui-change-verify` flows | High | Medium | Claude Code and Codex | Pilot |
| H5 | `PreToolUse` on `Bash(brain dod run:*)` | Return `ask` when the cwd is a `-review-` worktree | Consent step of `review-branch` | Medium | Low | Claude Code. Codex needs `deny`, because it has no `ask` | Pilot |
| H6 | `UserPromptSubmit` | When a regex finds "siempre", "nunca", "a partir de ahora", "no vuelvas a", "always", "never", or "from now on", add one line: this prompt can state a rule, consider `brain-learn` | `memory-only-what-repeats`: an explicit ask becomes a premise | Medium | Medium: false positives | Claude Code and Codex | Pilot |
| H7 | `PostToolUse` on edits | Format or lint after each edit | Lint criteria of the DoD | Low | Medium | All | Postpone |
| H8 | `SessionEnd` or `PreCompact` | Capture a session summary into memory | None | Low | Conflicts with `memory-only-what-repeats` | Partial | Postpone |
| H9 | `PreToolUse` on edits under `memory/premises/` and `skills/active/` | Deny and point to `brain premise` or `brain-accept-skill` | `AGENTS.md` section 8 | Low until the error occurs | Low | All | Postpone |
| H10 | One generic hook | A `guard` field on each premise holds a pattern, and one hook enforces every guard | All guard-like premises | Unknown | Medium: new abstraction | All | Postpone |
| H11 | Git `commit-msg` hook | Reject the trailer for every tool and for humans | `no-co-author-no-footer` | Medium | High: needs a change per repository, or a global `core.hooksPath` that overrides husky or lefthook | All | Reject |

### Tier now

H1 closes the clearest gap. The `permissions.ask` rule asks whether to commit, but it does not read the message. The session context of Claude Code asks for the trailer in every session, so the premise competes with a system instruction at each commit. H1 must deny and must not rewrite: the rtk hook already rewrites Bash input, and two `updatedInput` results on the same call can collide.

H2 turns the review verification rule of `AGENTS.md` into a check. It runs inside the subagent lifetime only, so it adds no cost to other turns. An open decision: which lenses must quote premises. The `premises` lens must. The `security`, `tests`, and `simplify` lenses may not need to.

H3 reuses an existing, tested script. Codex moves from "the model runs `brain scope`" to "the harness supplies the computed premise list". The cost is one installer step, one uninstaller step, and one trust approval in `/hooks`.

### Tier pilot

H4 enforces the most central premise, but `Stop` fires at the end of every turn, including conversation turns. Three conditions narrow it: a DoD file for the branch, stale evidence, and a completion claim in the last message. It blocks once per tree fingerprint and exits when `stop_hook_active` is `true`. In Claude Code, it can live in the frontmatter of the `brain-next` skill, so it registers only after a flow starts. In Codex, it must be global.

An alternative for H4 is a `done:` command field in each flow, with a state file that names the active flow. The `Stop` hook would run the command of that flow. This assessment does not recommend it now. Most flows already end in `brain dod lint --done`, and the standing DoD of each repository holds the other checks, such as `npm run check` in [the brain standing DoD](../dod/qdrant-review-brain.md). The DoD already acts as the completion check of each flow.

H5 moves the consent step of `review-branch` into the harness. A plain `permissions.ask` rule for `brain dod run` would also ask in the user's own branches, so the hook adds a worktree condition.

H6 serves the learning loop, but a regex on "nunca" or "never" matches ordinary speech, such as "never mind". A `prompt` handler would be more precise, but it adds a model call to every prompt and does not run in Codex.

### Tier postpone or reject

H7 repeats what the DoD already runs, such as `pnpm fix:branch` in qdrant-cloud-ui, and adds latency to every edit. H8 stores ephemeral facts, and Engram already logs sessions. H9 has no recorded occurrence yet, so it waits for a candidate. H10 adds an abstraction before three hand-written guards exist. H11 changes team repositories, which `AGENTS.md` forbids.

An OpenCode plugin waits until OpenCode use grows. `tool.execute.before` could serve H1 and H5. No documented OpenCode hook can serve H4.

## Proposed design rules

- One script, such as `bin/brain-hook.mjs <event>`, calls `lib/premise.mjs`, `lib/dod.mjs`, and `lib/flows.mjs`. This follows the existing rule that the CLI and the MCP call one library.
- Context hooks fail open, as the current SessionStart hook does. Guard hooks set `onFailure: "block"` in Claude Code. In Codex, a failed `PreToolUse` hook lets the tool run, so a Codex guard is partial protection.
- Each hook uses a matcher or `if` filter. Each hook makes no network call and stays under one second.
- Guards deny with a reason. They never rewrite input and never return `allow` for a guarded command.
- Each hook has a `node --test` case with JSON fixtures, in the style of [the session hook test](../bin/session-premises.test.mjs).
- The installer adds and removes each hook with a marker, as `setHook` does. Hooks stay in user-level configuration, never in the `.claude/settings.json` of a team repository.

## Decision boundaries

- Hooks check narrow conditions that code can decide: text in a command, a file path, a DoD state, a premise id in an output. They do not choose flows or judge code quality.
- The premise store remains the source of rules. A hook reads it through the library and does not copy rule text into tool configuration.
- A hook can deny, ask, or add context. It does not authorize a commit, a push, a PR comment, or a premise change.
- No proposed hook writes premises, session notes, or other memory.
- User approval of a hook in `/hooks` or in the workspace trust dialog remains a user decision.

## Alternatives and trade-offs

| Option | Benefit | Cost or limit |
| --- | --- | --- |
| Keep instructions only | No new code | The model can skip a rule, as the attribution conflict shows. |
| Use `permissions` rules only | Native, simple, no script | Matches a command prefix. It cannot read a commit message, a path condition, or a DoD state. |
| Add harness hooks | Deterministic at the moment of the action | Adds latency, scripts to test, per-tool differences, and trust steps. |
| Use `prompt` or `agent` hooks | Can judge free text | Adds a model call per event. Codex skips these handlers. |
| Use Git hooks | Covers every tool and humans | Requires changes in team repositories or overrides their hook managers. |
| Rely on CI checks | Covers the merged result | Runs after the push, too late for local rules such as commit messages in a draft branch. |

## Proposed evaluation and adoption sequence

1. Agree a DoD for the implementation task, as `dod-before-done` requires. This communication does not create one.
2. Implement H1 and H3 with fixture tests. Record each H1 deny in a local log.
3. Implement H2. Decide the lens rule first.
4. Run H4 in observation mode: log each time it would block, with no block. Review the log after an agreed number of sessions, then decide on blocking once per fingerprint.
5. Run H6 in observation mode for two weeks. Measure precision against an agreed threshold before it injects text.
6. Measure, for each hook: blocks, false positives, added latency per call, added context tokens, and Stop loops.
7. Reassess H5 and the postponed cases after steps 2 to 6.

Thresholds, the observation period of H4, and the precision target of H6 remain open decisions.

## Unknowns

- The exact `Stop` and `SubagentStop` input fields in Codex, such as `last_assistant_message`, were not verified.
- Whether the Codex trust hash covers the script content or only the configuration entry was not verified. If it covers only the entry, a changed script runs without new trust.
- Node startup time per hook call on this machine was not measured.
- The combined result of the rtk `updatedInput` and a brain `deny` on the same Bash call was not verified.
- Whether existing plugin hooks should be pruned before new hooks are added is a user decision.

## Questions for independent assessment

1. Is the gap between written rules and enforced rules correctly identified, and does each proposed hook close a real, recurring failure?
2. Is H1 better as a hook, as a `permissions` rule, or as a fix of the attribution instruction at its source?
3. Can H2 check the reviewer output reliably from `last_assistant_message`, or does it need a structured output format first?
4. Are the three conditions of H4 enough to prevent false blocks in conversation turns, and is "block once per fingerprint" safe against loops?
5. Should H4 register through the `brain-next` skill frontmatter or globally, given that Codex has no skill-scoped hooks?
6. Is the rejection of a flow `done:` field correct, or do some flows need a completion check that a DoD cannot hold?
7. Is the H6 regex approach worth piloting, or should rule capture stay in the `brain-learn` skill?
8. Does the current volume of plugin hooks change the priority, for example by pruning before adding?
9. Do the design rules (one script, fail open for context, fail closed for guards, no rewrite) hold for all three tools?
10. What evidence would justify adoption, postponement, or rejection of each hook?

A useful response would correct facts, rank the cases, compare each one with a simpler alternative, and state unresolved questions. Implementation remains outside this communication's authorization.

## Applied premise snapshot

The assessment used the active premises that the SessionStart hook printed for repository `qdrant-review-brain`, scope `personal`. These quotations record the constraints of the assessment. Current rules remain in [the premise store](../memory/premises/).

| ID | Strength | Exact rule text |
| --- | --- | --- |
| `brain-memory-is-shared` | always | "Save a lasting rule or correction as a brain premise, not only in the memory of one tool, so every tool applies it." |
| `dod-before-done` | always | "Agree a Definition of Done before work starts, call a task done only when brain dod lint --done passes, and make each review report that result: each criterion names an observable outcome, a check, a concrete pass condition, and fresh evidence." |
| `memory-only-what-repeats` | always | "Store a rule only when it is important: an explicit ask becomes a premise, any other correction becomes a candidate that waits for a repeat, and ephemeral facts such as branch state, ticket details, review findings, and what git or the code records go into no memory." |
| `no-co-author-no-footer` | never | "Add a Co-Authored-By trailer, or a tool footer such as Generated with Claude Code, to a commit or a PR." |
| `no-commit-push-unasked` | never | "Commit or push without an explicit request in that turn." |
| `no-hard-wrapped-markdown` | never | "Hard-wrap Markdown prose. Write one line per paragraph." |
| `no-pr-comment-unasked` | never | "Post a comment or a reply on a PR without an explicit request in that turn." |
| `shell-rm-cp-no-prompt` | always | "Write command rm -f and command cp -f, because rm and cp are interactive aliases in the user shell and a prompt hangs an agent." |
| `stay-in-request-scope` | always | "Keep a change inside the request. Mention unrelated dead code and leave it in place." |

`no-co-author-no-footer` is the basis of H1. `dod-before-done` is the basis of H4 and of step 1 of the sequence. `memory-only-what-repeats` is the basis of H6 and of the rejection of H8.

## Sources

- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Codex hooks](https://learn.chatgpt.com/docs/hooks)
- [OpenCode plugins](https://opencode.ai/docs/plugins)
- [Gemini CLI hooks reference](https://geminicli.com/docs/hooks/reference/)
- [Comparison of hook systems in Gemini CLI, Claude Code, and Codex CLI](https://lilting.ch/en/articles/gemini-cli-hooks-research)
- [Enforcing agent behavior with hooks](https://agentpatterns.ai/instructions/enforcing-agent-behavior-with-hooks/)
- [Don't rely on instructions; use agent hooks](https://bitbytebit.substack.com/p/agent-hooks-deterministic-guardrails)
- [I audited my AI agent's guardrails](https://daily.dev/posts/i-audited-my-ai-agent-s-guardrails-most-of-them-weren-t-running--iejklp8mp)
- [Claude Code issue 54360](https://github.com/anthropics/claude-code/issues/54360)
- [The Stop hook that won't let Claude lie to you](https://codingwithroby.substack.com/p/the-stop-hook-that-wont-let-claude)
- [Pilot Shell: skill activation hook](https://pilot-shell.com/blog/skill-activation-hook)
- [Claude Code skills don't auto-activate](https://scottspence.com/posts/claude-code-skills-dont-auto-activate)
- [Claude Code hooks: the four worth having, and the traps](https://bestagent.dev/claude-code-hooks-2026)
- [Malicious repo files could hijack Claude Code sessions](https://www.bankinfosecurity.com/malicious-repo-files-could-hijack-claude-code-sessions-a-30854)
- [The Register: Claude Code CVEs](https://www.theregister.com/2026/02/26/clade_code_cves/)
- [Claude Code settings reference, attribution](https://code.claude.com/docs/en/settings-reference#attribution)
- [Claude Code settings in cloud sessions](https://code.claude.com/docs/en/settings#settings-in-cloud-sessions)

## Independent assessment

Date: 2026-10-24. A second session reviewed the proposal above in OpenCode, against the official hook pages and this repository. This section does not approve implementation. The original tiers stay as the hypothesis. The verdict below is the ranking for the next decision.

### Verdict

One hook is worth adding now. That hook is H3. Two changes that are not hooks close more of the observed gap than H1 does. Set Claude Code `attribution` to `false`. Add `permissions.ask` rules for pull-request comments. The other hooks wait for a recorded miss, or for an observation log.

### Corrections

These facts come from the official pages and from this repository on this date.

Claude Code lists 33 hook events. `Stop` and `UserPromptSubmit` have no matcher. A handler `if` field runs only on tool events. On any other event, a handler with `if` set never runs. Source: [Hooks reference](https://code.claude.com/docs/en/hooks).

Codex `Stop` and `SubagentStop` include `last_assistant_message` and `stop_hook_active`. The first unknown in the original text is closed. Source: [Codex hooks](https://learn.chatgpt.com/docs/hooks).

Codex records trust against the hook definition hash. The page does not say that the hash covers the script file. A changed script with the same command string can run without a new trust step. Treat the definition hash as documented. Treat a hash of the script bytes as still unknown.

Codex has no `if` filter of the Claude Code kind. An H1 hook there must match `Bash` and exit at once when the command is not a commit or a pull request.

Codex `permissionDecision: "ask"` is parsed and not supported. The hook fails and the tool call continues. A Codex deny is not a stand-in for ask.

OpenCode still has no documented hook that continues a finished turn. `tool.execute.before` blocks when it throws. `experimental.session.compacting` can add context at compaction. The plugin page does not show a session-start context injection. Source: [OpenCode plugins](https://opencode.ai/docs/plugins). This review ran in OpenCode, so "wait until OpenCode use grows" is no longer a reason to ignore that tool. The missing events still block H3 and H4 there.

Claude Code has an `attribution` setting. On version 2.1.281 and later, `attribution: false` hides the commit trailer, the pull-request line, and the session link. The observed Claude Code version in the original text is 2.1.310. The user settings file has no `attribution` key. Source: [settings reference](https://code.claude.com/docs/en/settings-reference#attribution). Observed: `~/.claude/settings.json` on this date.

The same page says Claude Code tells the model that a user attribution rule takes precedence, unless managed settings set the line. The conflict in every session is real. The source fix is a setting, not a hook. `includeGitInstructions: false` also removes the git status snapshot. Do not use that key as the fix.

Three flows require `brain dod lint --done`: `prepare-pr`, `self-review`, and `ui-change-verify`. The other nine flows do not. The sentence "most flows already end in `brain dod lint --done`" is not accurate.

`agents/brain-reviewer.md` already says every lens quotes the premises it applied. The open lens question for H2 is closed by that file.

A skill hook stays for the rest of the session after the skill runs. It does not end when the flow ends. `once: true` does not remove a hook that blocks with exit 2. An H4 hook in `brain-next` frontmatter is not limited to the flow.

User-level hooks do not reach a Claude Code cloud session. Source: [settings in cloud sessions](https://code.claude.com/docs/en/settings#settings-in-cloud-sessions).

`permissions.ask` covers `git commit` and `git push`. It does not cover `gh pr comment`, `gh pr review`, or a comment call through `gh api`. Observed in `~/.claude/settings.json` and in `scripts/setup-config.mjs`.

The premise snapshot is right for this repository. A user-level hook also runs in qdrant-scope repositories. Those repositories have four more active premises: `engine-repo-read-only`, `cloud-ui-lint-fix-branch`, `cloud-ui-no-prettier-no-dir-format`, and `proto-is-api-source`.

### Answers

1. The gap is real. Most rules run only when the model follows them. Only H3, and the attribution setting, close a failure that this assessment observed. H1 closes a symptom whose source is a missing setting. H2, H4, H5, and H6 close contracts without a recorded miss in this text.

2. Fix the attribution setting first. Keep a deny hook only as a backstop, and mainly for Codex and OpenCode, which have no such setting. A `permissions` rule cannot read a commit message. Do not set `includeGitInstructions` to `false`.

3. H2 can look for the premise id format in `last_assistant_message`. Codex documents that field, and it can be null. A null field must fail open. A structured file would be more reliable, and it is not required for a later pilot. Do not build H2 until one review skips the quote block.

4. The three conditions are necessary and not sufficient. A completion claim is free text, so it has the same false-positive class as H6. Block once per fingerprint needs a local state file. Exit when `stop_hook_active` is true. That limits a loop. It does not prove the claim detector is precise. Observe before any block.

5. Do not register H4 only through `brain-next`. That hook would keep firing after the flow ends. Codex has no skill-scoped hooks, so a blocking H4 there is global. Observation mode, with a fast exit when no DoD file exists, is the only form that fits both tools.

6. Reject a flow `done:` field. The original reason is wrong. The right reason is that the machine checks already belong in the DoD, and the other completion lines need a person. Examples: the user answered each finding, the user confirmed the plan, and the user read the drafted replies.

7. Do not pilot the H6 regex. "never" and "nunca" match ordinary speech. Rule capture stays in the `brain-learn` skill. A `prompt` handler would add a model call to every prompt, and Codex skips that handler.

8. The current hook volume should change the order, not forbid every new hook. SessionStart already has six command hooks. A new Stop hook competes with the gstack timeline hook. Add H3, which is one more SessionStart command and fails open. Do not add a global Stop hook until the observation log exists. Pruning plugin hooks is a separate user decision. It is not a prerequisite for H3.

9. The design rules hold for Claude Code guards if `onFailure` is `block` and the script denies without `updatedInput`. They hold only in part for Codex: a failed `PreToolUse` hook lets the tool run, and `ask` does not work. They hold for OpenCode only where `tool.execute.before` can throw. One script can still serve all three. Fail closed is not available on every tool.

10. Adopt H3 when the Codex session shows the same premise list as Claude Code, and the hook fails open on a bad exit. Adopt the attribution setting when one throwaway commit has no trailer and one pull-request body has no footer. Postpone H1 until that probe still shows a trailer written by the model. Postpone H4 until an observation log shows blocks that match real completion claims, with an agreed false-positive cap. Reject H6 if a two-week log is mostly ordinary speech. Reject H11 as the original text does.

### Cases the original text does not list

| ID | Mechanism | Behavior | Rule served | Value | Risk | Portability | Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H12 | User setting `attribution: false` | Hide the commit trailer, the pull-request line, and the session link | `no-co-author-no-footer` | High | Low. Needs Claude Code 2.1.281 or later. This machine is past that | Claude Code | Now. Not a hook |
| H13 | `PreToolUse` on `rm` and `cp` | Deny when the command has no `-f` or `--force`. Do not rewrite | `shell-rm-cp-no-prompt` | Medium | Low | Claude Code and Codex | Pilot |
| H14 | `PreToolUse` on edit and write | Deny a write whose path is the engine directory `qdrant/` under the qdrant scope root. Allow reads | `engine-repo-read-only` | Medium | Low if the path is exact | All three, through the local guard each tool has | Pilot |
| H15 | `permissions.ask` | Ask before `gh pr comment`, `gh pr review`, and a comment call through `gh api` | `no-pr-comment-unasked` | Medium | Low | Claude Code. Codex has no ask | Now. Not a hook |
| H16 | `CwdChanged` | Run `session-premises.mjs` when the git root changes | Session context after `cd` | Low | Medium. The event has no matcher, so every `cd` pays the cost | Claude Code | Postpone |
| H17 | `PreToolUse` on read | Deny a read of the daily Chrome profile. Allow the DevTools profile used for UI checks | `AGENTS.md` section 8 | Medium | Medium until the two paths are written down | All three | Postpone until the paths are named |
| H18 | `PreToolUse` on `git commit` | Deny a commit that would open an editor: no `-m`, no `-F`, and no `--no-edit` | Agent hang. No premise yet | Medium | Low | Claude Code and Codex | Pilot |
| H19 | `experimental.session.compacting` | Add the premise list to the compaction prompt | Same gap as SessionStart after compact | Low | Low | OpenCode | Postpone. Claude Code and Codex already reinject on compact |

`cloud-ui-no-prettier-no-dir-format` can use the same shape as H13, limited to the qdrant-cloud-ui repository. It waits for the same pilot bar. `proto-is-api-source` is not a hook. A hook cannot see that an API change started in the wrong file without judging the diff.

`no-commit-push-unasked` stays on `permissions.ask`. A hook cannot see that the user asked in this turn.

### Revised order

1. Set `attribution` to `false` in the user settings, after the user agrees. Prove it with one throwaway commit. Do not commit that probe in a team repository.
2. Add the comment ask rules to `guardRules`, after the user agrees. That is a config change, not a hook.
3. Add H3. Reuse `session-premises.mjs`. Fail open. One installer step and one Codex trust approval.
4. Leave H1 unbuilt until the probe in step 1 still shows a trailer that the model wrote. If that happens, deny and do not rewrite.
5. Run H4 in observation mode only, and only after H3 is stable. Do not block.
6. Pilot H13 and H14 only after a second occurrence, or when the user asks. H5 stays a Claude-only pilot. Do not deny `brain dod run` on Codex.
7. Do not build H2, H6, H7, H8, H9, H10, H11, H16, H17, or H19 now.

### What this review did not do

This review did not change tool settings, did not add a hook, and did not create a task DoD. Implementation still needs an explicit ask and a DoD, as `dod-before-done` requires.
