---
id: cloud-ui-lint-fix-branch
text: "Lint and format changed files in qdrant-cloud-ui with pnpm fix:branch, and a new untracked file by its path with pnpm run lint --fix <file> and pnpm run format <file>, never with a repo-wide run or git add -N."
strength: always
scope: qdrant
repos:
  - qdrant-cloud-ui
status: active
source: memory/decisions/2026-10-25-premise-review.md
---

Why: The repo-wide scripts rewrite files outside the branch and bury the change in noise.

fix:branch reads the git diff, so it skips a new file that git does not track. Lint and format that file by its path: `pnpm run lint --fix <file>` and `pnpm run format <file>`. Always pass the path, because `pnpm run format` with no path formats the whole repo. Do not run `git add -N` to make fix:branch see the file, because the premise `no-commit-push-unasked` forbids a `git add` without an explicit request.
