---
id: dod-before-done
text: "Before a task changes files in a git repo, agree its Definition of Done with the brain-dod skill, and call the task done only when brain dod lint --done prints ok."
strength: always
scope: "*"
repos:
  - "*"
status: candidate
source: ""
---

Why: "Everything works" checks nothing. A criterion that names its check and its pass condition can fail, and evidence for the current tree shows that it did not.

Each criterion names an observable outcome, a check, a concrete pass condition, and fresh evidence, as `templates/dod.md` describes.

A question, an explanation, a one-line answer, and a read-only review of the branch of another author need no DoD of their own. A note that a brain skill writes as one of its steps, such as a premise or a session note, needs none either.

Each review reports the result of `brain dod lint` and `brain dod lint --done`, as the Definition of Done section of `brain-reviewer` describes.
