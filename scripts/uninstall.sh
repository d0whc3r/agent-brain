#!/usr/bin/env bash
# Remove what install.sh added for the current user.
# Keeps the repo, its memory, node_modules, and the Chrome profile.
#
# Usage: scripts/uninstall.sh [--dry-run] [--remove-backups] [--help]
#
#   --dry-run          print what would be removed, and remove nothing
#   --remove-backups   also remove the .brain-bak copies of the config files
#   --help             print this help
#
# It removes the skill, agent, and brain command links, the MCP servers in Claude Code and
# Codex, the session premises hook, the git confirmation rules, and the brain instructions in
# ~/.codex/AGENTS.md. It also removes the dead brain links of a checkout that moved.
#
# Environment:
#   BRAIN_BIN_DIR   directory of the brain command (default: $HOME/.local/bin)
#   NO_COLOR        print without colors
set -euo pipefail

# shellcheck source=ui.sh
. "$(dirname "$0")/ui.sh"
# --remove-backups is an option of this script only. parse_args reads the shared options.
remove_backups=0
args=()
for arg in "$@"; do
  if [ "$arg" = --remove-backups ]; then
    remove_backups=1
  else
    args+=("$arg")
  fi
done
parse_args ${args[@]+"${args[@]}"}

root="$(cd "$(dirname "$0")/.." && pwd)"
bin_dir="${BRAIN_BIN_DIR:-$HOME/.local/bin}"
profile="$HOME/.local/share/agent-brain/chrome-profile"
# The config files that the install and this script edit. Each edit keeps a .brain-bak copy.
configs=("$HOME/.claude/settings.json" "$HOME/.codex/hooks.json" "$HOME/.codex/config.toml" "$HOME/.codex/AGENTS.md")
cd "$root"

# Each removed link is "TYPE<TAB>PATH". The receipt and the folder scan can name one link twice.
removed_links=()
seen=$'\n'

# record_link counts a link once. remove_link also removes it, unless this is a dry run.
record_link() {
  case "$seen" in
    *$'\n'"$2"$'\n'*) return 1 ;;
  esac
  seen="$seen$2"$'\n'
  removed_links+=("$1"$'\t'"$2")
}

remove_link() {
  if record_link "$1" "$2" && [ "$dry_run" -eq 0 ]; then
    command rm -f "$2"
  fi
}

# into_root is true for a link into one of the given folders of this checkout.
into_root() {
  local link="$1" target dir
  target="$(readlink "$link" 2>/dev/null || true)"
  shift
  for dir in "$@"; do
    if [[ "$target" == "$root/$dir/"* ]]; then
      return 0
    fi
  done
  return 1
}

# report_links prints one line for each type: the path of one link, or the count of many.
report_links() {
  local type noun entry count last
  for type in skills agents bin; do
    noun="${type%s} link"
    count=0
    for entry in ${removed_links[@]+"${removed_links[@]}"}; do
      if [ "${entry%%$'\t'*}" = "$type" ]; then
        count=$((count + 1))
        last="${entry#*$'\t'}"
      fi
    done
    if [ "$count" -eq 1 ]; then
      change removed "$type" "$last"
    elif [ "$count" -gt 1 ]; then
      change removed "$type" "$(plural "$count" "$noun")" "$count"
    fi
  done
}

printf 'Removing the agent brain of %s\n' "$(short "$root")"
if [ "$dry_run" -eq 1 ]; then
  printf 'Dry run: nothing changes.\n'
fi
printf '\n'

step "Remove links"
# bash 3.2 does not stop on a missing input file, so check it first.
if [ ! -f mcp/link-targets.txt ]; then
  fail "missing mcp/link-targets.txt. It lists the skill folders, one path on each line."
fi
# The receipt removes the links it lists. The scan below finds the links it does not list.
receipt="$(node bin/brain.mjs installed remove)"
while IFS=$'\t' read -r kind type where; do
  case "$kind" in
    removed) record_link "$type" "$where" || true ;;
    note) skip "$type" ;;
  esac
