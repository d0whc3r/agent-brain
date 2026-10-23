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

1. Restate the rule in one sentence. Ask the user when the repo or the strength is unclear. Name the repo from `git remote get-url origin`, so a copy or a worktree records the rule for the repo it was cloned from.
2. Pick the decision strength:
   - `once`: this change only. Write the note. Add no premise.
   - `always`: the rule must hold.
   - `never`: the pattern must not appear.
3. Write `memory/decisions/YYYY-MM-DD-<slug>.md` from `templates/decision.md`. Set date, tool, repo, correction, strength, evidence, and status `open`.
4. For `always` or `never`, add the premise with `brain premise add` or `premise_add`. Set `source` to the decision path. Use `"*"` in `repos` only for a rule that holds in every repo. Do not create the premise file by hand, because the tool checks the id, the strength, and secrets.
5. Record the same decision in Engram with topic key `qdrant-review-brain/<slug>`. The markdown file is the source.
6. When the correction rejects a review finding that a premise produced, add that premise id to `rejected` in the session note of that review.
7. Run `brain premise list --repo <repo>` and show the line for the new premise.

## Example

User: "No, keep new RPCs in cluster-service, not in cluster-api."

```bash
brain premise add "New RPC lands in qdrant-cloud-cluster-service" --strength always --repo qdrant-cloud-cluster-service --source memory/decisions/2026-10-23-new-rpc-cluster-service.md
```

## Limits

Premise strength is `always`, `never`, or `prefer`. Use `prefer` only when the user asks for a soft rule.

When the note is saved, do not create a skill. The `garden` skill drafts skills from repeated premises.
