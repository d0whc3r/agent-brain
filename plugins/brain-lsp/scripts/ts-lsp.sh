#!/usr/bin/env bash
# Start the TypeScript language server of the project in CLAUDE_PROJECT_DIR, or else in the
# current folder. TypeScript 7 has its own server, `tsc --lsp`, and no tsserver.js, which
# typescript-language-server needs. Older TypeScript gets the typescript-language-server that
# scripts/install.sh adds with npm install -g.
set -euo pipefail

project="${CLAUDE_PROJECT_DIR:-$PWD}"
major="$(sed -n 's/^ *"version": *"\([0-9]*\)\..*/\1/p' "$project/node_modules/typescript/package.json" 2>/dev/null | head -n 1 || true)"
if [ "${major:-0}" -ge 7 ]; then
  exec "$project/node_modules/.bin/tsc" --lsp -stdio
fi

if ! command -v typescript-language-server >/dev/null 2>&1; then
  echo "ts-lsp: typescript-language-server not found. Run scripts/install.sh in the brain checkout." >&2
  exit 1
fi
exec typescript-language-server --stdio
