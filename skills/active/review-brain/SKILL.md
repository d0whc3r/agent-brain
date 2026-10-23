---
name: review-brain
description: "Review the current diff in a Qdrant Cloud repo against the user's active premises and the qdrant-personal-review rules, and report findings without editing code. Use when the user asks for a brain review, asks to review a diff, a branch, or a PR in a qdrant-cloud repo, or says revisa este diff. Call premise_list first."
metadata:
  opencode/slash: "true"
---

# Review brain

This review checks a diff against the rules the user already stated. Premises hold those rules, so a review that skips them repeats old mistakes.

## Steps

1. Load `qdrant-personal-review`.
2. Find the repo name. Use the directory under `/Users/josep/projects/qdrant/` that holds the current directory, or the repo the user names.
3. Call `premise_list` with that repo. The session context can already list the premises. Call the tool anyway, because the files can change during a session.
4. Get the diff. Use `gh pr diff N` for a PR number. Otherwise use `git diff` for local changes and `git diff <default-branch>...HEAD` for the branch.
5. Pick the flows from the changed files: `.go` is `go`, `.proto` is `proto`, `.py` is `python`, and `.ts`, `.tsx`, or `.jsx` is `ui`. Every review also uses `review`.
6. Read `skills/third-party.json`. For each skill whose flows match, read `/Users/josep/projects/qdrant-review-brain/.agents/skills/<name>/SKILL.md`. Do not install a skill in this turn.
7. Review the diff. Apply every active `always` and `never` premise. A `prefer` premise is a note. It becomes a failure only after the user marks it `always`.
8. Write the session note (see below).

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

Quote each premise you applied. Put findings first, with file and line. Drop a simplify or performance note that has no measurement and no concrete duplication.

## Session note

Write `memory/sessions/YYYY-MM-DD-<repo>.md` from `templates/session.md`. Add `-2`, `-3`, and so on when the file exists. Set date, tool, repo, finding_count, and decision_links. Omit file contents, secrets, and customer data.

## Limits

The review writes findings only. After the findings, do not edit the diff. The user decides which findings to fix.
