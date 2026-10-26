#!/usr/bin/env bash
# Install or update the agent brain for the current user.
# Safe to run again: each step changes only what differs from the last run.
#
# Usage: scripts/install.sh [--dry-run] [--home DIR] [--no-git-guard] [--no-codex] [--no-lsp] [--help]
#
#   --dry-run        print what would change, and change nothing
#   --home DIR       keep the brain home in DIR, and link ~/.local/share/agent-brain/home to it
#   --no-git-guard   skip the rules that ask before git commit, push, and destructive git commands
#   --no-codex       skip the Codex MCP servers, hook, and instructions
#   --no-lsp         skip the code intelligence plugin and its language servers
#   --help           print this help
#
# It creates the brain home once, from templates/home: your config, premises, notes, flows, and
# skills, with starter premises as candidates. It never changes a home that exists.
# It links the brain command, the code intelligence plugin, the skills, and the agents,
# installs typescript-language-server with npm and ty with uv when they are missing, registers the
# MCP servers in Claude Code and Codex, adds the session premises hook and the git confirmation
# rules, and adds the brain instructions to ~/.codex/AGENTS.md. It sets up Codex only when
# ~/.codex exists. After a checkout move, it removes the links and the Codex project trust of the
# old place. A changed config file keeps a .brain-bak copy. A part that a --no- option skips keeps
# what an earlier install added.
# scripts/uninstall.sh removes all of it, except the brain home and the language servers that npm
# and uv installed.
#
# Environment:
#   BRAIN_BIN_DIR   directory for the brain command (default: $HOME/.local/bin)
#   NO_COLOR        print without colors
set -euo pipefail

# shellcheck source=ui.sh
. "$(dirname "$0")/ui.sh"
# These options belong to this script only. parse_args reads the shared options.
home_dir=''
no_git_guard=0
no_codex=0
no_lsp=0
args=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --home)
      if [ "$#" -lt 2 ]; then
        printf 'option --home needs a directory\n\n' >&2
        usage >&2
        exit 2
      fi
      home_dir="$2"
      shift
      ;;
    --home=*) home_dir="${1#--home=}" ;;
    --no-git-guard) no_git_guard=1 ;;
    --no-codex) no_codex=1 ;;
    --no-lsp) no_lsp=1 ;;
    *) args+=("$1") ;;
  esac
  shift
