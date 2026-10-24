---
date: 2026-10-24
tool: claude-code
scope: "*"
repo: "*"
correction: A task and a review end only when a concrete Definition of Done passes with fresh evidence.
strength: always
evidence: The user asked for a premise that knows when a task is done, and rejected criteria such as "everything works" or "everything is done". The user chose a DoD file per branch in the git dir, brain dod run for the evidence of command checks, a standing DoD file per repo in dod/, and the replacement of run-check-before-done.
status: open
---

The user asked for this rule explicitly, so it is an active premise: `dod-before-done`.

The standing DoD of each repo, in `dod/<repo>.md`, holds the check of the project. `dod-before-done` covers what `run-check-before-done` asked, so `run-check-before-done` was dropped.
