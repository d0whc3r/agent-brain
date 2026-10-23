---
name: review-diff
description: Review the branch diff against the premises with the read-only brain-reviewer agent.
branch: feature
skills: [review-brain]
agents: [brain-reviewer]
mcp: [brain-premises]
model: opus
---

1. Run the `brain-reviewer` agent on the branch diff. Pass the model of this flow.
2. Show its findings and the premises it applied.
3. For each finding the user rejects, run `/learn`, and add the premise id to `rejected` in the session note.

Done when the session note exists in `memory/sessions/` and each finding has an answer from the user.
