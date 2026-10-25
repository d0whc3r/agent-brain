# Use cases

The user talks. You run the commands. Do not ask the user to type a slash command.

Read this file when the user's words match a case below. The skill for that case has the steps.

Contents:

- [Suggest the next steps](#suggest-the-next-steps)
- [Save or change a flow](#save-or-change-a-flow)
- [Stress-test a plan](#stress-test-a-plan)
- [Review the branch of a teammate](#review-the-branch-of-a-teammate)
- [Split a branch into PRs](#split-a-branch-into-prs)
- [Understand or clean worktrees](#understand-or-clean-worktrees)
- [Get an independent review](#get-an-independent-review)
- [Review the current work](#review-the-current-work)
- [Define when a task is done](#define-when-a-task-is-done)
- [Review a page in the browser](#review-a-page-in-the-browser)
- [Keep a rule apart by scope](#keep-a-rule-apart-by-scope)
- [Keep a rule](#keep-a-rule)
- [Drop a rule](#drop-a-rule)
- [Turn repeated rules into a skill](#turn-repeated-rules-into-a-skill)
- [Accept a draft](#accept-a-draft)
- [Find a third-party skill](#find-a-third-party-skill)
- [Write a new skill](#write-a-new-skill)
- [Import rules from memory](#import-rules-from-memory)
- [Check premise use](#check-premise-use)
- [Audit the workspace config](#audit-the-workspace-config)
- [Check repo skills against the brain](#check-repo-skills-against-the-brain)
- [Update third-party skills](#update-third-party-skills)
- [What you do not wait for](#what-you-do-not-wait-for)

## Suggest the next steps

User: "What should I do next?" "¿Qué hago ahora?" "What would be good to do in this repo?"

You load `brain-next`. You run `brain next --json --cwd <repo> --request "<the words of the user>"`. You show at most three flows with the reason each one matches. You run the flow the user picks, with its skills, agents, MCP servers, and model.

## Save or change a flow

User: "Save this as a flow." "Use sonnet for self-review." "Add the e2e tests to prepare-pr."

You load `brain-next`. You edit or write the file in `flows/` and show the diff. You write a new flow only after the user agrees.

## Stress-test a plan

User: "Grill this plan." "Interrógame sobre este diseño." "Is this approach sound?"

You load `brain-next` and run the `grill-plan` flow: `brain-tp-grilling` in rounds with a recommended answer for each question, then `brain-tp-doubt-driven-development` for decisions that are hard to undo. You look up facts yourself.

## Review the branch of a teammate

User: "Review PR 123." "Revisa la rama de Ana."

You run the `review-branch` flow. The branch goes into a worktree. `brain-reviewer` runs once per lens: `premises` with opus, and `security`, `tests`, and `simplify` with sonnet. Opus merges the results and drops each finding that fails `brain-tp-doubt-driven-development`. You show draft PR comments and post nothing.

## Split a branch into PRs

User: "Split this branch into PRs." "Divide estos cambios en worktrees."

You run the `split-branch` flow. `brain-split-planner` returns the plan: parts, files and hunks, dependencies, conflicts, and merge order. You change nothing before the user approves it. Then you create one worktree per part, run the checks in each, and prove that no change is lost. Commits wait for the user.

## Understand or clean worktrees

User: "¿Qué worktrees tengo?" "Clean the merged worktrees."

You load `brain-worktrees` and run `brain worktree list`. You propose to remove `merged`, `gone`, and `prunable` rows, and remove only the ones the user approves.

## Get an independent review

User: "Review this with a fresh pair of eyes." "Use the brain-reviewer agent."

You load the `brain-reviewer` skill. It runs the agent of the same name on the diff. You show its findings. You do not edit the diff.

## Review the current work

User: "Review this diff." "Revisa este cambio." "Look at the branch." "Is this PR safe to merge?"

You load the `brain-reviewer` skill. It runs the agent, which calls `premise_list` for the repo. You do not edit the diff.

With more than one active worktree, `self-review` asks whether to review only the current one, all of them, or the ones the user names. A stacked worktree is reviewed against its parent.

## Define when a task is done

User: "Define the DoD." "Define el DoD." "When is this done?" "¿Cuándo está terminado esto?" "Is this done?"

You load `brain-dod` and follow it. Before a task changes files, you write the DoD of the branch, one criterion per requirement, and ask the user to approve it. To close the task, you run `brain dod run` and `brain dod lint --done`. You say that the task is done only when the lint prints `ok`.

## Review a page in the browser

User: "Check the page on localhost:3000." "The layout looks wrong. Look at it."

You load `brain-reviewer`. You open the URL with the `chrome-devtools` MCP server, not `plugin:ecc:chrome-devtools`. You take one screenshot and read the console. You do not edit the diff unless the user asks for a fix.

## Keep a rule apart by scope

User: "That only applies at work." "This is for my personal projects." "Is this rule global?"

You run `brain scope`. You store the rule with the scope of the repo, or with `"*"` when it is about how the user works everywhere. You ask when it is unclear.

## Keep a rule

User: "Remember this." "Recuerda esto." "From now on, do it this way." "A partir de ahora." "No, keep it in cluster-service."

You load `brain-learn` and follow it. An explicit ask ("recuerda esto", "a partir de ahora") gets a decision note and an active premise:

```bash
brain premise add "RULE" --strength always --scope SCOPE --repo REPO --source memory/decisions/DATE-slug.md
```

A correction without an explicit ask ("No, keep it in cluster-service") becomes a candidate, or a repeat of one:

```bash
brain premise add "RULE" --strength always --scope SCOPE --repo REPO --status candidate
brain premise seen ID --repo REPO --origin correction
```

You show the new line with `brain premise list`, with `--status candidate` for a candidate.

Ask only when the repo or the strength is unclear.

## Drop a rule

User: "Forget that rule." "Ya no aplica." "Delete the premise about RPC ownership."

You run `brain premise rm ID`. You do not delete the markdown file by hand. You show the list after the remove.

## Turn repeated rules into a skill

User: "These keep coming up. Make a skill." "What can become a skill?"

You load `brain-garden` and follow it. You write only under `skills/drafts/`. You stop and tell the user the draft path.

## Accept a draft

User: "That draft is good. Make it active." "Accept go-error-wrapping."

You load `brain-accept-skill`. You run `brain accept-skill NAME`. You show `git log -1 --oneline`. You do not push.

## Find a third-party skill

User: "Is there a skill for Go context cancellation?"

You load `find-skills` from `.agents/skills/find-skills/SKILL.md`. You show the add command. You do not install it unless the user asks.

## Write a new skill

User: "Write a skill for our proto field numbers."

You load `skill-creator` from `.agents/skills/skill-creator/SKILL.md`. You write the draft under `skills/drafts/`. You do not edit `skills/active/`.

## Import rules from memory

User: "Which of my corrections are not premises yet?" "Import the rules from my memories."

You load `brain-harvest`. You show a table of proposed premises with their sources. You add only the rows the user approves.

## Check premise use

User: "Which rules never apply?" "Are any rules noisy?"

You run `brain premise stats`. You show each `unused`, `stale`, `noisy`, and `idle` premise, and each `ready` and `expired` candidate. You ask whether to keep, change, promote, or drop each one.

## Audit the workspace config

User: "Do the repo rules contradict the brain?" "Audit the workspace." "Did any repo change its AGENTS.md?"

You load `brain-workspace-audit`. You run `brain workspace check`. You report drift, broken skill links, and rules that contradict, duplicate, or miss a premise. You do not edit a team repo.

## Check repo skills against the brain

User: "Do our repo skills match the brain?" "Hay drift?" "Is this skill out of date versus the team copy?"

You load `brain-workspace-audit`. You run `brain workspace check`. You read `docs/repo-skills.md`. You report each `version` and `broken` line. A repo-only skill is a list, not a failure. You do not edit the repo skill or the brain copy unless the user asks. When a repo `AGENTS.md` and a premise disagree, you quote both and ask which one wins.

## Update third-party skills

User: "Update the third-party skills." "Are the vendor skills current?"

You run `pnpm skills:check`. When the user asks to update, you run `pnpm skills:update`. You show what changed. You do not push.

## What you do not wait for

| You might wait for                         | Do this instead                             |
| ------------------------------------------ | ------------------------------------------- |
| The user types `/brain-reviewer`           | Start the review when they ask for a review |
| The user types `/brain-learn`              | Store the rule when they state one          |
| The user types the `brain` command         | You run `brain`                             |
| The user names a flow such as `go` or `ui` | You pick the flow from the changed files    |
