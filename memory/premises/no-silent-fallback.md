---
id: no-silent-fallback
text: Return a silent default or swallow an error for missing config, invalid input, or a failed call.
strength: never
scope: "*"
repos:
  - "*"
status: active
source: memory/decisions/2026-10-25-design-and-reuse.md
---

Why: A silent default hides an error where it happens, and the failure shows up later, far from its cause. Fail fast: stop at the error and make it visible.

Throw or return the error with context. A missing required config value stops the program at startup. A caught error is handled, logged with context, or thrown again. An empty catch is a defect.

A documented default for an optional value is fine. A retry or a fallback is fine when it logs the cause and the contract names it.
