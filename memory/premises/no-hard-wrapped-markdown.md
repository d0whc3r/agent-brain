---
id: no-hard-wrapped-markdown
text: "Hard-wrap Markdown prose. Write one line per paragraph."
strength: never
scope: "*"
repos:
  - "*"
status: active
source: memory/decisions/2026-10-23-harvest.md
---

Why: Hard wraps make diffs noisy, because a one-word change moves every line after it.
