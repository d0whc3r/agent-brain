---
id: docs-summary-first
text: "Write each documentation file summary first: the title, a short summary of the main point and of what the reader must know or do, a table of contents when the file has four or more ## sections (in an agent file such as SKILL.md or AGENTS.md, only when it is longer than 100 lines), and then the sections from most to least important, with background and detail last."
strength: always
scope: "*"
repos:
  - "*"
status: active
source: memory/decisions/2026-10-24-docs-summary-first.md
---

Why: Readers scan and stop early. The summary gives the main point to a reader who stops there, and the table of contents shows what the file holds before the reader scrolls.

Steps keep their order, and reference keeps the order of the product, after the summary. An agent file, such as SKILL.md, AGENTS.md, CLAUDE.md, or an agent prompt, keeps its frontmatter first and gets a table of contents only when it is longer than 100 lines.
