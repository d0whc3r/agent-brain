---
id: verify-against-origin-main
text: "Read facts from origin/main, because the local checkout is on a feature branch and local main lags."
strength: always
scope: qdrant
repos:
  - "*"
status: candidate
source: memory/decisions/2026-10-23-harvest.md
seen:
  - 2026-10-23 qdrant-cloud-ui correction
---

Why: A fact read from a feature branch or a stale main can be wrong for the code the team runs.
