---
id: no-commit-push-unasked
text: "Run git add, git commit, or git push without an explicit request in that turn."
strength: never
scope: "*"
repos:
  - "*"
status: active
source: memory/decisions/2026-10-25-premise-review.md
---

Why: The index, a commit, and a push are the user's record of the work, and a commit and a push are visible to the team. The user decides when work is ready.

A command that stages counts as `git add`: `git add -N`, `git mv`, `git rm`, and `git commit -a`. Lint or format a new file by its path instead. `/brain-accept-skill <name>` is the explicit request to commit that one skill move. A request covers only the turn in which the user makes it.
