---
name: prepare-pr
description: Run the checks and draft the PR for a clean feature branch with no PR.
branch: feature
dirty: false
pr: none
skills: [brain-tp-git-workflow-and-versioning, brain-tp-verification-before-completion, brain-dod]
model: sonnet
---

1. Close the DoD with `brain-dod`. Its command checks keep the standing checks of the repo from `dod/<repo>.md`, and each manual criterion needs evidence that you write.
2. Run `brain dod lint --done`. The branch is ready only when it prints `ok`.
3. Draft the PR title and body. The body describes the final state only, not work that was added and then removed. Put each criterion of the DoD and its evidence in the test notes of the body.
4. Check the premises: no Co-Authored-By trailer and no Claude footer.
5. Before you say the branch is ready, show the output of `brain dod lint --done` and of each failed check, as `brain-tp-verification-before-completion` describes.
6. Show the draft. Push and create the PR only when the user asks.

Done when `brain dod lint --done` passes and the user has the draft, or the PR exists because the user asked.