done
parse_args ${args[@]+"${args[@]}"}
case "$home_dir" in
  '' | /*) ;;
  *) home_dir="$PWD/$home_dir" ;;
esac

root="$(cd "$(dirname "$0")/.." && pwd)"
bin_dir="${BRAIN_BIN_DIR:-$HOME/.local/bin}"
profile="$HOME/.local/share/agent-brain/chrome-profile"
# The brain code reads the home from this path. --home makes it a link to another folder.
home_link="$HOME/.local/share/agent-brain/home"
home="${home_dir:-$home_link}"
home_new=0
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

# new_home copies templates/home into an empty folder and starts a git repo there, so the user
# can commit the home and push it to a private remote.
new_home() {
  mkdir -p "$1"
  command cp -R "$root/templates/home/." "$1/"
  command mv -f "$1/gitignore" "$1/.gitignore"
  if command -v git >/dev/null 2>&1; then
    git -C "$1" init -q
  fi
}

printf 'Installing the agent brain from %s\n' "$(short "$root")"
if [ "$dry_run" -eq 1 ]; then
  printf 'Dry run: nothing changes.\n'
fi
# The receipt names the checkout of the last install. Without node, step 1 stops the install.
old_root=''
old_version=''
if command -v node >/dev/null 2>&1; then
  old_root="$(receipt_root)"
  old_version="$(receipt_version)"
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
  fail "node not found. Install node 24 or later."
fi
major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$major" -lt 24 ]; then
  fail "node 24 or later is required. Found $(node --version)."
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

step "Set up the brain home"
if [ -z "$(ls -A "$home" 2>/dev/null)" ]; then
  if [ "$dry_run" -eq 0 ]; then
    new_home "$home"
  fi
  starters="$(find "$root/templates/home/memory/premises" -name '*.md' | wc -l | tr -d ' ')"
  change added home "$home, with $(plural "$starters" "starter premise") as candidates"
  home_new=1
fi
# An update adds each folder of a newer template, and never changes a file of the user.
if [ "$home_new" -eq 0 ]; then
  while IFS= read -r keep; do
    rel="${keep#"$root/templates/home/"}"
    if [ ! -e "$home/$rel" ]; then
      if [ "$dry_run" -eq 0 ]; then
        mkdir -p "$(dirname "$home/$rel")"
        : >"$home/$rel"
      fi
      change added home "$home/$rel"
    fi
  done < <(find "$root/templates/home" -name .gitkeep | sort)
fi
if [ -n "$home_dir" ]; then
  if [ -e "$home_link" ] && [ ! -L "$home_link" ]; then
    fail "$home_link is a folder. Move it, or run without --home."
  fi
  link_one home "$home" "$home_link"
fi

step "Link the brain command"
link_one bin "$root/bin/brain.mjs" "$bin_dir/brain"
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) warn "$bin_dir is not in PATH. Add it: export PATH=\"$bin_dir:\$PATH\"" ;;
esac

# This step runs before the skill links, so a moved checkout updates this link before
# link-skills sees it as a dead brain link.
step "Link the code intelligence plugin"
# link_lsp links the plugin and adds the language servers that npm and uv install.
link_lsp() {
  local ts_lsp="typescript-language-server typescript@6"
  # Claude Code loads a folder in ~/.claude/skills that holds .claude-plugin/plugin.json as a plugin.
  link_one skills "$root/plugins/brain-lsp" "$HOME/.claude/skills/brain-lsp"
  # typescript-language-server serves a folder with no TypeScript from the tsserver.js of the
  # typescript package beside it. TypeScript 7 has no tsserver.js, so the install pins 6.
  # The uninstall keeps the language servers that npm and uv installed, because other tools can use them.
  # npm install -g needs root with the node of a Linux distro, so a failure warns and the install goes on.
  if ! command -v typescript-language-server >/dev/null 2>&1; then
    # shellcheck disable=SC2086
    if [ "$dry_run" -eq 1 ] || npm install -g --no-audit --no-fund --loglevel=error $ts_lsp; then
      change added lsp "typescript-language-server and typescript@6 with npm install -g"
    else
      warn "npm install -g failed, so TypeScript files get no language server. Install it by hand: npm install -g $ts_lsp"
    fi
  fi
  if ! command -v ty >/dev/null 2>&1; then
    if command -v uv >/dev/null 2>&1; then
      if [ "$dry_run" -eq 0 ]; then
        uv tool install --quiet ty
      fi
      change added lsp "ty with uv tool install"
    else
      warn "uv not found, so the install cannot add ty, and Python files get no language server. Install uv: brew install uv"
    fi
  fi
  if ! command -v gopls >/dev/null 2>&1; then
    warn "gopls not found, so Go files get no language server. Install it: go install golang.org/x/tools/gopls@latest"
  fi
  if ! command -v buf >/dev/null 2>&1; then
    warn "buf not found, so .proto files get no language server. Install it: brew install bufbuild/buf/buf"
  fi
}
if [ "$no_lsp" -eq 1 ]; then
  skip "skipped (--no-lsp)"
else
  link_lsp
fi

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

# Codex gets the brain only when it is installed, and only without --no-codex.
codex=1
codex_why=''
if [ "$no_codex" -eq 1 ]; then
  codex=0
  codex_why='--no-codex'
elif [ ! -d "$HOME/.codex" ]; then
  codex=0
  codex_why='Codex is not installed'
fi
skip_tools=''
if [ "$codex" -eq 0 ]; then
  skip_tools=codex
fi

step "Add the session premises hooks"
hooks="$(node scripts/setup-config.mjs hooks-apply "$skip_tools")"
report hook <<<"$hooks"
codex_hook=0
if grep -E '^(added|updated) ' <<<"$hooks" | grep -qF "$HOME/.codex/hooks.json"; then
  codex_hook=1
fi

step "Ask before git commit, push, and destructive git commands"
if [ "$no_git_guard" -eq 1 ]; then
  skip "skipped (--no-git-guard)"
else
  apply guard node scripts/setup-config.mjs guard-add
fi

step "Register MCP servers in Codex"
if [ "$codex" -eq 1 ]; then
  apply mcp node scripts/setup-config.mjs codex-add
else
  skip "skipped ($codex_why)"
fi

# Codex writes the trust of a project when the user gives it. The install never adds one.
step "Remove the Codex trust of a moved checkout"
apply trust node scripts/setup-config.mjs codex-trust-clean "$old_root"

step "Add the brain instructions to Codex"
if [ "$codex" -eq 1 ]; then
  apply instructions node scripts/setup-config.mjs instructions-add "$HOME/.codex/AGENTS.md"
else
  skip "skipped ($codex_why)"
fi

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
new_version="$(node -p 'require("./package.json").version')"
if [ -n "$old_version" ] && [ "$old_version" != "$new_version" ]; then
  printf '\nUpdated the brain from %s to %s:\n' "$old_version" "$new_version"
  node scripts/setup-config.mjs changelog "$old_version" | sed 's/^/  /'
fi

next=()
starters="$(node bin/brain.mjs home starters | wc -l | tr -d ' ')"
if [ "$home_new" -eq 0 ] && [ "$starters" -gt 0 ]; then
  next+=("Run brain home starters to list $(plural "$starters" "new starter premise"), and add --apply to add them as candidates.")
fi
if [ "$home_new" -eq 1 ]; then
  next+=("Review the starter premises with brain premise list --status candidate, and run brain premise promote ID for each one you want.")
  next+=("Add scopes for your repos to $(short "$home")/brain.config.json, and commit the home to a private git repo.")
fi
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
  if ! grep -qs ts-lsp.sh "$opencode/opencode.json" "$opencode/opencode.jsonc"; then
    next+=("Add the lsp block from docs/integrations.md to the OpenCode config in your dotfiles.")
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
