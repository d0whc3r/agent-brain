---
name: brain-care
description: "Keep the brain current: premise stats, workspace drift, and new rules from memory."
repos: [agent-brain]
skills: [brain-workspace-audit, brain-harvest, brain-garden, brain-tp-writing-for-agents]
model: sonnet
---

1. Run `brain premise stats`. Review each `noisy`, `stale`, and `idle` premise with the user: keep it or drop it. For each `ready` candidate, show its `seen` entries and ask whether to promote it with `brain-learn`. Drop each `expired` candidate with `brain premise rm` after the user agrees.
2. Run `brain workspace check`. When it prints lines, run `/workspace-audit`.
3. Run `/brain-harvest` when the memories changed since the last harvest note in `memory/decisions/`.
4. Run `/brain-garden` when three premises share a repo and a rule.
5. When you edit a skill, a flow, or `AGENTS.md`, follow `brain-tp-writing-for-agents`.
6. Run `npm run check`.

Done when the check passes and each flagged premise has a decision.
