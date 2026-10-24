---
id: abstraction-needs-two-uses
text: Add an interface, a design pattern, an extension point, a config option, a boolean flag parameter, or a wrapper that only forwards a call, without two or more concrete uses in the code now.
strength: never
scope: "*"
repos:
  - "*"
status: active
source: memory/decisions/2026-10-25-design-and-reuse.md
---

Why: Agents over-engineer with extra files, abstractions, and flexibility that nobody asked for. Each layer adds a hop for the reader and hides the rule. A design pattern helps when it removes a concrete duplication or serves a change that exists now.

Count the concrete uses in the code after the change: implementations of an interface, callers of an extension point, and values that callers pass to a config option or a flag. A real implementation and a test fake count as two.

When a boolean flag switches between two behaviors that share little, write two functions instead. Inline a wrapper that only forwards a call. Refactor toward a pattern when the second use arrives, not before.
