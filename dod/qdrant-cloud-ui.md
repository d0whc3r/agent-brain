# Standing DoD: qdrant-cloud-ui

Every task in this repo keeps these criteria. `brain dod init` copies them into the DoD of the task. `fix:branch` reads the git diff, so it skips a new untracked file. Add a criterion for each new file of the change, with the check `pnpm run lint --fix <file> && pnpm run format <file>`. `fix:branch` can change files, so the first `brain dod run` can ask for a second run.

- [ ] Lint and format of the tracked files of the branch pass
  - check: `pnpm fix:branch`
  - pass: exit 0
- [ ] The TypeScript build of the app and the scripts has no type errors
  - check: `pnpm run type-check`
  - pass: exit 0
