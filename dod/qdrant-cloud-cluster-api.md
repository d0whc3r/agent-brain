# Standing DoD: qdrant-cloud-cluster-api

Every task in this repo keeps these criteria. `brain dod init` copies them into the DoD of the task.

- [ ] Format, type checks, and lint of the Python code pass
  - check: `make dev.format.check dev.typecheck dev.lint`
  - pass: exit 0
- [ ] The test suite passes, and it stops at the first failure
  - check: `make dev.test`
  - pass: exit 0
