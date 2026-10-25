#!/usr/bin/env bash
# Remove what install.sh added for the current user.
# Keeps the repo, its memory, node_modules, and the Chrome profile.
#
#   BRAIN_BIN_DIR    directory of the brain command (default: $HOME/.local/bin)
#   NO_COLOR         print without colors
set -euo pipefail

# shellcheck source=ui.sh
. "$(dirname "$0")/ui.sh"

root="$(cd "$(dirname "$0")/.." && pwd)"
bin_dir="${BRAIN_BIN_DIR:-$HOME/.local/bin}"
profile="$HOME/.local/share/agent-brain/chrome-profile"
cd "$root"

step "Remove what the install receipt lists"
receipt="$(node bin/brain.mjs installed remove)"
case "$receipt" in
  "no receipt" | "receipt belongs to"*) skip "$receipt" ;;
  *)
    # The receipt prints one line for each item, but it removes only the links.
    # The steps below remove the MCP servers, the hooks, the guard, and the instructions.
    ok "removed links: $(cut -f2 <<<"$receipt" | grep -E '^(agents|bin|skills)$' | tally)"
    ;;
esac

step "Remove skill links"
# bash 3.2 does not stop on a missing input file, so check it first.
if [ ! -f mcp/link-targets.txt ]; then
  fail "missing mcp/link-targets.txt. It lists the skill folders, one path on each line."
fi
while IFS= read -r target; do
  target="${target/#\~/$HOME}"
  if [ -z "${target//[[:space:]]/}" ]; then
    continue
  fi
  removed=0
  for link in "$target"/*; do
    target_of="$(readlink "$link" 2>/dev/null || true)"
    if [ -L "$link" ] && { [[ "$target_of" == "$root/skills/active/"* ]] || [[ "$target_of" == "$root/.agents/skills/"* ]] || [[ "$target_of" == "$root/.agents/linked/"* ]]; }; then
      command rm -f "$link"
      removed=$((removed + 1))
    fi
  done
  if [ "$removed" -gt 0 ]; then
    ok "removed $removed links from $target"
  else
    skip "no brain links in $target"
  fi
done < mcp/link-targets.txt

step "Remove agent links"
removed=0
for link in "$HOME/.claude/agents"/*.md "$HOME/.config/opencode/agents"/*.md; do
  if [ -L "$link" ] && { [[ "$(readlink "$link")" == "$root/agents/"* ]] || [[ "$(readlink "$link")" == "$root/.agents/linked/"* ]]; }; then
    command rm -f "$link"
    ok "removed $link"
    removed=$((removed + 1))
  fi
done
if [ "$removed" -eq 0 ]; then
  skip "no brain agent links"
fi

step "Remove the brain command"
if [ -L "$bin_dir/brain" ] && [ "$(readlink "$bin_dir/brain")" = "$root/bin/brain.mjs" ]; then
  command rm -f "$bin_dir/brain"
  ok "removed $bin_dir/brain"
else
  skip "no brain command in $bin_dir"
fi

step "Remove MCP servers from Claude Code"
if command -v claude >/dev/null 2>&1; then
  for name in brain-premises chrome-devtools; do
    if claude mcp remove -s user "$name" >/dev/null 2>&1; then
      ok "removed $name"
    else
      skip "$name was not registered"
    fi
  done
else
  skip "claude not found. Skipped."
fi

step "Remove the session premises hooks"
node scripts/setup-config.mjs hooks-remove | report

step "Remove the git confirmation rules"
node scripts/setup-config.mjs guard-remove | report

step "Remove MCP servers from Codex"
node scripts/setup-config.mjs codex-remove | report

step "Remove the brain instructions from Codex"
node scripts/setup-config.mjs instructions-remove "$HOME/.codex/AGENTS.md" | report

step "Remove the generated copies"
if [ -d "$root/.agents/linked" ]; then
  command rm -rf "$root/.agents/linked"
  ok "removed $root/.agents/linked"
else
  skip "no generated copies"
fi

printf '\n%s✓ Removed the brain setup.%s Kept:\n' "$green$bold" "$reset"
cat <<MSG
  $root (repo and memory)
  $profile (Chrome test logins). Remove it with: rm -rf "$profile"
Run scripts/install.sh to install again.
MSG
