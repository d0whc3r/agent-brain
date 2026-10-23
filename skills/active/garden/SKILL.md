---
name: garden
description: "Draft one new skill from three or more similar premises in the brain repo, and write it only under skills/drafts. Use when the user runs /garden, asks to garden, or asks which premises can become a skill."
metadata:
  opencode/slash: "true"
---

# Garden

A premise holds one rule. When three premises share a repo and a rule, a skill can hold the workflow behind them. The user reads each draft before it becomes active.

The user asks in chat. "What can become a skill?" is enough. You write the draft. Do not ask the user to type `/garden`.

## Steps

1. Read the open notes in `memory/decisions` and call `premise_list` with an empty repo.
2. Cluster the premises that share a scope, a repo, and a rule. Do not mix scopes in one cluster.
3. Draft one skill when three similar premises share that rule. One `always` or `never` correction stays a premise until that count is met, or until the user asks for a skill.
4. Write `skills/drafts/<name>/SKILL.md` from `templates/skill.md`. Give it a kebab-case `name` and a description that says what the skill does and when to use it.
5. Set each used decision status to `drafted`.
6. Write a pattern note in `memory/patterns/<name>.md` from `templates/pattern.md`. List the premise ids and the draft name.
7. Report the draft path and the premise ids. Tell the user to run `/accept-skill <name>` after reading the draft.

When no cluster has three premises, report the largest cluster and stop.

## Limits

Put new files only under skills/drafts.

Do not edit skills/active. Do not commit. Do not push.
