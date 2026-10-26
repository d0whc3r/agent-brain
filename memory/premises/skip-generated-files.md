---
id: skip-generated-files
text: Read a lock file or another generated file, such as pnpm-lock.yaml, package-lock.json, yarn.lock, uv.lock, Cargo.lock, go.sum, a minified bundle, or a build output, in full or in a diff.
strength: never
scope: "*"
repos:
  - "*"
status: active
source: ""
---

Why: A tool writes these files, and nobody reviews them line by line. A lock file can hold thousands of lines, so reading it spends tokens and adds nothing to the task.

Leave them out of a diff with a pathspec, such as `git diff -- . ':!pnpm-lock.yaml' ':!package-lock.json' ':!uv.lock'`. Leave `node_modules/`, `.venv/`, `dist/`, and `build/` out of a search. `rg` skips them when `.gitignore` lists them.

When the task is about one of these files, such as a dependency version, a merge conflict, or an audit finding, search the file for that entry with `rg` and read only the lines around the match.
