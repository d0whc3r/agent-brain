#!/usr/bin/env bash
# Fail when an instruction file names an absolute home path. Skills, agents, and flows find
# the brain with `brain root` and a scope root with `brain scope`, so a moved checkout works.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# A pattern that matches nothing stays as text, so keep only the files that exist.
# grep exits 2 on a missing file, and that exit hid each match.
files=()
for file in AGENTS.md README.md templates/*.md docs/*.md flows/*.md agents/*.md skills/active/*/SKILL.md memory/premises/*.md; do
  if [ -f "$file" ]; then
    files+=("$file")
  fi
done
if [ "${#files[@]}" -eq 0 ]; then
  echo "no instruction files to check in $root" >&2
  exit 1
fi

status=0
grep -n -E '(/Users/|/home/)[A-Za-z0-9._-]+' "${files[@]}" || status=$?
if [ "$status" -eq 0 ]; then
  echo "absolute home path found. Use brain root, the scope root from brain scope, or ~/." >&2
  exit 1
fi
if [ "$status" -ne 1 ]; then
  echo "grep failed with exit $status" >&2
  exit "$status"
fi
echo "paths ok"
