---
name: ui-change-verify
description: Lint, type-check, test, and look at a qdrant-cloud-ui change before review.
scopes: [qdrant]
repos: [qdrant-cloud-ui]
kinds: [ui]
skills: [brain-dod]
mcp: [chrome-devtools]
model: sonnet
---

1. Run `git add -N` on each new file of the change, so `fix:branch` sees it.
2. When the DoD has no criterion for the tests of the touched directories, add one. Its command uses `--run`, so vitest does not wait in watch mode.
3. When the DoD has no criterion for the changed page, add a manual one: open the page in the user MCP server `chrome-devtools`, take one screenshot, and read the console.
4. Run `brain dod run`. The standing DoD of qdrant-cloud-ui runs `pnpm fix:branch` and `pnpm run type-check`. Run it again when it says that the checks changed files.
5. Check the page. As the evidence of the manual criterion, write the screenshot path, the number of console errors, and the tree line of `brain dod run`.
6. Run `brain dod lint --done`.

Done when `brain dod lint --done` passes and the screenshot shows the change.
