---
name: split-branch
description: Split a big branch into several worktrees, each a reviewable PR, after a detailed plan.
branch: feature
skills: [brain-worktrees]
agents: [brain-split-planner]
model: opus
---

1. Run `brain worktree list` to show the worktrees that already exist.
2. Run the `brain-split-planner` agent on the branch with the model of this flow.
3. Show the plan: parts, files and hunks, dependencies, conflicts, risks, and merge order. Change it until the user approves it.
4. Apply the approved plan as the Split section of `brain-worktrees` describes, with sonnet for the copy and check steps.
5. Prove that the parts hold every change of the source branch, as the Split section of `brain-worktrees` describes. The proof of a stack needs the commits of its parts.
6. Offer the `self-review` flow on each new worktree.

Done when each part has a worktree whose checks pass, and the proof of step 5 shows no lost change. Commits and PRs wait for the user, so a stack stays not complete until the user asks for its commits.
