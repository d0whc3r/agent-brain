---
name: review-brain
description: "Review the current diff in any repo against the user's active brain premises for the scope of that repo (qdrant, personal, or global), and report verified findings without editing code. Use when the user asks for a brain review, asks to review a diff, a branch, or a PR, or says revisa este diff. Call premise_list first."
metadata:
  opencode/slash: "true"
---

# Review brain

This review checks a diff against the rules the user already stated. Premises hold those rules, so a review that skips them repeats old mistakes.

The user asks in chat. Phrases such as "review this diff" or "revisa este diff" are enough. You run the steps. Do not ask the user to type `/review-brain`.

## Steps

1. Run `brain scope` in the repo. It prints the scope, the repo name, and the origin owner. A copy or a worktree uses the repo it was cloned from. A `-` scope means the repo is in no scope, so only global premises apply.
2. Call `premise_list` with that repo and that scope (an empty string for `-`). The session context can already list the premises. Call the tool anyway, because the files can change during a session.
3. In the `qdrant` scope, read `/Users/josep/projects/qdrant/AGENTS.md` for the repo map. Code in a copy directory is not a source of patterns.
4. Get the diff. Use `gh pr diff N` for a PR number. Otherwise use `git diff` for local changes and `git diff <default-branch>...HEAD` for the branch. For a branch of another author, use `git diff origin/<default-branch>...origin/<branch>`, or read the worktree the flow made for it.
5. Pick the kinds from the changed files: `.go` is `go`, `.proto` is `proto`, `.py` is `python`, and `.ts`, `.tsx`, or `.jsx` is `ui`. Every review also uses `review`. Skills of kind `workflow` belong to flows, not to reviews, so skip them here. When the caller names a lens, load only the skills of that lens (see below).
6. Read `skills/third-party.json`. For each skill whose kinds match, read `/Users/josep/projects/qdrant-review-brain/.agents/skills/<name>/SKILL.md`. Do not install a skill in this turn.
7. Review the diff. Apply every active `always` and `never` premise. A `prefer` premise is a note. It becomes a failure only after the user marks it `always`.
8. Verify each draft finding (see below). Drop each finding that fails.
9. Write the session note (see below).

## Lenses

A flow can split one review across agents, one lens each. A lens limits the findings to its focus and names the skills to read. With no lens, the review covers all four. Every lens quotes the premises it applied.

| Lens | Focus | Skills |
|---|---|---|
| `premises` | Every active premise, correctness, and design | `code-review-and-quality` and the skills of the changed kinds |
| `security` | Auth, input validation, secrets, external calls, and what else the change can break | `security-and-hardening`, `differential-review` |
| `tests` | Changed code that no test covers, weak assertions, and swallowed errors | `test-driven-development` and the test skills of the changed kinds |
| `simplify` | The smell baseline and duplication | `code-simplification` |

`differential-review` is a `workflow` skill. Read it from `.agents/skills/` only in the `security` lens. Use its blast radius and git history steps. Skip its report file: the output format below wins.

## Verify

A false finding costs the user more time than a missed nit. Before you report a finding, try to prove it wrong:

1. Read the cited lines again, and read the callers and the tests around them.
2. Check that the input that triggers the problem can reach that code. A guard elsewhere, a type, or a proto validation rule can block it.
3. Check that the problem is new in this diff, or that the diff makes it reachable. Mark a problem that is older than the diff as `pre-existing`.
4. When the finding says a test is missing or weak, name the change to the code that the test does not catch.
5. When the finding depends on how a library or framework behaves, check it against the official docs, as `source-driven-development` describes. Cite the page.

Keep a finding only when it survives all four checks. Report the number of findings you dropped.

## Smell baseline

Check the diff for these smells even when the repo documents no standard. Each one is a heuristic, so report it as "possible <smell>" in the simplify section, never as a finding. A documented repo standard or a premise wins over a smell, and so does anything a linter already enforces. Use `code-simplification` for the fix.

- Mysterious name: the name does not say what the thing does or holds.
- Duplicated code: the same logic shape appears in more than one place in the diff.
- Feature envy: a function reads another object's data more than its own.
- Data clumps: the same few fields or parameters travel together.
- Primitive obsession: a string or number stands in for a domain concept.
- Repeated switches: the same switch or if-chain on one type recurs.
- Shotgun surgery: one logical change forces edits across many files.
- Divergent change: one module changes for several unrelated reasons.
- Speculative generality: an abstraction or parameter serves no current need.
- Message chains: a caller walks a long `a.b().c()` chain.
- Middle man: a function or class only delegates.
- Refused bequest: an implementer ignores most of what it inherits.

This list comes from the `code-review` skill in mattpocock/skills (MIT), after Martin Fowler, *Refactoring*, chapter 3.

## Output

Use this structure:

```markdown
## Premises applied
- [always] <text> (<id>)

## Findings
- path/to/file.go:42: <problem>. <fix>.

## Simplify and performance
- path/to/file.go:80: <note tied to a measurement or to concrete duplication>.

## Learn
/learn "<rule>" (only when the user rejects a finding)
```

Quote each premise you applied. Put findings first, with file and line. Tag a finding with the premise id that produced it, as `(premise: <id>)`. Drop a simplify or performance note that has no measurement and no concrete duplication. End the findings with `Dropped after verification: N`.

## Session note

Write `memory/sessions/YYYY-MM-DD-<repo>.md` from `templates/session.md`. Add `-2`, `-3`, and so on when the file exists. Set date, tool, scope, repo, finding_count, applied, rejected, and decision_links. `applied` lists the id of each premise you applied. `rejected` starts empty. The `learn` skill adds an id when the user rejects a finding that the premise produced. Omit file contents, secrets, and customer data.

`brain premise stats` reads these lists. It flags a premise that is never applied, not applied in 90 days, or often rejected.

## Limits

The review writes findings only. After the findings, do not edit the diff. The user decides which findings to fix.

On a branch of the user, the user can then ask to apply findings. Apply only the findings the user names, with `code-simplification` for a smell, and run the checks of the repo after. On a branch of another author, never edit: draft PR comments, and post nothing unless the user asks.