done <<<"$receipt"
while IFS= read -r target; do
  target="${target/#\~/$HOME}"
  if [ -z "${target//[[:space:]]/}" ]; then
    continue
  fi
  for link in "$target"/*; do
    if into_root "$link" skills/active .agents/skills .agents/linked || dead_brain_link "$link"; then
      remove_link skills "$link"
    fi
  done
done < mcp/link-targets.txt
for link in "$HOME/.claude/agents"/*.md "$HOME/.config/opencode/agents"/*.md; do
  if into_root "$link" agents .agents/linked || dead_brain_link "$link"; then
    remove_link agents "$link"
  fi
done
if [ "$(readlink "$bin_dir/brain" 2>/dev/null || true)" = "$root/bin/brain.mjs" ] || dead_brain_link "$bin_dir/brain"; then
  remove_link bin "$bin_dir/brain"
fi
report_links

step "Remove MCP servers from Claude Code"
if command -v claude >/dev/null 2>&1; then
  for name in brain-premises chrome-devtools; do
    if [ "$dry_run" -eq 1 ]; then
      registered="$(node scripts/setup-config.mjs claude-mcp-state "$name")"
    elif claude mcp remove -s user "$name" >/dev/null 2>&1; then
      registered=yes
    else
      registered=missing
    fi
    if [ "$registered" = missing ]; then
      skip "$name was not registered"
    else
      change removed mcp "MCP server $name from Claude Code"
    fi
  done
else
  skip "claude not found. Skipped."
fi

step "Remove the session premises hooks"
apply hook node scripts/setup-config.mjs hooks-remove

step "Remove the git confirmation rules"
apply guard node scripts/setup-config.mjs guard-remove

step "Remove MCP servers from Codex"
apply mcp node scripts/setup-config.mjs codex-remove

step "Remove the brain instructions from Codex"
apply instructions node scripts/setup-config.mjs instructions-remove "$HOME/.codex/AGENTS.md"

step "Remove the generated copies"
if [ -d "$root/.agents/linked" ]; then
  if [ "$dry_run" -eq 0 ]; then
    command rm -rf "$root/.agents/linked"
  fi
  change removed "" "$root/.agents/linked"
fi

# The steps above write new copies, so this step runs last.
step "Remove the config backups"
kept_backups=()
for file in "${configs[@]}"; do
  backup="$file.brain-bak"
  if [ ! -e "$backup" ]; then
    continue
  fi
  if [ "$remove_backups" -eq 0 ]; then
    kept_backups+=("$backup")
    continue
  fi
  if [ "$dry_run" -eq 0 ]; then
    command rm -f "$backup"
  fi
  change removed backups "$backup"
done
if [ "${#kept_backups[@]}" -gt 0 ]; then
  skip "kept $(plural "${#kept_backups[@]}" backup). Add --remove-backups to remove them"
fi
end_step

removed="$(tally_of removed)"
if [ "$dry_run" -eq 1 ]; then
  printf '\n%sDry run:%s %s\n' "$bold" "$reset" "${removed:+would remove $removed}"
  printf 'Run scripts/uninstall.sh without --dry-run to apply.\n'
  exit 0
fi

if [ -n "$removed" ]; then
  printf '\n%s✓ Removed:%s %s\n' "$green$bold" "$reset" "$removed"
else
  printf '\n%s✓ Nothing to remove.%s\n' "$green$bold" "$reset"
fi
printf 'Kept:\n  %s (repo and memory)\n' "$(short "$root")"
if [ -d "$profile" ]; then
  printf '  %s (Chrome test logins)\n' "$(short "$profile")"
fi
for file in ${kept_backups[@]+"${kept_backups[@]}"}; do
  printf '  %s (config copy from before the last brain edit)\n' "$(short "$file")"
done
if [ -d "$profile" ] || [ "${#kept_backups[@]}" -gt 0 ]; then
  printf 'To remove them too:\n'
  if [ -d "$profile" ]; then
    printf '  rm -rf "%s"\n' "$profile"
  fi
  if [ "${#kept_backups[@]}" -gt 0 ]; then
    printf '  scripts/uninstall.sh --remove-backups\n'
  fi
fi
printf 'Run scripts/install.sh to install again.\n'
