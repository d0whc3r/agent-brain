---
name: brain-next
description: "Suggest and run the next steps for the repo the user is working in. Reads the repo state (branch, ticket, changed file kinds, dirty tree, PR state, behind main), matches the brain flows, and runs the chosen flow with its skills, agents, MCP servers, and model. Use when the user asks what to do next, asks for help with the next steps, asks what would be good to do in this repo, or runs /brain-next."
metadata:
  opencode/slash: "true"
---

# Next

The brain keeps the usual tasks as flows in `flows/` under `brain root`, and the flows of the user in `flows/` under `brain home`. A flow of the user replaces the brain flow of the same name. This skill finds the flows that fit the current state of the repo and runs the one the user picks.

## Suggest

1. Run `brain next --json --cwd <repo directory> --request "<the words of the user>"`.
2. Show one line of context: repo, branch, ticket, ahead, behind, dirty, PR state, worktrees, and file kinds.
3. Show at most three flows, in the order of the output. For each one, give the description, the reason it matches (the signals in its frontmatter), and what it uses: skills, agents, MCP servers, and model. When the output has `suggested`, name its flow and confidence as a hint from the local model. The hint does not change the order or the choice of the user.
4. Add one suggestion that no flow covers when the context shows it. Examples: a branch far behind main, untracked files that no check sees, a ticket key with no Jira link in the commits, a diff too big for one review (offer `split-branch`), or worktrees that `brain worktree list` marks `merged` or `gone` (offer to clean them with `brain-worktrees`).
5. Ask which flow to run. Run nothing before the answer.

## Run a flow

1. Read the flow file.
2. Load each skill in `skills` with the Skill tool.
3. Run an agent of `agents` only at the step that names it, by name with the Agent tool, with the flow `model`. When the tool cannot run a subagent, follow the agent file in `agents/` under `brain root` in this session.
4. Use the MCP servers in `mcp`. A name such as `claude_ai_Atlassian` is the Claude Code name of the server. In another tool, use the connected server that has the same tools. When no such server is connected, say so and stop that step.
5. A `workflow` field names a saved workflow. Run it only when the user asks for a workflow in this turn.
6. Follow the steps in order. The active premises for the repo apply to every step.
7. End with the check that the flow names as done, and its result.

## Learn new flows

- When the user asks for a sequence that no flow covers, do the work. Then offer to save it as `flows/<name>.md`, with the signals that would have matched. Write the file only after the user agrees.
- When the user asks to change a flow (its model, its steps, or its signals), edit that flow file and show the diff.
- When a flow step fails the same way twice, propose a change to the flow.

## Limits

A flow suggests steps. A commit, a push, a PR, a PR comment, or a Jira change still waits for an explicit request from the user.
