#!/usr/bin/env bash
# Install or update the review brain for the current user.
# Safe to run again: each step replaces what an earlier run created.
#
#   BRAIN_WORKSPACE  directory that holds the repos (default: $HOME/projects/qdrant)
#   BRAIN_BIN_DIR    directory for the brain command (default: $HOME/.local/bin)
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
workspace="${BRAIN_WORKSPACE:-$HOME/projects/qdrant}"
bin_dir="${BRAIN_BIN_DIR:-$HOME/.local/bin}"
profile="$HOME/.local/share/qdrant-review-brain/chrome-profile"
cd "$root"

step() {
  printf '\n== %s\n' "$1"
}

step "Check tools"
major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$major" -lt 20 ]; then
  echo "node 20 or later is required. Found $(node --version)." >&2
  exit 1
fi
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile
else
  npm install
fi

step "Link the brain command"
mkdir -p "$bin_dir"
ln -sfn "$root/bin/brain.mjs" "$bin_dir/brain"
echo "$bin_dir/brain -> $root/bin/brain.mjs"
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) echo "Add $bin_dir to PATH: export PATH=\"$bin_dir:\$PATH\"" ;;
esac

step "Link active skills"
targets=()
while IFS= read -r line; do
  if [ -n "$line" ]; then
    targets+=(--target "${line/#\~/$HOME}")
  fi
done < mcp/link-targets.txt
node bin/brain.mjs link-skills --apply "${targets[@]}"

step "Link agents"
mkdir -p "$HOME/.claude/agents"
for agent in agents/*.md; do
  ln -sfn "$root/$agent" "$HOME/.claude/agents/$(basename "$agent")"
  echo "$HOME/.claude/agents/$(basename "$agent") -> $root/$agent"
done

step "Create the Chrome profile directory"
mkdir -p "$profile"
echo "$profile"

step "Register MCP servers in Claude Code"
if command -v claude >/dev/null 2>&1; then
  for name in brain-premises chrome-devtools; do
    claude mcp remove -s user "$name" >/dev/null 2>&1 || true
    claude mcp add-json -s user "$name" "$(node scripts/setup-config.mjs claude-json "$name")"
  done
else
  echo "claude not found. Skipped."
fi

step "Add the SessionStart premises hook"
node scripts/setup-config.mjs hook-add "BRAIN_WORKSPACE=$workspace node $root/bin/session-premises.mjs 2>/dev/null || true"

step "Register MCP servers in Codex"
node scripts/setup-config.mjs codex-add

step "Verify"
node bin/brain.mjs skills check
node bin/brain.mjs premise list >/dev/null
echo "brain premise list works."

cat <<MSG

Done. Start a new Claude Code or Codex session to load the changes.
OpenCode reads its MCP servers from dotfiles. Add brain-premises and chrome-devtools there from mcp/snippets/.
Run this script again after a pull or a skill change. It is also the update.
MSG
