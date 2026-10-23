---
name: review-branch
description: Review the branch or PR of another author with one agent per lens, then verify the findings.
skills: [brain-reviewer, brain-tp-differential-review, brain-tp-doubt-driven-development]
agents: [brain-reviewer]
mcp: [brain-premises]
model: opus
---

1. Get the branch or the PR number from the user. Run `git fetch origin`. For a PR, check it out in a worktree next to the repo: `git worktree add ../<repo>-review-<n> origin/<branch>`. Keep the working tree of the user as it is.
2. Run `brain scope` in the worktree, and read the PR description and the linked ticket.
3. Run the `brain-reviewer` agent once per lens, in parallel when the tool allows it. In Codex and OpenCode, run the lenses one after another in this session.
   - `premises` with opus.
   - `security` with sonnet.
   - `tests` with sonnet.
   - `simplify` with haiku.
4. In Claude Code, you can add `ecc:silent-failure-hunter` and `ecc:pr-test-analyzer` to the `tests` lens, and `ponytail-review` to the `simplify` lens, when the user wants more depth.
5. Merge the results with opus. Drop duplicates. Run the adversarial check of `brain-tp-doubt-driven-development` on each finding, and drop each one that fails.
6. Show the findings as draft PR comments, each with file, line, and the premise or lens that produced it. Post nothing unless the user asks.
7. Remove the worktree with `git worktree remove` when the user is done.

Done when each finding has an answer from the user and the session note exists in `memory/sessions/`.
