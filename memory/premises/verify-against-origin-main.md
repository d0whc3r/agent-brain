---
id: verify-against-origin-main
text: "Check a claim about the default branch against origin after git fetch, not against the local copy of that branch."
strength: always
scope: qdrant
repos:
  - "*"
status: candidate
source: memory/decisions/2026-10-23-harvest.md
seen:
  - 2026-10-23 qdrant-cloud-ui correction
---

Why: A fact about qdrant-cloud-ui read from a stale local main was wrong. The local main only moves when someone pulls it.

Run `git fetch` first, then read the file or the log at `origin/main`, or at the default branch of the repo. A review of a branch still reads the branch diff.
