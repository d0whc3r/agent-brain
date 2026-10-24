#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

line='Premises are rules. Skills are workflows. Engram is the session log.'
if ! grep -F -q -e "$line" AGENTS.md; then
  echo "AGENTS.md is missing the premises line" >&2
  exit 1
fi

# git check-ignore matches the path against the ignore rules, so the file need not exist.
shot='memory/sessions/screenshots/check.png'
if ! git check-ignore -q "$shot"; then
  echo "git check-ignore failed for $shot" >&2
  exit 1
fi

profile="${HOME}/.local/share/qdrant-review-brain/chrome-profile"
repo="$(git rev-parse --show-toplevel)"
case "$profile/" in
  "$repo"/*)
    printf 'the Chrome profile is inside the repo: %s\n' "$profile" >&2
    exit 1
    ;;
esac

echo "layout ok"
