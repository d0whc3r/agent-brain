---
name: {{name}}
description: {{description}}
metadata:
  opencode/slash: "true"
  brain/agent: {{name}}
---

# {{name}}

This skill is the entry point for the `{{name}}` agent. It collects the context and runs the agent. The agent file holds the steps: `agents/{{name}}.md` under `brain root`.

1. Collect the context: the repo path from `git rev-parse --show-toplevel`, the branch, the output of `brain scope`, and the request of the user in their words, such as a PR number, a branch, a lens, or a list of worktrees.
2. Run the `{{name}}` agent with that context only, not this session history. When a flow runs this skill, pass the model of the flow.
3. When this tool cannot run a subagent, read the agent file and follow it in this session.
4. Show the output of the agent as it is. Do not apply a change it proposes unless the user asks.
