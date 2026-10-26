#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

line='Premises are rules. Skills are workflows. Engram is the session log.'
if ! grep -F -q -e "$line" AGENTS.md; then
  echo "AGENTS.md is missing the premises line" >&2
  exit 1
fi

# A screenshot in a new home must stay out of git. git check-ignore matches the path against
# the ignore rules of the home template, so the file need not exist.
probe="$(mktemp -d)"
trap 'command rm -rf "$probe"' EXIT
git -C "$probe" init -q
command cp -f templates/home/gitignore "$probe/.gitignore"
shot='memory/sessions/screenshots/check.png'
if ! git -C "$probe" check-ignore -q "$shot"; then
  echo "templates/home/gitignore does not ignore $shot" >&2
  exit 1
fi

profile="${HOME}/.local/share/agent-brain/chrome-profile"
repo="$(git rev-parse --show-toplevel)"
case "$profile/" in
  "$repo"/*)
    printf 'the Chrome profile is inside the repo: %s\n' "$profile" >&2
    exit 1
    ;;
esac

echo "layout ok"
