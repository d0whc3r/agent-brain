---
id: no-silent-fallback
text: Return an undocumented default, or swallow an error without a log, for missing required config, invalid input, or a failed call.
strength: never
scope: "*"
repos:
  - "*"
status: active
source: memory/decisions/2026-10-25-design-and-reuse.md
---

Why: A silent default hides an error where it happens, and the failure shows up later, far from its cause. Fail fast: stop at the error and make it visible.

Throw or return the error with context. A missing required config value stops the program at startup. A caught error is handled, logged with context, or thrown again. An empty catch is a defect.

A documented default for an optional value is fine, and so is an absent optional file that the contract treats as empty. A retry or a fallback is fine when it logs the cause and the contract names it.
