---
id: one-place-per-rule
text: "Keep each rule, constant, format, and schema in one place: merge two copies as soon as one change of the rule must edit both, and keep code that only looks alike apart until a third copy shows one shared rule."
strength: always
scope: "*"
repos:
  - "*"
status: active
source: memory/decisions/2026-10-25-premise-review.md
---

Why: DRY is about knowledge, not identical text. When one rule lives in two places, a change edits one place and leaves the other wrong. When two pieces of code only look alike, a shared helper grows a flag for each caller, and duplication is far cheaper than the wrong abstraction.

The test: one change of the rule must edit two places. Then the copies hold one rule. Move it to one place now, even with two copies.

Code that changes for different reasons holds two rules that match today by chance. Leave the copies apart. When you cannot tell, wait. On the third copy, compare all three, and extract only the part that follows one rule.

A shared helper that grows a flag or a branch per caller is the wrong abstraction. Inline it back into each caller, and delete the branches that each caller does not use.

A plain function or constant that holds one rule belongs here. A new interface, pattern, option, or flag follows the premise `abstraction-needs-two-uses`.

Tests may repeat setup when the repetition makes each test easier to read.
