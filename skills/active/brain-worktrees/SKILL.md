---
name: brain-worktrees
description: "Understand, split, and clean git worktrees. Lists the worktrees of a repo with state, parent branch, and size; plans how to split one branch into several worktrees that each become a human-reviewable pull request, with conflicts, dependencies, and merge order; applies the plan after the user approves it; and removes merged worktrees. Use when the user asks about worktrees, asks to split a branch or a big diff into PRs, asks to divide changes, or asks to clean old worktrees."
metadata:
  opencode/slash: "true"
---

# Worktrees

`<brain>` is the output of `brain root`.

## Understand

Run `brain worktree list --cwd <repo>`. Each row has the branch, the state, the parent, ahead and behind against the base, the count of uncommitted files, and the path. `*` marks the worktree you are in.

| State | Meaning |
| --- | --- |
| `main` | The main branch. |
| `active` | A branch with commits or uncommitted changes. |
| `merged` | No commit beyond the base and a clean tree, so a removal loses no work. A new branch with no commit yet is also `merged`, and it is not proof of a merged PR. |
| `gone` | The remote branch was deleted, usually after a merge. Check the PR before you remove it. |
| `detached` | No branch. |
| `prunable` | The directory is missing. `git worktree prune` removes the record. |

The parent is the branch of another worktree that this branch stacks on. A stacked PR uses its parent as the PR base, and a review compares it against its parent, not against main.

## Split a branch

A split turns one branch into a stack or a set of branches, one worktree each. Each one becomes a pull request, so each one must be easy for a person to review.

1. Run the `brain-split-planner` agent on the branch. Pass the repo path, the branch, and the base. On Codex, follow its file in `<brain>/agents/` in this session.
2. Show the plan. Change nothing before the user approves it. Change the plan when the user asks.
3. Write the approved plan to `<brain>/memory/splits/YYYY-MM-DD-<repo>-<branch>.md`.
4. Apply it, one part at a time, in the merge order of the plan:
   - `git worktree add ../<repo>-<slug> -b <branch> <parent>`. The first part starts from the base. A stacked part starts from the part before it.
   - Copy the files of that part from the source branch into the working tree only: `git restore --source=<source> --worktree -- <paths>`. It also deletes a path that the source deleted, and it leaves the index as it is. For a file that the plan splits by hunk, apply only those hunks: write `git diff <base> <source> -- <path>` to a patch, keep the hunks of this part, then `git apply`.
   - Run the checks of the repo in that worktree. A part that fails its checks goes back to the plan.
5. Commit a part only when the user asks. The approval of the plan is not that request. A stacked part starts from the commit of its parent, so stop before each stacked part until the user asks to commit the parent.
6. Prove that nothing was lost. For independent parts, every path of `git diff --name-only <base> <source>` is in one part. For a stack, `git diff <source> <last part>` is empty after the user commits each part. Until then, report the stack as not complete.
7. Leave the source branch as it is. Do not rewrite or remove it.

### Rules for each part

- One purpose per part: a refactor, a feature, a fix, a migration, or generated code with its source.
- A rename or a move goes in its own part, before the behavior change.
- Tests ship in the same part as the code they test.
- Each part builds and passes the checks on its own. No part depends on a later part.
- Aim for at most 400 changed lines, generated files excluded. Say why when a part is larger.
- A file in two parts is a conflict. The plan names the hunks of each part, or it moves the file to one part.

## Clean

1. Run `brain worktree list`.
2. Propose to remove each `merged`, `gone`, and `prunable` row. For `gone`, show the PR state with `gh pr list --head <branch> --state all`.
3. Remove only the rows the user approves: `git worktree remove <path>`, then `git branch -d <branch>`. Use `git worktree prune` for a `prunable` row.
4. `git branch -d` refuses a branch whose PR was squash-merged, because its commits are not in the base. Show the PR state, and keep the branch. Delete it with `git branch -D` only when the user asks for that branch.

## Limits

Never remove a worktree with uncommitted changes. Never force the removal of a branch without an explicit request for that branch. A commit, a push, and a PR wait for an explicit request from the user.
