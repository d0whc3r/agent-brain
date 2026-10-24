---
date: 2026-10-24
tool: claude-code
scope: "*"
repo: "*"
correction: Store only what is important. Wait for a repeat before a correction becomes a rule.
strength: always
evidence: The user asked to tell ephemeral facts from persistent rules, because memory filled with data that adds little. Measured on 2026-10-24, Engram held 2625 observations and 98% were never updated, 6 of 15 premises had no repeat behind them, and 9 of 15 premises had 0 uses in 4 reviews.
status: open
---

The user asked for this rule explicitly, so it is an active premise.

Six premises had no repeat behind them, so they became candidates with one `seen` entry dated 2026-10-23: `engine-repo-read-only`, `new-rpc-in-cluster-service-go`, `no-schema-or-deploy-unasked`, `proto-is-api-source`, `run-check-before-done`, and `verify-against-origin-main`. Premises that an instruction file of the user also states stay active, because a rule the user wrote is an explicit ask. On 2026-10-24, three candidates went back to active for that reason: `engine-repo-read-only` and `proto-is-api-source` (the `AGENTS.md` at the qdrant scope root), and `run-check-before-done` (`~/.claude/CLAUDE.md`, section 4). The other three expire on 2026-11-22 unless they repeat.
