#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

line='Premises are rules. Skills are workflows. Engram is the session log.'
if ! grep -F -q -e "$line" AGENTS.md; then
  echo "AGENTS.md is missing the premises line" >&2
  exit 1
fi

shots='memory/sessions/screenshots'
mkdir -p "$shots"
shot="$(mktemp "$shots/check-XXXXXX")"
cleanup() {
  command rm -f "$shot"
}
trap cleanup EXIT
if ! git check-ignore -q "$shot"; then
  echo "git check-ignore failed for $shot" >&2
  exit 1
fi
command rm -f "$shot"
trap - EXIT

profile="${HOME}/.local/share/qdrant-review-brain/chrome-profile"
repo="$(git rev-parse --show-toplevel)"
case "$profile/" in
  "$repo"/*)
    printf '%s\n' "$profile"
    exit 1
    ;;
esac

exit 0
