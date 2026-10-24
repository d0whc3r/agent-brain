---
id: one-place-per-rule
text: "Keep each business rule, constant, format, and schema in one place, and merge code only when it changes for the same reason: leave two look-alike copies apart until a third shows the shared rule."
strength: always
scope: "*"
repos:
  - "*"
status: active
source: memory/decisions/2026-10-25-design-and-reuse.md
---

Why: DRY is about knowledge, not identical text. When one rule lives in two places, a change edits one place and leaves the other wrong. When two pieces of code only look alike, a shared helper grows a flag for each caller, and duplication is far cheaper than the wrong abstraction.

The test: one change of the rule needs edits in two places. Then move the rule to one place. Two copies that change for different reasons stay apart. On the third copy, extract the shared rule.

A shared helper that grows a flag or a branch per caller is the wrong abstraction. Inline it back into each caller, and delete the branches that each caller does not use.

Tests may repeat setup when the repetition makes each test easier to read.
