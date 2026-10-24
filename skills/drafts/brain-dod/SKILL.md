---
name: brain-dod
description: "Define a concrete Definition of Done (DoD) for a task, and verify it before the task or the review ends. Use when the user asks for the DoD, asks when a task is done, says define el DoD or cuándo está terminado, or before a review or a PR."
metadata:
  opencode/slash: "true"
---

# Definition of Done

A task is done when each criterion of its DoD has fresh evidence. "Everything works" names no check, so it cannot fail and proves nothing.

## Define

1. Run `brain dod path`. When the file does not exist, run `brain dod init --title <ticket key or slug>`. The new file keeps the standing criteria of the repo from `dod/<repo>.md`. When the file exists, compare its title with the task. When it belongs to another task, show it to the user, and run `brain dod init --replace` only after the user agrees.
2. Read the ticket, the plan, or the request. Write one criterion per requirement, as `templates/dod.md` describes.
3. When a criterion has no check or no pass condition, ask the user with `brain-tp-grilling`: one question at a time, each with a recommended answer. Look up commands and test names yourself.
4. Add a criterion for an error path when the change handles input. For a test check, name the change to the code that makes the test fail.
5. Run `brain dod lint` until it prints `ok`. Show the DoD, and ask the user to approve it.

## Close

1. Run `brain dod run`. Run it again when it says that the checks changed files. Fix each failed check, or ask the user when a criterion is wrong.
2. Check each manual criterion yourself, and write its evidence: a screenshot path, the text on the page, or a number, and the tree line of `brain dod run`.
3. Run `brain dod lint --done`. The task is done only when it prints `ok`. Show that output.

## Limits

- Change a criterion only with the user. Do not drop a criterion to make the lint pass.
- The DoD file lives in the git dir of the worktree. Do not copy it into the repo.
- A standing criterion belongs to `dod/<repo>.md`. Edit that file only when the user asks, because every task of the repo keeps it.
