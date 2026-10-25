---
id: cloud-ui-no-prettier-no-dir-format
text: "Run prettier, or run oxfmt --write on a directory, in qdrant-cloud-ui."
strength: never
scope: qdrant
repos:
  - qdrant-cloud-ui
status: active
source: memory/decisions/2026-10-23-harvest.md
---

Why: The repo formats with oxfmt. Prettier gives a different result, and a directory run rewrites files that the branch does not touch.

Format only the changed files with oxfmt, as the premise `cloud-ui-lint-fix-branch` describes.
