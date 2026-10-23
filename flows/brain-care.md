---
name: brain-care
description: Keep the brain current: premise stats, workspace drift, and new rules from memory.
repos: [qdrant-review-brain]
skills: [workspace-audit, harvest, garden]
model: sonnet
---

1. Run `brain premise stats`. Review each `noisy` and `stale` premise with the user.
2. Run `brain workspace check`. When it prints lines, run `/workspace-audit`.
3. Run `/harvest` when the memories changed since the last harvest note in `memory/decisions/`.
4. Run `/garden` when three premises share a repo and a rule.
5. Run `npm run check`.

Done when the check passes and each flagged premise has a decision.
