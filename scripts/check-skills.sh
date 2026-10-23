#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

need() {
  local file="$1"
  local text="$2"
  if ! grep -F -q -e "$text" "$file"; then
    fail "$file is missing: $text"
  fi
}

front_name() {
  awk '
    NR == 1 {
      if ($0 != "---") {
        exit 2
      }
      next
    }
    $0 == "---" {
      exit 3
    }
    $0 ~ /^name:[[:space:]]*/ {
      sub(/^name:[[:space:]]*/, "")
      gsub(/^["'\'']|["'\'']$/, "")
      gsub(/[[:space:]]+$/, "")
      print
      exit 0
    }
  ' "$1"
}

desc_text() {
  awk '
    NR == 1 && $0 == "---" { fm = 1; next }
    fm && $0 == "---" { exit }
    fm && $0 ~ /^description: [>|]/ {
      fold = 1
      next
    }
    fm && fold && $0 ~ /^[[:space:]]/ {
      sub(/^[[:space:]]+/, "")
      if (n++) {
        printf " "
      }
      printf "%s", $0
      next
    }
    fm && fold { exit }
    fm && $0 ~ /^description: / {
      sub(/^description: /, "")
      if ($0 ~ /^".*"$/) {
        sub(/^"/, "")
        sub(/"$/, "")
      }
      printf "%s", $0
      exit
    }
  ' "$1"
}

# One line must not tell the agent to write into skills/active.
reject_write_active() {
  local file="$1"
  local line lower
  while IFS= read -r line || [ -n "$line" ]; do
    lower="$(printf '%s' "$line" | tr '[:upper:]' '[:lower:]')"
    case "$lower" in
      *write*skills/active*|*skills/active*write*)
        fail "$file has write and skills/active on one line: $line"
        ;;
    esac
  done < "$file"
}

required=(
  skills/active/brain-next/SKILL.md
  skills/active/brain-harvest/SKILL.md
  skills/active/brain-workspace-audit/SKILL.md
  skills/active/brain-learn/SKILL.md
  skills/active/brain-garden/SKILL.md
  skills/active/brain-accept-skill/SKILL.md
  agents/brain-reviewer.md
  templates/agent-skill.md
  skills/active/brain-worktrees/SKILL.md
  skills/drafts/example-draft/SKILL.md
  memory/dropped/example-new-rpc.md
)

missing=0
for file in "${required[@]}"; do
  if [ ! -f "$file" ]; then
    printf 'missing %s\n' "$file" >&2
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then
  exit 1
fi

if [ ! -d skills/active ]; then
  fail "missing skills/active"
fi

shopt -s nullglob
found=0
for dir in skills/active/*/; do
  found=1
  name="$(basename "$dir")"
  skill="${dir}SKILL.md"
  if [ ! -f "$skill" ]; then
    fail "missing $skill"
  fi
  if ! fm_name="$(front_name "$skill")"; then
    fail "bad frontmatter in $skill"
  fi
  case "$name" in
    brain-tp-*|brain) fail "$skill: a brain skill name starts with brain- and not brain-tp-" ;;
    brain-*) ;;
    *) fail "$skill: a brain skill name starts with brain-" ;;
  esac
  if [ "$fm_name" != "$name" ]; then
    fail "name mismatch in $skill: frontmatter is ${fm_name:-empty}"
  fi
  description="$(desc_text "$skill")"
  if [ -z "$description" ]; then
    fail "$skill has no description"
  fi
  if [ "${#description}" -gt 1024 ]; then
    fail "$skill description is longer than 1024 characters"
  fi
done
shopt -u nullglob

for agent in agents/*.md; do
  case "$(basename "$agent")" in
    brain-*) ;;
    *) fail "$agent: an agent name starts with brain-" ;;
  esac
  # The install writes a skill with the agent name, so no brain skill may take it.
  if [ -e "skills/active/$(basename "$agent" .md)" ]; then
    fail "skills/active/$(basename "$agent" .md) has the name of an agent"
  fi
done

if [ "$found" -eq 0 ]; then
  fail "no active skills"
fi

need agents/brain-reviewer.md "brain scope"
need skills/active/brain-learn/SKILL.md "--scope"
need skills/active/brain-workspace-audit/SKILL.md "Do not edit them"
need skills/active/brain-garden/SKILL.md "skills/drafts"
need skills/active/brain-garden/SKILL.md "three similar premises"
need skills/active/brain-garden/SKILL.md "Do not edit skills/active"
need skills/active/brain-learn/SKILL.md "memory/decisions"
need skills/active/brain-learn/SKILL.md "do not create a skill"
need agents/brain-reviewer.md "premise_list"
need agents/brain-reviewer.md "skills/third-party.json"
need agents/brain-reviewer.md "do not edit the diff"
need skills/active/brain-accept-skill/SKILL.md "brain accept-skill"
need skills/active/brain-accept-skill/SKILL.md "do not push"
need memory/dropped/example-new-rpc.md "example: true"
need memory/dropped/example-new-rpc.md "text: New RPC lands in cluster-service"
need memory/dropped/example-new-rpc.md "strength: always"
need memory/dropped/example-new-rpc.md "status: dropped"

for slash in brain-learn brain-garden brain-accept-skill brain-worktrees; do
  need "skills/active/${slash}/SKILL.md" 'opencode/slash: "true"'
done

reject_write_active skills/active/brain-garden/SKILL.md

exit 0
