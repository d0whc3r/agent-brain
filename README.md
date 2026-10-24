# Qdrant review brain

A personal store of review rules and workflows for Claude Code, Codex, and OpenCode. Scopes keep work and personal practices apart.

Premises are rules. Skills are workflows. Engram is the session log.

## Start

From this checkout, run:

```bash
scripts/install.sh
```

Open a new chat in a code repo and ask for a review, a rule to remember, or the next step. The agent runs the brain commands.

[Getting started](docs/getting-started.md) covers requirements, updates, removal, and a worked example.

## Documentation

| Need | Read |
|---|---|
| Know what to say in chat | [Use cases](docs/use-cases.md) |
| Find a skill, command, agent, or scope | [Brain catalog](docs/catalog.md) |
| Add or change a workflow | [Flow format](flows/README.md) |
| Compare repo skills with the brain | [Repo skills and audits](docs/repo-skills.md) |
| Configure MCP, Chrome, or Obsidian | [Tool integrations](docs/integrations.md) |
| Read the initial setup evidence | [Setup history](docs/setup-history.md) |

## Checks

Before a commit, run:

```bash
npm run check
```

This runs oxlint, the oxfmt format check, the tests, the skill check, and the layout and MCP snippet checks. `npm run fmt` formats the code. `.editorconfig` sets the indent, the line ending, and the line width for editors and for oxfmt. [AGENTS.md](AGENTS.md) holds the repo rules.
