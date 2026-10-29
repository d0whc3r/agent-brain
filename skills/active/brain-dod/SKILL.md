---
name: brain-dod
description: "Define a concrete Definition of Done (DoD) before a task changes files in a git repo, and close it with fresh evidence before you call the task done. Runs brain dod list, path, init, lint, and run on the DoD file of the task, one per task, which keeps the standing criteria of the repo from dod/<repo>.md. Use when work on a task starts, before a review or a PR, when the user asks for the DoD or asks whether a task is done, or says define el DoD or cuándo está terminado."
metadata:
  opencode/slash: "true"
---

# Definition of Done

A task is done when each criterion of its DoD has fresh evidence. "Everything works" names no check, so it cannot fail and proves nothing. The premise `dod-before-done` holds the rule.

`<brain>` is the output of `brain root`. `<home>` is the output of `brain home`: the data of the user. Each `brain dod` command takes `--cwd <dir>` for a repo or a worktree other than the current directory, and `--task <slug>` for a task other than the branch.

## When

- A task that changes files in a git repo needs a DoD: code, config, docs, or a skill. Define it before you change the first file.
- A question, an explanation, a one-line answer, or a read-only review of the branch of another author needs no DoD of its own. The `review-branch` flow writes the DoD of that PR in the review worktree.
- A note that a brain skill writes as one of its steps needs no DoD, such as a premise from `brain-learn` or a session note from `brain-reviewer`.
- Each task has its own DoD, and each worktree has its own DoDs. On a feature branch, the task is the branch. On the default branch, from `origin/HEAD` or else `main` and `master`, each task takes `--task <ticket key or slug>`, and `brain dod` exits 1 without it. A sub-task on a feature branch, such as a merge of main or a fix after a review, takes its own `--task`, so the DoD of the branch keeps its criteria. A task that changes two repos has one DoD in each.

## Define

1. Run `brain dod list`. It prints the date, the task, and the title of each DoD of the worktree.
2. Name the task. The task of a feature branch takes no flag. On the default branch, or for a sub-task, pick `--task <ticket key or slug>`, and pass it to each `brain dod` command of this task. When a DoD in the list has a title that names this task, use its task.
3. Run `brain dod path`. When the file does not exist, run `brain dod init --title <ticket key or slug>`. When the file exists and its title names another task, do not add the criteria of this task to it: name a new `--task`. Run `brain dod init --replace` only to restart the DoD of the same task, after the user agrees.
4. When `brain dod init` prints `no dod/<repo>.md in the brain home`, the repo has no standing DoD. Find its check in the CI config, the Makefile, `package.json`, or `CONTRIBUTING.md`, and propose it to the user. After the user agrees, write `<home>/dod/<repo>.md` in the form of the other files in `<brain>/dod/`, and run `brain dod init --replace --title <ticket key or slug>` with the same `--task`. Without that agreement, write the check in the placeholder criterion of this DoD only.
5. Read the ticket, the plan, or the request. Replace the `<outcome>` placeholder with one criterion per requirement, as `templates/dod.md` describes. Keep each standing criterion.
6. When a criterion has no check or no pass condition, ask the user with `brain-tp-grilling`: one question at a time, each with a recommended answer. Look up commands and test names yourself.
7. Add a criterion for an error path when the change handles input. For a test check, name the change to the code that makes the test fail.
8. Run `brain dod lint` until it prints `ok`. Show the DoD, and ask the user to approve it. Change no file of the task before the approval.

## Close

1. When the file that `brain dod path` prints does not exist, run Define first. A DoD written after the work still needs the approval of the user.
2. Run `brain dod run` after the last change to the code. Its first line is the tree line, `tree <hash>`. Run it again when it says that the checks changed files. Fix each failed check, or ask the user when a criterion is wrong. After a fix, run it again.
3. Check each manual criterion yourself. Mark it `- [x]`, and write its evidence: what you saw, with the path of a screenshot in the screenshot folder that the session context names, the text on the page, or a number, and the tree line of the last `brain dod run`.
4. Run `brain dod lint --done`. The task is done only when it prints `ok`. Show that output.

## Limits

- Change a criterion only with the user. Do not drop a criterion to make the lint pass.
- The DoD file lives in the git dir of the worktree. Do not copy it into the repo.
- A DoD holds the criteria of one task. A criterion of another task goes into the DoD of that task.
- A standing criterion belongs to `<home>/dod/<repo>.md`. Write or edit that file only after the user agrees, because every task of the repo keeps it.
