---
id: engine-repo-read-only
text: "Edit a file in the engine repo qdrant/ of the qdrant scope root."
strength: never
scope: qdrant
repos:
  - "*"
status: active
source: memory/decisions/2026-10-24-memory-tiers.md
seen:
  - 2026-10-23 agent-brain correction
---

Why: The engine belongs to another team. The cloud repos read it as a reference, and a change there needs that team.

Read the engine repo to learn how the engine behaves. A change that the engine needs goes to that team as an issue or a note for the user.
