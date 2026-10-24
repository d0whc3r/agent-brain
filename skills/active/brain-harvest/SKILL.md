---
name: brain-harvest
description: "Collect rules and repeated review defects from Claude Code project memories and Engram, and propose them as brain premises for the user to approve. Use when the user runs /brain-harvest, asks to import rules from memory, or asks which corrections are not yet premises."
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
   - A defect class that a review found, such as a missing account scope on an update RPC.
3. Drop an item that a premise already covers, a fact about one ticket, a note about the state of a branch, and anything git or the code records. These are ephemeral, as the What to keep table of `brain-learn` describes.
4. Count each kept item: the sessions and the distinct days it appears on. Mark a row `ready` when it has 2 corrections, or 3 defects, on 2 distinct days or more, or when the user asked for it explicitly with "remember", "always", or "never". Mark every other row `candidate`.
5. Merge items that say the same rule in different repos. Give each row the scope of its sources. A rule found in three or more repos of one scope gets `repos: ["*"]` in that scope. A rule found in two scopes gets scope `"*"` only when it is about how the user works, not about one team or project.
6. Show a table: proposed id, text, strength, scope, repos, `ready` or `candidate`, the count, and the source paths. One sentence per text.
7. Ask the user which rows to add. Add nothing before the answer.
8. Add each approved `candidate` row with `--status candidate`, and one `brain premise seen` per occurrence with its date and repo. Write no decision note for it.
9. For the approved `ready` rows, write one decision note for the batch, `memory/decisions/YYYY-MM-DD-harvest.md` from `templates/decision.md`. For each premise id, state its reason and its origin in words: the repo, the tool, and what happened. Do not cite a memory file, an Engram id, or any path outside the brain, because another machine does not have them.
10. Add each approved `ready` row with `brain premise add` or `premise_add`. Set `source` to that decision note.
11. Run `brain premise list` and `brain premise list --status candidate`, and show the new lines.

## Limits

Do not edit or delete the source memories. Tell the user which memories the new premises duplicate. The user decides whether to remove them.

Do not write tokens, account ids, or customer data into a premise.
