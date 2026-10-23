---
name: self-review
description: Review your own branch in a fresh context before you open the PR.
branch: feature
pr: none
skills: [review-brain, requesting-code-review]
agents: [brain-reviewer]
mcp: [brain-premises]
model: opus
---

1. Collect the context as `requesting-code-review` describes: a one-line description, the ticket or plan, the base commit (`git merge-base origin/<default-branch> HEAD`), and `HEAD`.
2. Run the `brain-reviewer` agent with that context. Pass the model of this flow. Give it the context only, not this session history.
3. Show its findings, the smells, and the premises it applied.
4. Change no code unless the user asks. When the user names findings to fix, apply only those, with `code-simplification` for a smell, and run the checks of the repo.
5. For each finding the user rejects, run `/learn`, and add the premise id to `rejected` in the session note.

Done when the session note exists in `memory/sessions/` and each finding has an answer from the user. Next flow: `prepare-pr`.
