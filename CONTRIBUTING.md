# Contributing

[Setup history](docs/setup-history.md) records the initial setup evidence.

## Checks

Before a commit, run:

```bash
npm run check
```

This runs each check of the `check` script in `package.json`. oxlint runs with type information and with size and complexity limits for each file and function outside the tests. `npm run fmt` formats the code and the Markdown, with one line per paragraph. `tsconfig.json` gives oxlint the types of the JS files. `.editorconfig` sets the indent, the line ending, and the line width for editors and for oxfmt. [AGENTS.md](AGENTS.md) holds the repo rules.

## Releases

The version in `package.json` follows [semver](https://semver.org). The `brain-premises` server reports it as `<version>+<hash>`, where the hash identifies the loaded code.

[release-please](https://github.com/googleapis/release-please) reads the Conventional Commits on `master`. On each push, it opens or updates a release pull request. That pull request sets the next version in `package.json` and `.release-please-manifest.json`, and adds the changes to `CHANGELOG.md`. Merge it to tag the release as `v<version>` and to publish a GitHub release.

The tool contract of the MCP server is the public API. Pick the commit type from this table:

| Change | Commit | Bump |
| --- | --- | --- |
| Remove or rename a tool or a field, add a required field, or change what a field means | `feat!:` or a `BREAKING CHANGE:` footer | major |
| Add a tool, an optional field, a CLI command, or a skill | `feat:` | minor |
| Fix a defect, or the text of a tool description or of the server instructions | `fix:` | patch |

Before 1.0.0, a breaking change bumps the minor version. A `docs:`, `chore:`, or `ci:` commit alone makes no release.

The workflow needs "Allow GitHub Actions to create and approve pull requests" under Settings > Actions > General. The release pull request does not start `ci.yml`, because GitHub starts no workflow for a pull request that `GITHUB_TOKEN` opens. The merge to `master` starts it.
