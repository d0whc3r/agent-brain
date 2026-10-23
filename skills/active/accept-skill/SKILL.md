---
name: accept-skill
description: "Move an accepted draft skill to skills/active and commit that move in the brain repo. Use only after Josep names the skill."
metadata:
  opencode/slash: "true"
---

Run this command only after Josep names the skill and has read the draft.

Run brain accept-skill NAME in this repo.

The command moves skills/drafts/NAME to skills/active/NAME and commits with the message skill: accept NAME.

After that commit, the command reads mcp/link-targets.txt. It skips a blank line. It refreshes the active skill links for each path in that file.

A missing file creates no links. A failed commit creates no links.

Reject a name that is not a slug. Reject a missing draft. Reject a name that is already active.

After the commit, do not push.
