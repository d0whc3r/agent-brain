---
name: sync-with-main
description: Bring a feature branch up to date with origin/main and re-check what a rebase can break.
branch: feature
behind: true
model: sonnet
---

1. Run `git fetch origin`. Ask before the rebase.
2. Rebase on `origin/main` and resolve conflicts.
3. Re-run the repo checks.
4. When the branch has a migration, run the `db-migration` checks. When it has proto edits, check that each edit is still there.

Done when the branch is not behind and the checks pass.
