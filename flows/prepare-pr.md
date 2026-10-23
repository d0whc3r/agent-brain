---
name: prepare-pr
description: Run the checks and draft the PR for a clean feature branch with no PR.
branch: feature
dirty: false
pr: none
skills: [git-workflow-and-versioning]
model: sonnet
---

1. Run the checks of the repo: `pnpm fix:branch` and `pnpm run type-check` in qdrant-cloud-ui, `make dev.format.check dev.typecheck dev.lint` and the tests in qdrant-cloud-cluster-api, `buf lint` in qdrant-cloud-public-api.
2. Draft the PR title and body. The body describes the final state only, not work that was added and then removed.
3. Check the premises: no Co-Authored-By trailer and no Claude footer.
4. Show the draft. Push and create the PR only when the user asks.

Done when the user has the draft, or the PR exists because the user asked.
