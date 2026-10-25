---
id: no-hard-wrapped-markdown
text: "Hard-wrap Markdown prose."
strength: never
scope: "*"
repos:
  - "*"
status: active
source: memory/decisions/2026-10-23-harvest.md
---

Why: Hard wraps make diffs noisy, because a one-word change moves every line after it.

Write one line per paragraph and one line per list item. Code blocks, tables, and frontmatter keep their own line breaks.
