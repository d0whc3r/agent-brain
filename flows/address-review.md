---
name: address-review
description: Triage the review comments on a PR that has changes requested.
pr: [changes_requested, open]
skills: [receiving-code-review, learn]
model: opus
---

1. Read the review comments with `gh pr view --comments` and `gh api` for the inline comments.
2. For each comment, check the claim against the code before you change anything, as `receiving-code-review` describes. Mark it valid, invalid, or unclear. Do not agree without evidence.
3. Fix each valid comment. Prove a fix with a test that fails without it.
4. For an invalid comment, draft a reply with the evidence. Do not post it.
5. When a comment states a rule worth keeping, run `/learn`.

Done when each comment has a fix or a drafted reply, and the user has read the drafts.
