---
name: brain-accept-skill
description: "Move one accepted draft skill from skills/drafts to skills/active in the brain home, commit that move, and refresh the skill links. Use only when the user runs /brain-accept-skill NAME or names the draft to accept."
metadata:
  opencode/slash: "true"
---

# Accept skill

An active skill loads in every session, so only the user moves a draft to active. `<home>` is the output of `brain home`: the data of the user.

The user accepts in chat. "Accept the go-error-wrapping draft" is enough. You run `brain accept-skill`. Do not ask the user to type `/brain-accept-skill`.

## Steps

1. Confirm that the user named the skill and has read `<home>/skills/drafts/NAME/SKILL.md`. When the user did not name it, list `<home>/skills/drafts` and ask.
2. Run `brain accept-skill NAME` in this repo.
3. Run `git -C <home> log -1 --oneline` and show the commit `skill: accept NAME`.

## What the command does

It moves `<home>/skills/drafts/NAME` to `<home>/skills/active/NAME` and commits only that move in the git repo of the home. After the commit, it links the active skills into each path in `mcp/link-targets.txt`.

It rejects a name that is not a slug, a missing draft, and a name that is already active. When the commit fails, it puts the draft back and creates no links. Show the error to the user.

## Limits

After the commit, do not push.
