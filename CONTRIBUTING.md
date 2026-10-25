# Contributing

[Setup history](docs/setup-history.md) records the initial setup evidence.

## Checks

Before a commit, run:

```bash
npm run check
```

This runs each check of the `check` script in `package.json`. oxlint runs with type information and with size and complexity limits for each file and function outside the tests. `npm run fmt` formats the code and the Markdown, with one line per paragraph. `tsconfig.json` gives oxlint the types of the JS files. `.editorconfig` sets the indent, the line ending, and the line width for editors and for oxfmt. [AGENTS.md](AGENTS.md) holds the repo rules.
