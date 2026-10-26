---
name: brain-learn
description: "Record a correction from the user in the brain home. An explicit ask (recuerda esto, a partir de ahora, siempre, nunca) becomes an active premise with a decision note. Any other correction becomes a candidate premise that counts repeats, and becomes active only after the user confirms. Use when the user states a rule to keep, corrects the agent, rejects a review finding, or runs /brain-learn."
metadata:
  opencode/slash: "true"
---

# Learn

A correction that stays in chat is lost after the session. A correction stored the first time it happens fills the brain with rules that never come back. This skill stores a rule only when it is important: when the user says so, or when it repeats. `<home>` is the output of `brain home`: the data of the user.

The user states the rule in chat. You run `brain premise`. Do not ask the user to type `/brain-learn`.

## What to keep

| Category | Examples | Where |
| --- | --- | --- |
| Ephemeral | Branch state, ticket details, the text of one finding, commands you ran, what git or the code records, a `once` decision | Nowhere. It ends with the session. |
| Candidate | A correction or a defect class with no explicit ask | A premise with `status: candidate` and one `seen` entry per repeat. Reviews skip it. No decision note. |
| Persistent | An explicit ask, or a candidate the user promotes | An active premise, a decision note, and later a skill from `brain-garden` |

An explicit ask uses words such as "remember this", "recuerda esto", "from now on", "a partir de ahora", "always", "siempre", "never", or "nunca". Any other correction is implicit.

`brain premise stats` flags a candidate `ready` after 2 corrections, or 3 defects, on 2 distinct days or more. It flags a candidate `expired` after 30 days with no repeat.

## Steps

1. Restate the rule in one sentence. Run `brain scope` for the scope and the repo name. A copy or a worktree records the rule for the repo it was cloned from.
2. Pick the scope of the rule. Use the scope of the repo for a rule about that team or project. Use `"*"` only for a rule about how the user works everywhere, such as git or writing habits. Ask the user when it is unclear, because a rule in the wrong scope applies practices of one place to another.
3. Pick the decision strength:
   - `once`: this change only. Store nothing.
   - `always`: the rule must hold.
   - `never`: the pattern must not appear.
4. Run `brain premise list --status candidate` and `brain premise search <words>`. A premise that states the same rule is a repeat, not a new rule.
5. Implicit correction:
   - A candidate exists: run `brain premise seen <id> --repo <repo> --origin correction`.
   - No candidate exists: run `brain premise add "<rule>" --strength <s> --scope <scope> --repo <repos> --status candidate`, then `brain premise seen` as above. Write no decision note.
   - Run `brain premise stats`. When the line of the candidate shows `ready`, show its `seen` entries and ask whether to promote it. On yes, do step 6 and run `brain premise promote <id>`.
6. Explicit ask, or a promoted candidate: write `<home>/memory/decisions/YYYY-MM-DD-<slug>.md` from `templates/decision.md`. Set date, tool, scope, repo, correction, strength, evidence, and status `open`. For a new rule, add the premise with `brain premise add --scope <scope>` or `premise_add`, with `source` set to the decision path. For a promoted candidate, set `source` with `brain premise update <id> --source <path>` or `premise_update`. An explicit ask that states the rule of a candidate promotes that candidate now, with no wait for repeats: set its source, then run `brain premise promote <id>`. An explicit ask that states the rule of an active premise changes nothing. Use `"*"` in `repos` only for a rule that holds in every repo of the scope. Do not create the premise file by hand, because the tool checks the id, the strength, the scope, and secrets.
7. When the correction rejects a review finding that a premise produced, add that premise id to `rejected` in the session note of that review.
8. Run `brain premise list --repo <repo> --scope <scope>`, with `--status candidate` for a candidate, and show the line.

## Example

User: "No, keep new RPCs in orders-service, not in orders-api." This is implicit, so the rule starts as a candidate. The mistake happens in orders-api, so the rule covers both repos.

```bash
brain premise add "Add a new RPC to orders-service, in Go." --strength always --scope work --repo orders-service --repo orders-api --id new-rpc-in-orders-service-go --status candidate
brain premise seen new-rpc-in-orders-service-go --repo orders-api --origin correction
```

User: "From now on, new RPCs go in orders-service." This is explicit, and the candidate exists, so write the decision note and promote the candidate:

```bash
brain premise update new-rpc-in-orders-service-go --source memory/decisions/2026-10-23-new-rpc-orders-service.md
brain premise promote new-rpc-in-orders-service-go
```

## Limits

Premise strength is `always`, `never`, or `prefer`. Use `prefer` only when the user asks for a soft rule.

When the note is saved, do not create a skill. The `brain-garden` skill drafts skills from repeated premises.
