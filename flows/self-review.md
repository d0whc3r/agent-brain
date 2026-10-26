---
name: self-review
description: Review your own branch in a fresh context before you open the PR.
branch: feature
pr: none
skills: [brain-tp-requesting-code-review, brain-worktrees, brain-dod]
agents: [brain-reviewer]
mcp: [brain-premises]
model: opus
---

1. Run `brain worktree list`. When it shows more than one `active` worktree, ask which to review: only the current one, all of them, or the ones the user names. Default to the current one.
2. For each chosen worktree, collect the context as `brain-tp-requesting-code-review` describes: a one-line description, the ticket or plan, the base commit, `HEAD`, and the worktree path. The base is the merge base with the parent that `brain worktree list` prints, so a stacked part is reviewed against the part before it. When the worktree has no DoD, define one with `brain-dod` first. Then run `brain dod run` in the worktree, so the evidence comes from this session. When it says that the checks changed files, show those files to the user, and run it again.
3. Run the `brain-reviewer` agent once per worktree, in parallel when the tool allows it. Pass the model of this flow. Give it the context only, not this session history.
4. Show the findings with their severity, the smells, the Definition of Done result, the verdict, and the premises applied, one section per worktree.
5. Change no code unless the user asks. When the user names findings to fix, apply only those. For a smell or a structural blocker, follow `brain-tp-code-simplification`: one simplification at a time, the tests after each one, and a revert when a test fails. Keep a refactor in its own commit, apart from the feature change. Run the checks of the repo at the end.
6. For each finding the user rejects, run `/brain-learn`, and add the premise id to `rejected` in the session note.
7. For each finding the user accepts that names a defect class, and not a one-off slip, find a premise or a candidate that states it with `brain premise search`. Record the repeat with `brain premise seen <id> --repo <repo> --origin defect`. When none exists, add a candidate with `--status candidate` first. Store nothing for a one-off finding.

Done when a session note per worktree exists in `memory/sessions/` of the brain home, each finding has an answer from the user, and the review shows the result of `brain dod lint --done`. Next flow: `prepare-pr`.
