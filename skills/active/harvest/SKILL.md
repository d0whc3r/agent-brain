---
name: harvest
description: "Collect rules and repeated review defects from Claude Code project memories and Engram, and propose them as brain premises for the user to approve. Use when the user runs /harvest, asks to import rules from memory, or asks which corrections are not yet premises."
metadata:
  opencode/slash: "true"
---

# Harvest

Corrections pile up in Claude Code memories and in Engram, one repo at a time. A review only applies the rules that are premises. This skill moves the lasting rules into premises, so every repo and every tool sees them.

## Sources

- Claude Code memories: `~/.claude/projects/*/memory/*.md`. Read each `MEMORY.md` index first, then the files it lists. The project directory name is the path of the repo, so run `brain scope --cwd <that path>` to learn the scope of each memory.
- Engram: `mem_search` for each project, with the queries `review`, `rule`, `never`, and `always`. Read the full text of a hit with `mem_get_observation`.

A memory from a session in a copy directory is a correction from the user, so it counts. Code in a copy directory is not a source.

## Steps

1. Call `premise_list` with an empty repo, so you know the rules that exist.
2. Read the sources. Keep an item only when it is one of these:
   - A rule the user stated, such as "never", "always", "do not", or "use X, not Y".
   - A defect class that a review found more than once, such as a missing account scope on an update RPC.
3. Drop an item that a premise already covers, a fact about one ticket, and a note about the state of a branch.
4. Merge items that say the same rule in different repos. Give each row the scope of its sources. A rule found in three or more repos of one scope gets `repos: ["*"]` in that scope. A rule found in two scopes gets scope `"*"` only when it is about how the user works, not about one team or project.
5. Show a table: proposed id, text, strength, scope, repos, and the source paths. One sentence per text.
6. Ask the user which rows to add. Add nothing before the answer.
7. Add each approved row with `brain premise add` or `premise_add`. Set `source` to the first source path.
8. Write one decision note for the batch, `memory/decisions/YYYY-MM-DD-harvest.md` from `templates/decision.md`. List each premise id and its sources.
9. Run `brain premise list` and show the new lines.

## Limits

Do not edit or delete the source memories. Tell the user which memories the new premises duplicate. The user decides whether to remove them.

Do not write tokens, account ids, or customer data into a premise.
