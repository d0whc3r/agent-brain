---
name: start-ticket
description: Start work on a Jira ticket from a clean main branch.
scopes: [qdrant]
branch: main
dirty: false
mcp: [claude_ai_Atlassian]
skills: [brain-tp-grilling, brain-tp-planning-and-task-breakdown, brain-dod]
model: opus
---

1. Ask for the ticket key when the user has not named it.
2. Read the issue with the Atlassian MCP `getJiraIssue`. Read the linked issues and the acceptance criteria.
3. Name the repos the change touches. An API change starts in the proto of `qdrant-cloud-public-api`.
4. Grill the open decisions with `brain-tp-grilling`: one round of questions at a time, each with a recommended answer. Look up facts yourself.
5. Propose a short plan with `brain-tp-planning-and-task-breakdown`, one task per repo, and the branch name `feat/josep/<KEY>_<slug>`.
6. Ask whether to work in this checkout or in a worktree. Create the branch only after the user agrees.
7. On the new branch, define the DoD with `brain-dod`, with the title `<KEY>` and one criterion per acceptance criterion of the ticket. In a worktree, or for a second repo, pass its path as `--cwd`.

Done when the branch exists, the plan is in the chat, and the user approved a DoD that `brain dod lint` accepts.
