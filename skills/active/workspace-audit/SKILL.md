---
name: workspace-audit
description: "Audit the agent config of the repos in each brain scope root (AGENTS.md, CLAUDE.md, skills, agents, commands) against the brain. Finds drift since the last scan, broken skill links, version drift of shared skills, name collisions, and rules that contradict, duplicate, or miss a brain premise. Use when the user asks for a workspace audit, asks whether repo skills match or drift from the brain, asks about incongruencias or contradicciones, asks which skill copy is newer, or after brain workspace check reports changes."
metadata:
  opencode/slash: "true"
---

# Workspace audit

Many repos in the workspace carry their own rules and skills. A rule in a repo that contradicts a premise makes the agent pick one at random. This audit finds those cases and lets the user decide.

## Steps

1. Run `brain workspace check --all`. With no baseline, run `brain workspace scan` and read `memory/workspace/inventory.md`.
2. Handle each line from the check:
   - `added` or `changed`: read the file. Go to step 3 for an instruction file or a skill.
   - `removed`: check whether a premise or a brain skill refers to it.
   - `conflict broken`: the repo links a skill that is not installed. Name the install command of that repo (its `skills-lock.json` and `npx skills`). Do not run it.
   - `conflict version`: diff the repo `SKILL.md` and the brain copy in `.agents/skills/`. Say which is newer.
   - `conflict collision`: a repo skill has the name of a brain skill, so the trigger is ambiguous in that repo. Propose a rename.
3. Compare the rules with the brain. Call `premise_list` with the repo and its scope. Compare a repo only with the premises of its own scope and the global ones, so the practices of one scope do not judge another. Read the repo `AGENTS.md` and `CLAUDE.md`, the `AGENTS.md` at the scope root, and the skills that touch review, lint, format, git, or tests. Classify each finding:
   - `contradiction`: the repo says one thing and a premise or a brain skill says the opposite.
   - `duplicate`: the repo already states the premise. Keep both, and note it.
   - `gap`: the repo states a rule that the brain lacks. It is a premise candidate.
   - `stale`: a premise names a command, script, or path that the repo no longer has.
4. Write `memory/workspace/audit-YYYY-MM-DD.md` with one table: kind, scope, repo, file, line, brain side, repo side, proposal.
5. Show the table. Ask the user how to resolve each `contradiction` and `stale` row, and which `gap` rows to add.
6. Apply only the approved brain changes: `brain premise add`, `brain premise rm`, or an edit of a brain skill.
7. Run `brain workspace scan` to store the new baseline. Show the conflict count.

## Limits

The repos are team repos. Do not edit them. Write a proposed change for the repo as text, and let the user apply it.

Cite each rule with its file and line, so the user can check it.
