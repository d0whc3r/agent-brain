#!/usr/bin/env bash
set -euo pipefail

# npx skills copies only the skill folder. Skills from addyosmani/agent-skills link
# ../../references/<file>.md, which resolves to .agents/references/ in this repo.
# This script downloads each linked file from that repo.

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

base='https://raw.githubusercontent.com/addyosmani/agent-skills/main/references'
mkdir -p .agents/references
for name in $(grep -rhoE '\.\./\.\./references/[a-z-]+\.md' .agents/skills | sed 's#.*/##' | sort -u); do
  if ! curl -fsSL "$base/$name" -o ".agents/references/$name"; then
    printf 'download failed: %s/%s\n' "$base" "$name" >&2
    exit 1
  fi
  printf 'synced .agents/references/%s\n' "$name"
done
