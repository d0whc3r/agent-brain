---
name: review-branch
description: Review the branch or PR of another author with one agent per lens, then verify the findings.
skills: [brain-tp-differential-review, brain-tp-doubt-driven-development]
agents: [brain-reviewer]
mcp: [brain-premises]
model: opus
---

1. Get the branch or the PR number from the user. Keep the working tree of the user as it is. For a PR, fetch its head from the base repo, because the head branch of a fork is not on `origin`: `git fetch origin pull/<n>/head`, then `git worktree add --detach ../<repo>-review-<n> FETCH_HEAD`. Read the base and head commits with `gh pr view <n> --json baseRefOid,headRefOid`. For a branch, run `git fetch origin`, then `git worktree add --detach ../<repo>-review-<slug> origin/<branch>`.
2. Run `brain scope` in the worktree, and read the PR description and the linked ticket. Run `brain dod init` in the worktree, and replace its placeholder criterion with the DoD or the test plan of the PR, in the form of `templates/dod.md`. When the PR has none, delete the placeholder: the review reports the missing DoD. Before `brain dod run`, show the user the commands of the DoD and the PR diff of the files they load, such as `package.json`, the Makefile, and the tests, because the commands run code from the PR with the credentials of the user. Run it only after the user agrees.
3. Run the `brain-reviewer` agent once per lens, in parallel when the tool allows it. In Codex and OpenCode, run the lenses one after another in this session. Give each lens the PR number, the base and head commits, the PR description, the ticket summary, and the worktree path for `brain dod lint --cwd`, as `brain-tp-requesting-code-review` describes.
   - `premises` with opus.
   - `security` with sonnet.
   - `tests` with sonnet.
   - `simplify` with sonnet, because it judges structural blockers.
4. In Claude Code, you can add `ecc:silent-failure-hunter` and `ecc:pr-test-analyzer` to the `tests` lens, and `ponytail-review` to the `simplify` lens, when the user wants more depth.
5. Merge the results with opus. Drop duplicates. Run the adversarial check of `brain-tp-doubt-driven-development` on each finding, and drop each one that fails. Keep the severity prefix of each finding, and order by leverage. Write one session note for the review, as the Session note section of `brain-reviewer` describes, with the union of `applied` and of `hits` over the lenses.
6. Show the findings as draft PR comments, each with severity, file, line, and the premise or lens that produced it. End with one verdict from the lens verdicts: Request changes when one lens has a `Critical:` or required finding. Post nothing unless the user asks.
7. For each finding the user accepts that names a defect class, and not a one-off slip, find a premise or a candidate that states it with `brain premise search`. Record the repeat with `brain premise seen <id> --repo <repo> --origin defect`. When none exists, add a candidate with `--status candidate` first. Store nothing for a one-off finding.
8. Remove the worktree with `git worktree remove` when the user is done.

Done when each finding has an answer from the user and the session note exists in `memory/sessions/` of the brain home.
