#!/usr/bin/env bash
# Remove what install.sh added for the current user.
# Keeps the repo, its memory, node_modules, and the Chrome profile.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
bin_dir="${BRAIN_BIN_DIR:-$HOME/.local/bin}"
profile="$HOME/.local/share/qdrant-review-brain/chrome-profile"
cd "$root"

step() {
  printf '\n== %s\n' "$1"
}

step "Remove skill links"
while IFS= read -r target; do
  target="${target/#\~/$HOME}"
  if [ -z "$target" ] || [ ! -d "$target" ]; then
    continue
  fi
  for link in "$target"/*; do
    target_of="$(readlink "$link" 2>/dev/null || true)"
    if [ -L "$link" ] && { [[ "$target_of" == "$root/skills/active/"* ]] || [[ "$target_of" == "$root/.agents/skills/"* ]]; }; then
      rm "$link"
      echo "rm $link"
    fi
  done
done < mcp/link-targets.txt

step "Remove agent links"
for link in "$HOME/.claude/agents"/*.md; do
  if [ -L "$link" ] && [[ "$(readlink "$link")" == "$root/agents/"* ]]; then
    rm "$link"
    echo "rm $link"
  fi
done

step "Remove the brain command"
if [ -L "$bin_dir/brain" ] && [ "$(readlink "$bin_dir/brain")" = "$root/bin/brain.mjs" ]; then
  rm "$bin_dir/brain"
  echo "rm $bin_dir/brain"
fi

step "Remove MCP servers from Claude Code"
if command -v claude >/dev/null 2>&1; then
  for name in brain-premises chrome-devtools; do
    claude mcp remove -s user "$name" 2>/dev/null || echo "$name was not registered."
  done
else
  echo "claude not found. Skipped."
fi

step "Remove the SessionStart premises hook"
node scripts/setup-config.mjs hook-remove

step "Remove the git confirmation rules"
node scripts/setup-config.mjs guard-remove

step "Remove MCP servers from Codex"
node scripts/setup-config.mjs codex-remove

cat <<MSG

Done. Kept:
  $root (repo and memory)
  $profile (Chrome test logins). Remove it with: rm -rf "$profile"
MSG
