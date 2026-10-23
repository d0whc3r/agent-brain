---
name: skill-drift
description: "Compare skill copies in Qdrant repos with the brain vendor copies and report hash drift. Use when the user asks if repo skills match the brain, asks about drift, incongruencias, or contradicciones, or asks which skill copy is newer."
metadata:
  opencode/slash: "true"
---

# Skill drift

Repo skills and brain skills can share a name and differ in the file. A review that loads both will follow two texts.

The user asks in chat. "Do the repo skills match?" is enough. You run the check. Do not ask the user to type a slash command.

## Steps

1. Run `pnpm skills:drift` in `/Users/josep/projects/qdrant-review-brain`.
2. Read `docs/repo-skills.md` for what each home owns.
3. Report every `DRIFT` line with the skill name, the home, and both hashes.
4. List repo-only skills for the repo in the current directory. Do not call that drift.
5. When a repo `AGENTS.md` and a premise disagree, quote both. Ask which one wins.

## Limits

Do not edit the repo skill or the brain copy unless the user asks. Do not learn rules from a copy directory.
