#!/usr/bin/env bash
# Fail when an instruction file names an absolute home path. Skills, agents, and flows find
# the brain with `brain root` and a scope root with `brain scope`, so a moved checkout works.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

files=(AGENTS.md README.md templates/*.md docs/*.md flows/*.md agents/*.md skills/active/*/SKILL.md memory/premises/*.md)
if grep -n -E '(/Users/|/home/)[A-Za-z0-9._-]+' "${files[@]}" 2>/dev/null; then
  echo "absolute home path found. Use brain root, the scope root from brain scope, or ~/." >&2
  exit 1
fi
