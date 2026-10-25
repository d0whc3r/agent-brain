#!/usr/bin/env bash
# Install or update the agent brain for the current user.
# Safe to run again: each step changes only what differs from the last run.
#
# Usage: scripts/install.sh [--dry-run] [--help]
#
#   --dry-run   print what would change, and change nothing
#   --help      print this help
#
# It links the brain command, the skills, and the agents, registers the MCP servers in
# Claude Code and Codex, adds the session premises hook and the git confirmation rules, and
# adds the brain instructions to ~/.codex/AGENTS.md. A changed config file keeps a .brain-bak
# copy. scripts/uninstall.sh removes all of it.
#
# Environment:
#   BRAIN_BIN_DIR   directory for the brain command (default: $HOME/.local/bin)
#   NO_COLOR        print without colors
set -euo pipefail

# shellcheck source=ui.sh
. "$(dirname "$0")/ui.sh"
parse_args "$@"

root="$(cd "$(dirname "$0")/.." && pwd)"
bin_dir="${BRAIN_BIN_DIR:-$HOME/.local/bin}"
profile="$HOME/.local/share/agent-brain/chrome-profile"
cd "$root"

# link_one points dest at source and records the change. A dry run changes nothing.
link_one() {
  local type="$1" source="$2" dest="$3" current
  current="$(readlink "$dest" 2>/dev/null || true)"
  if [ "$current" = "$source" ]; then
    return
  fi
  if [ "$dry_run" -eq 0 ]; then
    mkdir -p "$(dirname "$dest")"
    ln -sfn "$source" "$dest"
  fi
  if [ -n "$current" ]; then
    change updated "$type" "$dest"
  else
    change added "$type" "$dest"
  fi
}

printf 'Installing the agent brain from %s\n' "$(short "$root")"
if [ "$dry_run" -eq 1 ]; then
  printf 'Dry run: nothing changes.\n'
fi
# The receipt names the checkout of the last install. lib/receipt.mjs needs no dependency, so it
# runs before the dependencies are installed. Without node, step 1 stops the install.
old_root=''
if command -v node >/dev/null 2>&1; then
  old_root="$(node --input-type=module -e 'const r = await (await import("./lib/receipt.mjs")).readReceipt(); process.stdout.write(r?.root ?? "")')"
fi
if [ -n "$old_root" ] && [ "$old_root" != "$root" ]; then
  if [ -e "$old_root" ]; then
    printf 'The brain from %s is installed. This install replaces it.\n' "$(short "$old_root")"
  else
    printf 'The checkout moved from %s. This install replaces its links.\n' "$(short "$old_root")"
  fi
fi
printf '\n'

step "Check tools"
if ! command -v node >/dev/null 2>&1; then
  fail "node not found. Install node 20 or later."
fi
major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$major" -lt 20 ]; then
  fail "node 20 or later is required. Found $(node --version)."
fi
pass "node $(node --version)"

step "Install dependencies"
if [ "$dry_run" -eq 1 ]; then
  skip "skipped in a dry run"
elif command -v pnpm >/dev/null 2>&1; then
  pnpm install --frozen-lockfile --loglevel=error
  pass "pnpm install"
else
  npm install --no-audit --no-fund --loglevel=error
  pass "npm install"
fi

step "Link the brain command"
link_one bin "$root/bin/brain.mjs" "$bin_dir/brain"
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
apply_flag=(--apply)
if [ "$dry_run" -eq 1 ]; then
  apply_flag=()
fi
links="$(node bin/brain.mjs link-skills ${apply_flag[@]+"${apply_flag[@]}"} "${targets[@]}")"
# link-skills prints one line for each link. Count the changes, and print the skipped links.
for status in added updated removed; do
  count="$(grep -c "^$status " <<<"$links" || true)"
  if [ "$count" -gt 0 ]; then
    change "$status" skills "$(plural "$count" "skill link") in $skill_dirs" "$count"
  fi
done
report skills <<<"$(grep '^skipped ' <<<"$links" || true)"

