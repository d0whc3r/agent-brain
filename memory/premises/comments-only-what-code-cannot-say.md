---
id: comments-only-what-code-cannot-say
text: "Make the code explain itself with names, small functions, named constants, and types, and write a comment only for what the code cannot say: the reason, a constraint, a workaround, a non-obvious invariant, the contract of a public API, or a link to an issue, a spec, or an ADR."
strength: always
scope: "*"
repos:
  - "*"
status: active
source: memory/decisions/2026-10-24-code-comments.md
---

Why: The code is the source of truth, and the compiler does not check comments. A comment that repeats the code or covers confusing code goes stale, and a stale comment misleads the reader and the next agent.

Before you comment, fix the code: rename, extract a function or a variable, name a constant, use a type that carries the unit, or add an assert or a test. Comment a regular expression, a complex algorithm, or an unusual line that a reader would "simplify" into a bug.

A doc comment on a public API states the contract that the signature cannot state: what it returns or does, its errors, panics, side effects, units, and concurrency guarantees. Write it where the language convention or the linter asks for it, such as godoc on exported names or rustdoc on public items. Do not restate the signature.

Never write a comment that repeats the code, narrates the change or its history, speaks to the reviewer, or labels steps and sections. Delete commented-out code, because git keeps it. Write a TODO only with a link to an issue.

Change or delete a comment in the same change as its code. The commit message holds why the code changed, and an ADR holds an architecture decision with its alternatives. A comment may link to either one.
