---
name: ui-change-verify
description: Lint, type-check, test, and look at a qdrant-cloud-ui change before review.
repos: [qdrant-cloud-ui]
kinds: [ui]
mcp: [chrome-devtools]
model: sonnet
---

1. Run `git add -N` on each new untracked file, so `fix:branch` sees it.
2. Run `pnpm fix:branch`. Check that the "Linting N changed file(s)" count includes your files.
3. Run `pnpm run type-check`.
4. Run the tests of the touched directories with `--run`, so vitest does not wait in watch mode.
5. Open the changed page in the user MCP server `chrome-devtools`. Take one screenshot and read the console.

Done when the checks pass and the screenshot shows the change.