step "Link agents"
# link_agents links each agent of this checkout, from its file in from, into to. A dead brain
# link of an agent that is gone is removed. link_one replaces the dead link of an agent that
# stays, which a checkout that moved leaves.
link_agents() {
  local from="$1" to="$2" link agent
  for link in "$to"/*.md; do
    if dead_brain_link "$link" && [ ! -e "$root/agents/$(basename "$link")" ]; then
      if [ "$dry_run" -eq 0 ]; then
        command rm -f "$link"
      fi
      change removed agents "$link"
    fi
  done
  for agent in "$root"/agents/*.md; do
    link_one agents "$from/$(basename "$agent")" "$to/$(basename "$agent")"
  done
}
link_agents "$root/agents" "$HOME/.claude/agents"
if [ -d "$HOME/.config/opencode" ]; then
  if [ "$dry_run" -eq 0 ]; then
    node scripts/setup-config.mjs opencode-agents >/dev/null
  fi
  link_agents "$root/.agents/linked/opencode-agents" "$HOME/.config/opencode/agents"
else
  skip "skipped OpenCode agents (OpenCode is not installed)"
fi

step "Create the Chrome profile directory"
if [ ! -d "$profile" ]; then
  if [ "$dry_run" -eq 0 ]; then
    mkdir -p "$profile"
  fi
  change added profile "$profile"
fi

step "Register MCP servers in Claude Code"
if command -v claude >/dev/null 2>&1; then
  for name in brain-premises chrome-devtools; do
    state="$(node scripts/setup-config.mjs claude-mcp-state "$name")"
    if [ "$state" = same ]; then
      continue
    fi
    if [ "$dry_run" -eq 0 ]; then
      claude mcp remove -s user "$name" >/dev/null 2>&1 || true
      claude mcp add-json -s user "$name" "$(node scripts/setup-config.mjs claude-json "$name")" >/dev/null
    fi
    if [ "$state" = missing ]; then
      change added mcp "MCP server $name to Claude Code"
    else
      change updated mcp "MCP server $name in Claude Code"
    fi
  done
else
  warn "claude not found, so Claude Code has no brain MCP servers. Install Claude Code, then run this script again."
fi

step "Add the session premises hooks"
hooks="$(node scripts/setup-config.mjs hooks-apply)"
report hook <<<"$hooks"
codex_hook=0
if grep -E '^(added|updated) ' <<<"$hooks" | grep -qF "$HOME/.codex/hooks.json"; then
  codex_hook=1
fi

step "Ask before git commit, push, and destructive git commands"
apply guard node scripts/setup-config.mjs guard-add

step "Register MCP servers in Codex"
apply mcp node scripts/setup-config.mjs codex-add

step "Add the brain instructions to Codex"
apply instructions node scripts/setup-config.mjs instructions-add "$HOME/.codex/AGENTS.md"

step "Write the install receipt"
if [ "$dry_run" -eq 1 ]; then
  skip "skipped in a dry run"
else
  receipt=(--bin-dir "$bin_dir" "${targets[@]}")
  if command -v claude >/dev/null 2>&1; then
    receipt+=(--claude)
  fi
  written="$(node bin/brain.mjs installed write "${receipt[@]}")"
  # The receipt prints "removed TYPE PATH" for each old link it removed, then its size.
  while IFS=$'\t' read -r kind type where; do
    if [ "$kind" = removed ]; then
      change removed "$type" "$where"
    else
      pass "$kind"
    fi
  done <<<"$written"
fi

step "Verify"
if [ "$dry_run" -eq 1 ]; then
  skip "skipped in a dry run"
else
  if ! missing="$(node bin/brain.mjs skills check)"; then
    fail "missing third-party skills: ${missing//$'\n'/ }. Run: pnpm skills:update"
  fi
  pass "third-party skills are present"
  node bin/brain.mjs premise list >/dev/null
  pass "brain premise list works"
  pass "$("$bin_dir/brain" mcp check)"
fi
end_step

summary="$(changes_text)"
if [ "$dry_run" -eq 1 ]; then
  printf '\n%sDry run:%s %s\n' "$bold" "$reset" "${summary:-no change}"
  show_warnings
  printf 'Run scripts/install.sh without --dry-run to apply.\n'
  exit 0
fi

installed="$(node bin/brain.mjs installed | tail -n +2 | cut -f1 | tally)"
printf '\n%s✓ Installed:%s %s\n' "$green$bold" "$reset" "$installed"
printf '  This run: %s\n' "${summary:-no change}"
show_warnings

next=()
if [ -n "$summary" ]; then
  next+=("Start a new Claude Code, Codex, or OpenCode session to load the changes.")
fi
if [ "$codex_hook" -eq 1 ]; then
  next+=("In Codex, trust the new hook once in /hooks.")
fi
# OpenCode reads its MCP servers and AGENTS.md from dotfiles, so the install does not write them.
opencode="$HOME/.config/opencode"
if [ -d "$opencode" ]; then
  if ! grep -qs brain-premises "$opencode/opencode.json" "$opencode/opencode.jsonc"; then
    next+=("Add brain-premises and chrome-devtools from mcp/snippets/ to the OpenCode config in your dotfiles.")
  fi
  case "$(BRAIN_DRY_RUN=1 node scripts/setup-config.mjs instructions-add "$opencode/AGENTS.md")" in
    added\ *) next+=("Paste templates/agent-instructions.md into ~/.config/opencode/AGENTS.md, between <!-- brain:start --> and <!-- brain:end -->.") ;;
    updated\ *) next+=("Replace the brain block in ~/.config/opencode/AGENTS.md with templates/agent-instructions.md. It is out of date.") ;;
  esac
fi
if [ "${#next[@]}" -gt 0 ]; then
  printf '\nNext:\n'
  i=1
  for item in "${next[@]}"; do
    printf '  %d. %s\n' "$i" "$item"
    i=$((i + 1))
  done
fi
printf '\nRun "brain installed" to list each item. Run this script again after a pull or a skill change.\n'
