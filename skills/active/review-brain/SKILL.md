---
name: review-brain
description: "Review the current diff against active premises and qdrant-personal-review. Use when Josep asks for a brain review. Call premise_list first. Do not edit the diff."
metadata:
  opencode/slash: "true"
---

Load qdrant-personal-review before the review.

Call premise_list for the repo Josep names. Apply every active always premise and every active never premise. Quote each premise you applied.

A prefer premise is a note. Treat it as a failure only after Josep marks that premise always.

Read skills/third-party.json. Use a catalog entry only when its flow matches the diff and that skill is already installed. Do not install a catalog skill in this turn.

Review the current diff. Put findings first, with file and line. Put simplify notes and performance notes next. Tie each of those notes to a measurement or to concrete duplication. End with a suggested /learn line when Josep rejects a finding.

Append memory/sessions/YYYY-MM-DD.md. Set date, tool, repo, finding_count, and decision_links. Omit file contents, secrets, and customer data.

The review writes findings only. After the findings, do not edit the diff.
