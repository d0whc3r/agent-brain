---
name: brain-dod
description: "Define a concrete Definition of Done (DoD) before a task changes files in a git repo, and close it with fresh evidence before you call the task done. Runs brain dod path, init, lint, and run on the DoD file of the branch, which keeps the standing criteria of the repo from dod/<repo>.md. Use when work on a task starts, before a review or a PR, when the user asks for the DoD or asks whether a task is done, or says define el DoD or cuándo está terminado."
metadata:
  opencode/slash: "true"
---

# Definition of Done

A task is done when each criterion of its DoD has fresh evidence. "Everything works" names no check, so it cannot fail and proves nothing. The premise `dod-before-done` holds the rule.

`<brain>` is the output of `brain root`. `<home>` is the output of `brain home`: the data of the user. Each `brain dod` command takes `--cwd <dir>` for a repo or a worktree other than the current directory.

## When

- A task that changes files in a git repo needs a DoD: code, config, docs, or a skill. Define it before you change the first file.
- A question, an explanation, a one-line answer, or a read-only review of the branch of another author needs no DoD of its own. The `review-branch` flow writes the DoD of that PR in the review worktree.
- A note that a brain skill writes as one of its steps needs no DoD, such as a premise from `brain-learn` or a session note from `brain-reviewer`.
- The DoD belongs to the branch, and each worktree has its own. A task that changes two repos has one DoD in each.

## Define

1. Run `brain dod path`. It prints the DoD file of the branch.
2. When the file does not exist, run `brain dod init --title <ticket key or slug>`.
3. When the file exists, read its title on the first line. On a long-lived branch such as `main` or `master`, the file can hold the DoD of an earlier task. When the title names another task, show the DoD to the user. Run `brain dod init --replace --title <ticket key or slug>` only after the user agrees.
4. When `brain dod init` prints `no dod/<repo>.md in the brain home`, the repo has no standing DoD. Find its check in the CI config, the Makefile, `package.json`, or `CONTRIBUTING.md`, and propose it to the user. After the user agrees, write `<home>/dod/<repo>.md` in the form of the other files in `<brain>/dod/`, and run `brain dod init --replace --title <ticket key or slug>`. Without that agreement, write the check in the placeholder criterion of this DoD only.
5. Read the ticket, the plan, or the request. Replace the `<outcome>` placeholder with one criterion per requirement, as `templates/dod.md` describes. Keep each standing criterion.
6. When a criterion has no check or no pass condition, ask the user with `brain-tp-grilling`: one question at a time, each with a recommended answer. Look up commands and test names yourself.
7. Add a criterion for an error path when the change handles input. For a test check, name the change to the code that makes the test fail.
8. Run `brain dod lint` until it prints `ok`. Show the DoD, and ask the user to approve it. Change no file of the task before the approval.

## Close

1. When the file that `brain dod path` prints does not exist, run Define first. A DoD written after the work still needs the approval of the user.
2. Run `brain dod run` after the last change to the code. Its first line is the tree line, `tree <hash>`. Run it again when it says that the checks changed files. Fix each failed check, or ask the user when a criterion is wrong. After a fix, run it again.
3. Check each manual criterion yourself. Mark it `- [x]`, and write its evidence: what you saw, with a screenshot path, the text on the page, or a number, and the tree line of the last `brain dod run`.
4. Run `brain dod lint --done`. The task is done only when it prints `ok`. Show that output.

## Limits

- Change a criterion only with the user. Do not drop a criterion to make the lint pass.
- The DoD file lives in the git dir of the worktree. Do not copy it into the repo.
- A standing criterion belongs to `<home>/dod/<repo>.md`. Write or edit that file only after the user agrees, because every task of the repo keeps it.
