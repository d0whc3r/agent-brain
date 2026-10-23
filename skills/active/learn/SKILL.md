---
name: learn
description: "Record a review correction from the user as a decision note in the brain repo and, when the rule is always or never, as an active premise that later reviews quote. Use when the user states a rule to keep, rejects a review finding, runs /learn, or says recuerda esto or a partir de ahora."
metadata:
  opencode/slash: "true"
---

# Learn

A correction that stays in chat is lost after the session. This skill stores it as a note, and as a premise when the rule must hold every time.

The user states the rule in chat. Phrases such as "remember this", "recuerda esto", or "a partir de ahora" are enough. You run `brain premise add`. Do not ask the user to type `/learn`.

## Steps

1. Restate the rule in one sentence. Run `brain scope` for the scope and the repo name. A copy or a worktree records the rule for the repo it was cloned from.
2. Pick the scope of the rule. Use the scope of the repo for a rule about that team or project. Use `"*"` only for a rule about how the user works everywhere, such as git or writing habits. Ask the user when it is unclear, because a rule in the wrong scope applies practices of one place to another.
3. Pick the decision strength:
   - `once`: this change only. Write the note. Add no premise.
   - `always`: the rule must hold.
   - `never`: the pattern must not appear.
4. Write `memory/decisions/YYYY-MM-DD-<slug>.md` from `templates/decision.md`. Set date, tool, scope, repo, correction, strength, evidence, and status `open`.
5. For `always` or `never`, add the premise with `brain premise add --scope <scope>` or `premise_add`. Set `source` to the decision path. Use `"*"` in `repos` only for a rule that holds in every repo of the scope. Do not create the premise file by hand, because the tool checks the id, the strength, the scope, and secrets.
6. When the correction rejects a review finding that a premise produced, add that premise id to `rejected` in the session note of that review.
7. Run `brain premise list --repo <repo> --scope <scope>` and show the line for the new premise.

## Example

User: "No, keep new RPCs in cluster-service, not in cluster-api."

```bash
brain premise add "Add a new RPC to qdrant-cloud-cluster-service, in Go." --strength always --scope qdrant --repo qdrant-cloud-cluster-service --source memory/decisions/2026-10-23-new-rpc-cluster-service.md
```

## Limits

Premise strength is `always`, `never`, or `prefer`. Use `prefer` only when the user asks for a soft rule.

When the note is saved, do not create a skill. The `garden` skill drafts skills from repeated premises.
