---
id: stay-in-request-scope
text: "Keep a change inside the request, and mention unrelated dead code or stale text instead of changing it."
strength: always
scope: "*"
repos:
  - "*"
status: candidate
source: ""
---

Why: A change outside the request is harder to review and can break what the user did not ask to touch.
