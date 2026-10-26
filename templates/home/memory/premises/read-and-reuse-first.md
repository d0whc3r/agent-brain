---
id: read-and-reuse-first
text: Before you write code, read the code the change touches, its callers, and its tests, and search the repo for a helper, type, constant, or pattern that does the same job under the same rule; use it instead of writing a second version.
strength: always
scope: "*"
repos:
  - "*"
status: candidate
source: ""
---

Why: Code assistants copy more than they reuse, and cloned code in commits keeps growing. A second version of one rule drifts from the first, and a fix lands in only one of them. Code that the agent has not opened is a guess.

Search by name, by signature, and by the literal values that the change needs. Follow the pattern that the repo already uses for the same job.

The test for the same rule: a change of the rule needs the same edit in the helper and in the new code. Then call the helper. Extend it only when it still states one rule, without a flag or a branch per caller. A helper that only looks like the new case serves a different rule, so write new code, as the premise `one-place-per-rule` describes.

For a change that touches more than one module, or that has two valid approaches, state the plan and the reuse you found before you edit.

A reviewer greps for the same name, signature, or literal. A second version of a helper that the repo already has for the same rule is a structural blocker. Code that only looks alike falls under `one-place-per-rule`.
