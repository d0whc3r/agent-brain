#!/usr/bin/env bash
# Install or update the agent brain for the current user.
# Safe to run again: each step replaces what an earlier run created.
#
#   BRAIN_BIN_DIR    directory for the brain command (default: $HOME/.local/bin)
#   NO_COLOR         print without colors
set -euo pipefail

# shellcheck source=ui.sh
. "$(dirname "$0")/ui.sh"

root="$(cd "$(dirname "$0")/.." && pwd)"
bin_dir="${BRAIN_BIN_DIR:-$HOME/.local/bin}"
profile="$HOME/.local/share/agent-brain/chrome-profile"
cd "$root"

step "Check tools"
if ! command -v node >/dev/null 2>&1; then
  fail "node not found. Install node 20 or later."
fi
major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$major" -lt 20 ]; then
  fail "node 20 or later is required. Found $(node --version)."
fi
ok "node $(node --version)"

step "Install dependencies"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile --loglevel=error
  ok "pnpm install"
else
  npm install --no-audit --no-fund --loglevel=error
  ok "npm install"
fi

step "Link the brain command"
mkdir -p "$bin_dir"
ln -sfn "$root/bin/brain.mjs" "$bin_dir/brain"
ok "$bin_dir/brain"
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) warn "$bin_dir is not in PATH. Add it: export PATH=\"$bin_dir:\$PATH\"" ;;
esac

step "Link brain and third-party skills"
# bash 3.2 does not stop on a missing input file, so check it first.
if [ ! -f mcp/link-targets.txt ]; then
  fail "missing mcp/link-targets.txt. It lists the skill folders, one path on each line."
fi
targets=()
skill_dirs=''
while IFS= read -r line; do
  if [ -n "${line//[[:space:]]/}" ]; then
    targets+=(--target "${line/#\~/$HOME}")
    skill_dirs="${skill_dirs:+$skill_dirs and }$line"
  fi
done < mcp/link-targets.txt
links="$(node bin/brain.mjs link-skills --apply "${targets[@]}")"
# link-skills prints one ln line for each link. Count them, and print the other lines.
grep -v '^ln -sfn ' <<<"$links" | report || true
ok "$(grep -c '^ln -sfn ' <<<"$links") skill links in $skill_dirs"

step "Link agents"
link_agents() {
  local from="$1" to="$2"
  mkdir -p "$to"
  # A link into this checkout whose agent is gone came from an older version.
  for link in "$to"/*.md; do
    if [ -L "$link" ] && [[ "$(readlink "$link")" == "$from/"* ]] && [ ! -e "$link" ]; then
      command rm -f "$link"
      ok "removed $link"
    fi
  done
  for agent in "$from"/*.md; do
    ln -sfn "$agent" "$to/$(basename "$agent")"
    ok "$to/$(basename "$agent")"
  done
}
link_agents "$root/agents" "$HOME/.claude/agents"
if [ -d "$HOME/.config/opencode" ]; then
  node scripts/setup-config.mjs opencode-agents >/dev/null
  link_agents "$root/.agents/linked/opencode-agents" "$HOME/.config/opencode/agents"
else
  skip "skipped OpenCode agents (OpenCode is not installed)"
fi

step "Create the Chrome profile directory"
mkdir -p "$profile"
ok "$profile"

step "Register MCP servers in Claude Code"
if command -v claude >/dev/null 2>&1; then
  for name in brain-premises chrome-devtools; do
    claude mcp remove -s user "$name" >/dev/null 2>&1 || true
    claude mcp add-json -s user "$name" "$(node scripts/setup-config.mjs claude-json "$name")" >/dev/null
    ok "$name"
  done
else
  warn "claude not found, so Claude Code has no brain MCP servers. Install Claude Code, then run this script again."
fi

step "Add the session premises hooks"
node scripts/setup-config.mjs hooks-apply | report

step "Ask before git commit, push, and destructive git commands"
node scripts/setup-config.mjs guard-add | report

step "Register MCP servers in Codex"
node scripts/setup-config.mjs codex-add | report

step "Add the brain instructions to Codex"
node scripts/setup-config.mjs instructions-add "$HOME/.codex/AGENTS.md" | report

step "Write the install receipt"
receipt=(--bin-dir "$bin_dir" "${targets[@]}")
if command -v claude >/dev/null 2>&1; then
  receipt+=(--claude)
fi
node bin/brain.mjs installed write "${receipt[@]}" | tr '\t' ' ' | report

step "Verify"
if ! missing="$(node bin/brain.mjs skills check)"; then
  fail "missing third-party skills: ${missing//$'\n'/ }. Run: pnpm skills:update"
fi
ok "third-party skills are present"
node bin/brain.mjs premise list >/dev/null
ok "brain premise list works"
mcp="$("$bin_dir/brain" mcp check)"
ok "$mcp"

installed="$(node bin/brain.mjs installed | tail -n +2 | cut -f1 | tally)"
printf '\n%s✓ Installed:%s %s\n' "$green$bold" "$reset" "$installed"
show_warnings
cat <<MSG

Next:
  1. Start a new Claude Code, Codex, or OpenCode session to load the changes.
  2. In Codex, trust the new hook once in /hooks.
  3. OpenCode reads its MCP servers and AGENTS.md from dotfiles. Add brain-premises and chrome-devtools there from mcp/snippets/, and paste templates/agent-instructions.md into that AGENTS.md.

Run "brain installed" to list each item. Run this script again after a pull or a skill change.
MSG
