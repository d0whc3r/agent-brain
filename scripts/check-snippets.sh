#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

chrome="mcp/snippets/chrome-devtools.json"
if [ ! -f "$chrome" ]; then
  fail "missing $chrome"
fi

need() {
  local text="$1"
  if ! grep -F -q -e "$text" "$chrome"; then
    fail "$chrome is missing: $text"
  fi
}

need "--no-usage-statistics"
need "--redact-network-headers"
need '${HOME}/.local/share/qdrant-review-brain/chrome-profile'

if grep -F -q -e "--isolated" "$chrome"; then
  fail "$chrome contains --isolated"
fi

if grep -F -q -e "--autoConnect" "$chrome"; then
  fail "$chrome contains --autoConnect"
fi

if git ls-files --error-unmatch -- mcp/snippets/obsidian.key >/dev/null 2>&1; then
  fail "mcp/snippets/obsidian.key is tracked by git"
fi

exit 0
