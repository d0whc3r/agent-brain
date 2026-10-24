# Standing DoD: qdrant-cloud-ui

Every task in this repo keeps these criteria. `brain dod init` copies them into the DoD of the task. Before `brain dod run`, run `git add -N` on each new file of the change, so `fix:branch` sees it. `fix:branch` can change files, so the first `brain dod run` can ask for a second run.

- [ ] Lint and format of the branch files pass, new files included
  - check: `pnpm fix:branch`
  - pass: exit 0
- [ ] The TypeScript build of the app and the scripts has no type errors
  - check: `pnpm run type-check`
  - pass: exit 0
