# Start here

Use this brain when you review, simplify, or correct code in a Qdrant Cloud repo. The brain stores your rules. The next session loads those rules.

The repo path is `/Users/josep/projects/qdrant-review-brain`.

`brain` is the command. If your shell cannot find it, run:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

The file at `~/.local/bin/brain` is a link to `bin/brain.mjs`.

## One-time setup

Run these checks once on this machine.

```bash
cd /Users/josep/projects/qdrant-review-brain
pnpm test
pnpm skills:check
brain premise list
```

`pnpm test` runs the brain tests. `pnpm skills:check` confirms every third-party skill and both internal skills have a `SKILL.md` in this repo.

Open a new session in Claude Code, OpenCode, or Codex. Ask the tool to list skills. You should see `qdrant-personal-review`, `learn`, `review-brain`, `garden`, and `accept-skill`. You should not see `example-draft`.

Codex reads `~/.agents/skills`. Claude Code reads `~/.claude/skills`. OpenCode reads `~/.agents/skills`. Do not add a second link for the same skill.

## Start work in a code project

Open the tool in the repo you will change. Do not open a copy directory. The workspace file `/Users/josep/projects/qdrant/AGENTS.md` names the copies. `qdrant-cloud-ui-copy` is one of them.

Say which repo you mean. A short prompt is enough.

```text
Review the current diff in qdrant-cloud-cluster-service.
Use review-brain. Do not edit the diff.
```

The agent must call `premise_list` for that repo before it writes findings. It must quote each `always` and `never` premise it applied.

## Record a rule

Say the rule in one sentence. Name the strength and the repo.

```text
/learn
New RPC lands in cluster-service.
Strength: always.
Repo: qdrant-cloud-cluster-service.
```

`always` and `never` become a premise at once. The next review loads that premise. A `once` note stays a decision. It does not become a premise.

You can also write the premise yourself:

```bash
brain premise add "New RPC lands in cluster-service" \
  --strength always \
  --repo qdrant-cloud-cluster-service
```

List, show, and remove:

```bash
brain premise list --repo qdrant-cloud-cluster-service
brain premise show new-rpc-lands-in-cluster-service
brain premise rm new-rpc-lands-in-cluster-service
```

`rm` moves the file to `memory/dropped/`. The active list no longer returns it.

## Use cases

### Review a Go change

You are in `qdrant-cloud-cluster-service`. The diff adds an RPC.

```text
Review this diff with review-brain.
Repo: qdrant-cloud-cluster-service.
Flow: go.
Do not edit files.
```

The agent loads `qdrant-personal-review`. It loads premises for that repo. It reads the Go skills under `.agents/skills/` when the catalog flow is `go`. Those skills include `golang-testing`, `golang-error-handling`, and `golang-grpc`.

A finding should name the file and the line. A style note without a premise stays out.

### Review a UI change

You are in `qdrant-cloud-ui`. A local server is already running.

```text
Review this diff with review-brain.
Repo: qdrant-cloud-ui.
Flow: ui.
Open http://localhost:3000 in the chrome-devtools server.
Take one screenshot. Read the console. Do not edit the diff.
```

Use the user MCP server named `chrome-devtools`. Do not use `plugin:ecc:chrome-devtools`. The user server keeps test logins in `$HOME/.local/share/qdrant-review-brain/chrome-profile`.

Sign in once in that Chrome window. Later reviews reuse the cookies. If a second tool reports a profile lock, close the first window and retry.

### Review a proto change

You are in `qdrant-cloud-public-api`.

```text
Review this proto diff with review-brain.
Repo: qdrant-cloud-public-api.
Flow: proto.
Confirm the proto is the source for the API change.
Do not edit the engine repo qdrant/.
```

The agent should read `api-and-interface-design` from `.agents/skills/api-and-interface-design/SKILL.md`.

### Reject a finding and keep the correction

The agent flags a name you want to keep.

```text
Reject that finding.
/learn
Keep the existing handler name. Do not rename it to match a new style guide.
Strength: never.
Repo: qdrant-cloud-ui.
```

The next review in that repo must quote this premise.

### Turn three similar rules into a skill

You have three premises about the same Go error pattern.

```text
/garden
Cluster premises about Go error wrapping.
Write the draft under skills/drafts only.
Do not edit skills/active.
```

Read the draft. If you want it active:

```text
/accept-skill go-error-wrapping
```

That command moves the draft to `skills/active/` and commits that move in the brain repo. It does not push. It refreshes links when `mcp/link-targets.txt` exists.

### Find or write a skill

```text
Load find-skills from /Users/josep/projects/qdrant-review-brain/.agents/skills/find-skills/SKILL.md.
Search for a skill that reviews Go context cancellation.
Do not install it in this turn. Show me the add command.
```

```text
Load skill-creator from /Users/josep/projects/qdrant-review-brain/.agents/skills/skill-creator/SKILL.md.
Draft a skill for our proto field numbering rule.
Write it under skills/drafts. Do not edit skills/active.
```

## Third-party skills

The copies live in `.agents/skills/`. `skills/third-party.json` names the review set and the flow for each skill. `skills/internal.json` names `find-skills` and `skill-creator`.

```bash
pnpm skills:check
pnpm skills:update
```

`pnpm skills:update` runs `brain skills sync`. Sync adds any missing skill with `npx skills add --copy`, then runs `npx skills update -p -y`.

GitHub runs the same update every Monday at 06:00 UTC. The workflow file is `.github/workflows/update-skills.yml`. You can also start it by hand from the Actions tab. The job runs `npx skills update -p -y`, then `brain skills check`. When the skill files change, it pushes branch `bot/update-skills` and opens a pull request. Review that diff before you merge. The workflow does not push to `master`.

Add one skill to the catalog without installing it:

```bash
brain skills add owner/repo --skill my-skill --flow review
```

Add `--apply` when you want the files in this repo.

## What the agent must not do

- Do not edit a Qdrant repo unless you ask in that turn.
- Do not commit or push a Qdrant repo unless you ask.
- Do not learn rules from copy directories.
- Do not modify the engine repo `qdrant/`.
- Do not edit `skills/active/` unless you accepted that skill in this turn.
- Do not write tokens, `.env` values, or customer data into a note.
- Do not read the Chrome profile directory into a note.

## A short session

```text
1. Open qdrant-cloud-cluster-service.
2. Review the diff with review-brain. Do not edit.
3. Reject one finding and /learn it as never.
4. brain premise list --repo qdrant-cloud-cluster-service
```

The list in step 4 is the proof. The new premise is there, or the learn step did not finish.
