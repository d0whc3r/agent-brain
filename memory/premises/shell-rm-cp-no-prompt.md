---
id: shell-rm-cp-no-prompt
text: "Write command rm -f and command cp -f, because rm and cp are interactive aliases in the user shell and a prompt hangs an agent."
strength: always
scope: "*"
repos:
  - "*"
status: active
source: memory/decisions/2026-10-23-harvest.md
---

Why: The user's shell aliases rm and cp to their interactive forms. An agent cannot answer the prompt, so the command waits until it times out.
