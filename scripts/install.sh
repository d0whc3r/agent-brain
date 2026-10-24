#!/usr/bin/env bash
# Install or update the review brain for the current user.
# Safe to run again: each step replaces what an earlier run created.
#
#   BRAIN_BIN_DIR    directory for the brain command (default: $HOME/.local/bin)
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
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

step "Link brain and third-party skills"
targets=()
while IFS= read -r line; do
  if [ -n "$line" ]; then
    targets+=(--target "${line/#\~/$HOME}")
  fi
done < mcp/link-targets.txt
node bin/brain.mjs link-skills --apply "${targets[@]}"

step "Link agents"
link_agents() {
  local from="$1" to="$2"
  mkdir -p "$to"
  # A link into this checkout whose agent is gone came from an older version.
  for link in "$to"/*.md; do
    if [ -L "$link" ] && [[ "$(readlink "$link")" == "$from/"* ]] && [ ! -e "$link" ]; then
      command rm -f "$link"
      echo "removed $link"
    fi
  done
  for agent in "$from"/*.md; do
    ln -sfn "$agent" "$to/$(basename "$agent")"
    echo "$to/$(basename "$agent") -> $agent"
  done
}
link_agents "$root/agents" "$HOME/.claude/agents"
if [ -d "$HOME/.config/opencode" ]; then
  node scripts/setup-config.mjs opencode-agents >/dev/null
  link_agents "$root/.agents/linked/opencode-agents" "$HOME/.config/opencode/agents"
fi

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

step "Add the session premises hooks"
node scripts/setup-config.mjs hooks-apply

step "Ask before git commit, push, and destructive git commands"
node scripts/setup-config.mjs guard-add

step "Register MCP servers in Codex"
node scripts/setup-config.mjs codex-add

step "Add the brain instructions to Codex"
node scripts/setup-config.mjs instructions-add "$HOME/.codex/AGENTS.md"

step "Write the install receipt"
receipt=(--bin-dir "$bin_dir" "${targets[@]}")
if command -v claude >/dev/null 2>&1; then
  receipt+=(--claude)
fi
node bin/brain.mjs installed write "${receipt[@]}"

step "Verify"
node bin/brain.mjs skills check
node bin/brain.mjs premise list >/dev/null
echo "brain premise list works."
"$bin_dir/brain" mcp check

cat <<MSG

Done. Start a new Claude Code, Codex, or OpenCode session to load the changes.
Codex skips a new hook until you trust it in /hooks.
OpenCode reads its MCP servers and AGENTS.md from dotfiles. Add brain-premises and chrome-devtools
there from mcp/snippets/, and paste templates/agent-instructions.md into that AGENTS.md.
Run "brain installed" to list what this install put on disk.
Run this script again after a pull or a skill change. It is also the update.
MSG
