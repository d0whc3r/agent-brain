---
id: engine-repo-read-only
text: "Edit the engine repo qdrant/ in the qdrant scope root. Read it only."
strength: never
scope: qdrant
repos:
  - "*"
status: active
source: memory/decisions/2026-10-23-harvest.md
seen:
  - 2026-10-23 qdrant-review-brain correction
---

Why: The engine belongs to another team. The cloud repos read it as a reference, and a change there needs that team.
