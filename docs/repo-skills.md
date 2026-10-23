# Repo skills and the brain

Many repos already ship skills. The brain does not replace those skills. A review loads the repo skill and the brain premise. When the same skill name exists in both places, the files must match. A different file is drift.

The live check is:

```bash
brain workspace check --all
```

It reads the baseline in `memory/workspace/inventory.json`. It hashes `SKILL.md` in each repo of each scope root and compares the shared names with `.agents/skills/` in this repo. It also reports skill links with no readable `SKILL.md`. `pnpm skills:drift` runs the same command. Exit 1 means a line was printed.

Copy directories are out of scope. Do not learn rules from them.

## Homes

| Home | Path | What it owns |
|---|---|---|
| Workspace agents | `~/projects/qdrant/.agents/skills` | Vendor skills for every repo in the workspace. This is the set that overlaps the brain Go skills. |
| Workspace Claude | `~/projects/qdrant/.claude/skills` | Speckit skills. Repo tooling. |
| Cloud UI publisher | `skills-team-cloud-ui/skills` | The published UI skills. `qdrant-cloud-ui` installs from here. |
| Cloud UI tooling | `skills-team-cloud-ui/.agents/skills` | `find-skills`, `skill-creator`, `skill-grouping`. |
| Company skills | `skills-internal/skills` | Advisor, writing style, messaging. Not personal review rules. |
| Cloud UI repo | `qdrant-cloud-ui/.agents/skills` | UI skills, including `cloud-ui-*`. |
| Admin UI | `qdrant-cloud-admin-v2/.agents/skills` | Admin UI skills. |
| Public API | `qdrant-cloud-public-api/.agents/skills` | `protobuf`, `pr-description`, `humanize`. |
| Regions and clusters docs | `cloud-rc-docs/.agents/skills` | Living-docs skills. |

`skills-team-cloud-ui` keeps three lists apart. `skills.json` is the published vendor set. `skills-lock.json` is the authoring tools. `.claude-plugin/marketplace.json` is the install groups. Do not merge those lists into the brain catalog.

## Current state

`memory/workspace/inventory.md` lists the skills of every repo and the known conflicts with the brain. `brain workspace scan` writes it. Read that file for the current drift. Do not copy hashes into this page.

## What a hash cannot see

A hash does not catch a rule conflict. These stay a chat review:

- A repo `AGENTS.md` says one ownership rule. A brain premise says another.
- A `cloud-ui-*` skill says how the UI works. A premise says never do that.
- Speckit skills in `.claude/skills` plan work. They do not override a premise.

When the user asks which rules disagree, read the repo `AGENTS.md`, the repo skills for that diff, and `premise_list`. Quote both sides. Ask which one wins. Do not edit either file unless the user asks.
