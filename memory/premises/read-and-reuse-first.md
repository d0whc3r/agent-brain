---
id: read-and-reuse-first
text: Before you write code, read the code the change touches, its callers, and its tests, and search the repo for an existing helper, type, constant, or pattern; reuse or extend it instead of writing a new copy.
strength: always
scope: "*"
repos:
  - "*"
status: active
source: memory/decisions/2026-10-25-design-and-reuse.md
---

Why: Code assistants copy more than they reuse, and cloned code in commits keeps growing. A second copy drifts from the first, and a fix lands in only one of them. Code that the agent has not opened is a guess.

Search by name, by signature, and by the literal values that the change needs. Follow the pattern that the repo already uses for the same job. Extend a helper when the new case is the same rule. Write new code when it is a different rule, as the premise one-place-per-rule describes.

For a change that touches more than one module, or that has two valid approaches, state the plan and the reuse you found before you edit.

A reviewer greps for the same name, signature, or literal. A copy of code that the repo already has is a structural blocker.
