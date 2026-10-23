# Repo skills and the brain

Many repos already ship skills. The brain does not replace those skills. A review loads the repo skill and the brain premise. When the same skill name exists in both places, the files must match. A different file is drift.

The live check is:

```bash
pnpm skills:drift
```

It reads `skills/repo-registry.json`. It hashes `SKILL.md` in each home and in `.agents/skills/` in this repo. Exit 1 means drift. A skill that exists only in a repo is listed. That is not a failure.

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

## Review on 2026-10-23

Shared names with the same `SKILL.md` hash:

- `vercel-react-best-practices` and `vercel-composition-patterns` in `qdrant-cloud-ui`, `qdrant-cloud-admin-v2`, and `skills-team-cloud-ui`.
- `find-skills` in the workspace and in `skills-team-cloud-ui`.
- `skill-creator` in `skills-team-cloud-ui`. The workspace does not have this copy.

Drift, workspace `.agents/skills` against this brain:

| Skill | Workspace hash | Brain hash |
|---|---|---|
| `golang-error-handling` | `ca442131bb40` | `536c25e624c3` |
| `golang-grpc` | `a080ffbaf5b4` | `d8732f076189` |
| `golang-observability` | `c314b828e2a4` | `539f7fc73370` |
| `golang-testing` | `6056559e12e9` | `55eea3ed4536` |

A review in a Go repo can load both copies. Treat the workspace file as the team copy and the brain file as the personal copy until the hashes match. Do not silently pick one.

## What a hash cannot see

A hash does not catch a rule conflict. These stay a chat review:

- A repo `AGENTS.md` says one ownership rule. A brain premise says another.
- A `cloud-ui-*` skill says how the UI works. A premise says never do that.
- Speckit skills in `.claude/skills` plan work. They do not override a premise.

When the user asks which rules disagree, read the repo `AGENTS.md`, the repo skills for that diff, and `premise_list`. Quote both sides. Ask which one wins. Do not edit either file unless the user asks.
