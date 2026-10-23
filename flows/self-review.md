---
name: self-review
description: Review your own branch in a fresh context before you open the PR.
branch: feature
pr: none
skills: [brain-reviewer, brain-tp-requesting-code-review, brain-worktrees]
agents: [brain-reviewer]
mcp: [brain-premises]
model: opus
---

1. Run `brain worktree list`. When it shows more than one `active` worktree, ask which to review: only the current one, all of them, or the ones the user names. Default to the current one.
2. For each chosen worktree, collect the context as `brain-tp-requesting-code-review` describes: a one-line description, the ticket or plan, the base commit, and `HEAD`. The base is the merge base with the parent that `brain worktree list` prints, so a stacked part is reviewed against the part before it.
3. Run the `brain-reviewer` agent once per worktree, in parallel when the tool allows it. Pass the model of this flow. Give it the context only, not this session history.
4. Show the findings, the smells, and the premises applied, one section per worktree.
5. Change no code unless the user asks. When the user names findings to fix, apply only those, with `brain-tp-code-simplification` for a smell, and run the checks of the repo.
6. For each finding the user rejects, run `/brain-learn`, and add the premise id to `rejected` in the session note.

Done when a session note per worktree exists in `memory/sessions/` and each finding has an answer from the user. Next flow: `prepare-pr`.
