---
id: cloud-ui-lint-fix-branch
text: "Lint and format with pnpm fix:branch after git add -N on new files, never with the repo-wide lint or format scripts."
strength: always
scope: qdrant
repos:
  - qdrant-cloud-ui
status: active
source: memory/decisions/2026-10-23-harvest.md
---

Why: The repo-wide scripts rewrite files outside the branch and bury the change in noise. fix:branch reads the git diff, so a new file needs git add -N first or it is skipped.
