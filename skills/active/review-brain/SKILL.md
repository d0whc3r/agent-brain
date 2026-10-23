---
name: review-brain
description: "Review the current diff in a Qdrant Cloud repo against the user's active premises and the qdrant-personal-review rules, and report findings without editing code. Use when the user asks for a brain review, asks to review a diff, a branch, or a PR in a qdrant-cloud repo, or says revisa este diff. Call premise_list first."
metadata:
  opencode/slash: "true"
---

# Review brain

This review checks a diff against the rules the user already stated. Premises hold those rules, so a review that skips them repeats old mistakes.

The user asks in chat. Phrases such as "review this diff" or "revisa este diff" are enough. You run the steps. Do not ask the user to type `/review-brain`.

## Steps

1. Load `qdrant-personal-review`.
2. Find the repo name from `git remote get-url origin`, without `.git`. A copy or a worktree uses the name of the repo it was cloned from. Use the repo the user names when there is no origin.
3. Call `premise_list` with that repo. The session context can already list the premises. Call the tool anyway, because the files can change during a session.
4. Get the diff. Use `gh pr diff N` for a PR number. Otherwise use `git diff` for local changes and `git diff <default-branch>...HEAD` for the branch.
5. Pick the flows from the changed files: `.go` is `go`, `.proto` is `proto`, `.py` is `python`, and `.ts`, `.tsx`, or `.jsx` is `ui`. Every review also uses `review`.
6. Read `skills/third-party.json`. For each skill whose flows match, read `/Users/josep/projects/qdrant-review-brain/.agents/skills/<name>/SKILL.md`. Do not install a skill in this turn.
7. Review the diff. Apply every active `always` and `never` premise. A `prefer` premise is a note. It becomes a failure only after the user marks it `always`.
8. Verify each draft finding (see below). Drop each finding that fails.
9. Write the session note (see below).

## Verify

A false finding costs the user more time than a missed nit. Before you report a finding, try to prove it wrong:

1. Read the cited lines again, and read the callers and the tests around them.
2. Check that the input that triggers the problem can reach that code. A guard elsewhere, a type, or a proto validation rule can block it.
3. Check that the problem is new in this diff, or that the diff makes it reachable. Mark a problem that is older than the diff as `pre-existing`.
4. When the finding says a test is missing or weak, name the change to the code that the test does not catch.

Keep a finding only when it survives all four checks. Report the number of findings you dropped.

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

Write `memory/sessions/YYYY-MM-DD-<repo>.md` from `templates/session.md`. Add `-2`, `-3`, and so on when the file exists. Set date, tool, repo, finding_count, applied, rejected, and decision_links. `applied` lists the id of each premise you applied. `rejected` starts empty. The `learn` skill adds an id when the user rejects a finding that the premise produced. Omit file contents, secrets, and customer data.

`brain premise stats` reads these lists. It flags a premise that is never applied, not applied in 90 days, or often rejected.

## Limits

The review writes findings only. After the findings, do not edit the diff. The user decides which findings to fix.
