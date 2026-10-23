---
name: accept-skill
description: "Move an accepted draft skill to skills/active and commit that move in the brain repo. Use only after Josep names the skill."
metadata:
  opencode/slash: "true"
---

Run this command only after Josep names the skill and has read the draft.

Run brain accept-skill NAME in this repo.

The command moves skills/drafts/NAME to skills/active/NAME, refreshes the links for that skill, and commits with the message skill: accept NAME.

Reject a name that is not a slug. Reject a missing draft. Reject a name that is already active.

After the commit, do not push.
