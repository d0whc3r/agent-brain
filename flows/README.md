# Flows

A flow is a task you do often, with the steps that finish it well. `brain next` reads the state of the repo you are in and lists the flows that match it. The `brain-next` skill runs the flow you pick.

## Fields

| Field | Use |
| --- | --- |
| `name` | Flow id. Defaults to the file name. |
| `description` | One sentence. `brain next` prints it. |
| `scopes` | Brain scopes from `brain.config.json`, or `*`. Use it for a flow that fits one team or project, so it does not show up in the others. |
| `repos` | Origin repo names, or `*`. The flow matches only in these repos. |
| `kinds` | Changed file kinds: `go`, `python`, `proto`, `ui`, `migration`, `docs`, `test`, `deps` (a dependency manifest or a lockfile). One match is enough. |
| `branch` | `main` or `feature`. |
| `dirty` | `true` or `false`: uncommitted changes. |
| `pr` | PR state of the branch: `none`, `draft`, `open`, `changes_requested`, `approved`. |
| `behind` | `true` when the branch is behind `origin/main`. |
| `skills` | Skills the flow loads. |
| `agents` | Subagents the flow runs. Ask for each one by name. |
| `mcp` | MCP servers the flow uses. |
| `model` | Model for the subagents of the flow: `opus`, `sonnet`, `haiku`, or `fable`. |
| `workflow` | Optional saved workflow to run for the multi-agent part. |

Every signal field you set must match. A flow with more matching signals ranks higher. A flow with no signal fields matches everywhere and ranks last.

The body lists the steps. Keep each step a command. Name the check that proves the flow is done.

## Add a flow

Copy the closest flow, change the fields, and run `brain next` in a repo where it should match. The `brain-next` skill offers to write a new flow when you repeat a sequence that no flow covers.
