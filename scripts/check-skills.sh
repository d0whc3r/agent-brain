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
  scripts/fixtures/dropped-premise.md
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
  case "$name" in
    brain-tp-*|brain) fail "$skill: a brain skill name starts with brain- and not brain-tp-" ;;
    brain-*) ;;
    *) fail "$skill: a brain skill name starts with brain-" ;;
  esac
done
shopt -u nullglob

# The frontmatter name is the directory name, and the description has 1 to 1024 characters.
# The YAML parser of the brain reads the frontmatter, as an agent tool does.
node --input-type=module - skills/active/*/SKILL.md <<'JS'
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { frontmatter } from "./lib/stats.mjs";

for (const skill of process.argv.slice(2)) {
  let fields = {};
  try {
    fields = frontmatter(readFileSync(skill, "utf8"));
  } catch {
    // Invalid YAML is a bad frontmatter below.
  }
  const fail = (message) => {
    console.error(message);
    process.exit(1);
  };
  if (!Object.hasOwn(fields, "name")) {
    fail(`bad frontmatter in ${skill}`);
  }
  const name = String(fields.name ?? "");
  if (name !== basename(dirname(skill))) {
    fail(`name mismatch in ${skill}: frontmatter is ${name || "empty"}`);
  }
  const description = String(fields.description ?? "").trim();
  if (description === "") {
    fail(`${skill} has no description`);
  }
  if (description.length > 1024) {
    fail(`${skill} description is longer than 1024 characters`);
  }
}
JS

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
need scripts/fixtures/dropped-premise.md "example: true"
need scripts/fixtures/dropped-premise.md "text: New RPC lands in cluster-service"
need scripts/fixtures/dropped-premise.md "strength: always"
need scripts/fixtures/dropped-premise.md "status: dropped"

for slash in brain-learn brain-garden brain-accept-skill brain-worktrees; do
  need "skills/active/${slash}/SKILL.md" 'opencode/slash: "true"'
done

reject_write_active skills/active/brain-garden/SKILL.md

# A third-party skill link to ../../references/ must resolve. scripts/sync-references.sh fetches them.
for name in $(grep -rhoE '\.\./\.\./references/[a-z-]+\.md' .agents/skills | sed 's#.*/##' | sort -u); do
  if [ ! -f ".agents/references/$name" ]; then
    fail "missing .agents/references/$name: run scripts/sync-references.sh"
  fi
done

echo "skills ok"
