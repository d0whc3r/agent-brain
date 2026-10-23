# Use cases

The user talks. You run the commands. Do not ask the user to type a slash command.

Read this file when the user's words match a case below. The skill for that case has the steps.

## Suggest the next steps

User: "What should I do next?" "¿Qué hago ahora?" "What would be good to do in this repo?"

You load `next`. You run `brain next --json --cwd <repo>`. You show at most three flows with the reason each one matches. You run the flow the user picks, with its skills, agents, MCP servers, and model.

## Save or change a flow

User: "Save this as a flow." "Use sonnet for review-diff." "Add the e2e tests to prepare-pr."

You load `next`. You edit or write the file in `flows/` and show the diff. You write a new flow only after the user agrees.

## Get an independent review

User: "Review this with a fresh pair of eyes." "Use the brain-reviewer agent."

You run the `brain-reviewer` agent by name on the diff. You show its findings. You do not edit the diff.

## Review the current work

User: "Review this diff." "Revisa este cambio." "Look at the branch." "Is this PR safe to merge?"

You load `review-brain` and follow it. You call `premise_list` for the repo. You do not edit the diff.

## Review a page in the browser

User: "Check the page on localhost:3000." "The layout looks wrong. Look at it."

You load `review-brain`. You open the URL with the `chrome-devtools` MCP server, not `plugin:ecc:chrome-devtools`. You take one screenshot and read the console. You do not edit the diff unless the user asks for a fix.

## Keep a rule apart by scope

User: "That only applies at work." "This is for my personal projects." "Is this rule global?"

You run `brain scope`. You store the rule with the scope of the repo, or with `"*"` when it is about how the user works everywhere. You ask when it is unclear.

## Keep a rule

User: "Remember this." "Recuerda esto." "From now on, do it this way." "A partir de ahora." "No, keep it in cluster-service."

You load `learn` and follow it. You write the decision note. When the rule is `always` or `never`, you run:

```bash
brain premise add "RULE" --strength always --repo REPO --source memory/decisions/DATE-slug.md
```

You show `brain premise list --repo REPO` so the user sees the new line.

Ask only when the repo or the strength is unclear.

## Drop a rule

User: "Forget that rule." "Ya no aplica." "Delete the premise about RPC ownership."

You run `brain premise rm ID`. You do not delete the markdown file by hand. You show the list after the remove.

## Turn repeated rules into a skill

User: "These keep coming up. Make a skill." "What can become a skill?"

You load `garden` and follow it. You write only under `skills/drafts/`. You stop and tell the user the draft path.

## Accept a draft

User: "That draft is good. Make it active." "Accept go-error-wrapping."

You load `accept-skill`. You run `brain accept-skill NAME`. You show `git log -1 --oneline`. You do not push.

## Find a third-party skill

User: "Is there a skill for Go context cancellation?"

You load `find-skills` from `.agents/skills/find-skills/SKILL.md`. You show the add command. You do not install it unless the user asks.

## Write a new skill

User: "Write a skill for our proto field numbers."

You load `skill-creator` from `.agents/skills/skill-creator/SKILL.md`. You write the draft under `skills/drafts/`. You do not edit `skills/active/`.

## Import rules from memory

User: "Which of my corrections are not premises yet?" "Import the rules from my memories."

You load `harvest`. You show a table of proposed premises with their sources. You add only the rows the user approves.

## Check premise use

User: "Which rules never apply?" "Are any rules noisy?"

You run `brain premise stats`. You show each `unused`, `stale`, and `noisy` premise. You ask whether to keep, change, or drop each one.

## Audit the workspace config

User: "Do the repo rules contradict the brain?" "Audit the workspace." "Did any repo change its AGENTS.md?"

You load `workspace-audit`. You run `brain workspace check`. You report drift, broken skill links, and rules that contradict, duplicate, or miss a premise. You do not edit a team repo.

## Check repo skills against the brain

User: "Do our repo skills match the brain?" "Hay drift?" "Is this skill out of date versus the team copy?"

You load `workspace-audit`. You run `brain workspace check --all`. You read `docs/repo-skills.md`. You report each `version` and `broken` line. A repo-only skill is a list, not a failure. You do not edit the repo skill or the brain copy unless the user asks. When a repo `AGENTS.md` and a premise disagree, you quote both and ask which one wins.

## Update third-party skills

User: "Update the third-party skills." "Are the vendor skills current?"

You run `pnpm skills:check`. When the user asks to update, you run `pnpm skills:update`. You show what changed. You do not push.

## What you do not wait for

| You might wait for | Do this instead |
|---|---|
| The user types `/review-brain` | Start the review when they ask for a review |
| The user types `/learn` | Store the rule when they state one |
| The user types the `brain` command | You run `brain` |
| The user names a flow such as `go` or `ui` | You pick the flow from the changed files |
