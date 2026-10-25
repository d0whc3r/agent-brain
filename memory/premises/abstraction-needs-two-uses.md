---
id: abstraction-needs-two-uses
text: Add an interface, design pattern, extension point, config option, boolean flag, or forwarding wrapper with fewer than two real variants in the code now, where a test fake counts only if it replaces a network service, the clock, or another dependency that a test cannot run for real.
strength: never
scope: "*"
repos:
  - "*"
status: active
source: memory/decisions/2026-10-25-premise-review.md
---

Why: Agents over-engineer with extra files, abstractions, and flexibility that nobody asked for. Each layer adds a hop for the reader and hides the rule. An interface with one implementation, or a flag that every caller sets the same way, is a guess about the future.

Count the real variants in the code after the change: implementations of an interface or a pattern, plugins of an extension point, and distinct values that callers pass to an option or a flag. A wrapper that only forwards a call is one variant. Inline it unless it implements an interface that has a second real variant.

A test fake is a variant only when it replaces something that a test cannot run for real: a network service, another process, the clock, randomness, or a slow system. For in-process code, test through the real implementation.

Two variants are the minimum. A boolean flag that switches between two behaviors that share little becomes two functions. Refactor toward a pattern when the second real variant exists.

This premise covers new seams that let behavior vary. Merging copies of one rule into a plain function follows the premise `one-place-per-rule`.
