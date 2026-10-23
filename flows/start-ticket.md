---
name: start-ticket
description: Start work on a Jira ticket from a clean main branch.
branch: main
dirty: false
mcp: [claude_ai_Atlassian]
skills: [planning-and-task-breakdown]
model: opus
---

1. Ask for the ticket key when the user has not named it.
2. Read the issue with the Atlassian MCP `getJiraIssue`. Read the linked issues and the acceptance criteria.
3. Name the repos the change touches. An API change starts in the proto of `qdrant-cloud-public-api`.
4. Propose a short plan, one task per repo, and the branch name `feat/josep/<KEY>_<slug>`.
5. Ask whether to work in this checkout or in a worktree. Create the branch only after the user agrees.

Done when the branch exists and the plan is in the chat.
