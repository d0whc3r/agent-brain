---
name: learn
description: "Record a correction as a decision note and, when strength is always or never, as an active premise. Use when Josep states a rule to keep."
metadata:
  opencode/slash: "true"
---

Use this command when Josep states a rule to keep.

Write the note at memory/decisions/YYYY-MM-DD-<slug>.md.

Set date, tool, repo, correction, strength, evidence, and status.

Decision strength is once, always, or never.

When strength is always or never, add an active premise with brain premise add or premise_add. Do not create the premise file by hand.

Premise fields are id, text, strength, repos, status, and source. Premise strength is always, never, or prefer. Set source to the decision path.

Record the same decision in Engram. The topic key is qdrant-review-brain/<slug>. The markdown file is the source.

When the note is saved, do not create a skill.
