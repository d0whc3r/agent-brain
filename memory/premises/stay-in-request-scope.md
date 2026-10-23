---
id: stay-in-request-scope
text: "Keep a change inside the request. Mention unrelated dead code and leave it in place."
strength: always
scope: "*"
repos:
  - "*"
status: active
source: memory/decisions/2026-10-23-harvest.md
---

Why: A change outside the request is harder to review and can break what the user did not ask to touch.
