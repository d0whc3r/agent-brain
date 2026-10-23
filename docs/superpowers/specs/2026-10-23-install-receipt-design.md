# Install receipt

Date: 2026-10-23
Status: accepted 2026-10-23, not built
Owner: Josep

## Intent

An install receipt is a text file that lists what `scripts/install.sh` put on disk for this user. Josep wants that file so a later install or uninstall can name an agent or a skill that a new version no longer has. The scripts can delete a link that still points at this repo. They cannot name an item that is gone from the repo and gone from disk, because they keep no record of the previous install.

This spec adds one rule to the [brain design](2026-10-23-qdrant-review-brain-design.md). It does not change that design. The scripts do not write the receipt yet.

## Goals

The receipt uses a type as the prefix, and it leaves the public name unchanged. Install compares the receipt with the current tree and prints each name that the new version dropped. Uninstall reads the receipt first, so it still names that item when the link is already gone.

The work is done when a later change meets the proof section. This document does not change `scripts/install.sh` or `scripts/uninstall.sh`.

## Out of scope

This decision does not rename the `brain` command, an agent file, or a skill directory. Claude Code calls an agent by the file name. Claude Code, OpenCode, and Codex call a skill by the directory name. A prefix on those names hides `brain-reviewer` and the skill names.

This decision does not rename the MCP servers `brain-premises` and `chrome-devtools`. The agent calls each server by that name. OpenCode MCP registration stays in dotfiles. The Chrome profile stays on disk after uninstall, as it does today.

## Anti-goals

A run is a failure when it deletes a link that points outside this checkout. A run is a failure when it replaces a skill path that another install owns. A run is a failure when the receipt is committed. The file holds absolute paths for this machine.

## Constraints

The receipt lives at `$HOME/.local/share/qdrant-review-brain/installed.txt`, next to the Chrome profile and outside the git repo. Install writes it with mode `0600`, and only after the link, hook, and MCP steps succeed. A failed install leaves the previous file in place.

One file serves one user. The first field of the first line is `root`, and the second field is the absolute path of the checkout that wrote the file. Uninstall follows the item lines only when that root is the checkout that is running the script.

## Approaches

Three ways were on the table. Josep chose the receipt on 2026-10-23. The other two stay here so a later change does not reopen them.

### A. Receipt with a type prefix (chosen)

Install writes one text file. The first field is the type: `root`, `agents`, `skills`, `bin`, `mcp`, or `hook`. The public name stays in the second field. A later run compares that file with the current tree.

Cost: the first run after this change cannot name a removal that happened before the file existed. After that run, a pull that drops an agent is visible even if the link is already gone.

### B. Scan the link directories only

`brain link-skills` already removes a brain link whose skill is gone from the tree. Agents can use the same scan on install. Uninstall already removes a link that points into this repo.

Cost: a scan sees only a link that is still on disk. It cannot name an agent that is gone from the new version and gone from disk. Rejected as the only mechanism. The uninstall scan stays for an old install that has no receipt.

### C. Prefix on the link name

A name such as `d0w-brain-reviewer.md` is easy to find in a shared directory. The tools then load that prefixed name, not `brain-reviewer`. A colon in a file name is also a poor fit on macOS. Rejected.

The type is the prefix. The example token `d0w` is not part of the format.

## File format

The file is UTF-8. Each line has fields split by one tab. The writer does not use a colon as a separator. A blank line is an error. The field order is type, name, then path or tool.

```
root	/Users/josep/projects/qdrant-review-brain
agents	brain-reviewer	/Users/josep/.claude/agents/brain-reviewer.md
skills	review-brain	/Users/josep/.claude/skills/review-brain
skills	review-brain	/Users/josep/.agents/skills/review-brain
bin	brain	/Users/josep/.local/bin/brain
mcp	brain-premises	claude
mcp	chrome-devtools	claude
mcp	brain-premises	codex
mcp	chrome-devtools	codex
hook	session-premises	/Users/josep/.claude/settings.json
```

`root` has two fields. `agents`, `skills`, and `bin` have three fields, and the third field is the absolute path of the link. `mcp` has three fields, and the third field is `claude` or `codex`. `hook` has three fields, and the third field is the absolute path of `~/.claude/settings.json`. The hook name is the marker `session-premises`, which `scripts/setup-config.mjs` already uses.

The Chrome profile is not a line. Skill links include both paths from `mcp/link-targets.txt`. A brain skill and a vendored skill in `.agents/skills` both get a `skills` line when install links them. The name is the directory name. The third field is the path in the tool directory, not the path inside the repo.

## Install rules

`scripts/install.sh` links the current tree first, with the same commands it uses today. It then reads the old receipt, when one exists, and applies the rules below. It writes the new receipt last.

When the old root matches this checkout, compare each `agents`, `skills`, and `bin` line with the current tree. If the receipt has the name and the tree does not, print `removed`, delete the link when it still points into this checkout, and drop the line. If the tree has the name and the link is missing or points at the wrong path, print `lost` and repair the link. If both agree and the link is correct, print nothing for that line.

When the old root is a different checkout, do not delete paths from that receipt. Print `replaced receipt` and the old root. Then link this checkout and write a new receipt for this root. One file means the last successful install owns the receipt. Uninstall of the other checkout still removes links that point at its own root, through the scan in the next section.

When the receipt is missing, do the current install steps and write the first receipt. Do not invent lines for items that are already gone.

`mcp` and `hook` lines follow the same `removed` and `lost` words when a future version drops a server or the hook. This version always registers `brain-premises`, `chrome-devtools`, and the SessionStart hook, so those lines are rewritten, not removed.

A skill path that another install owns stays as it is. `link-skills` already skips that path. The receipt must not gain a line for a skipped path. A `lost` line is not a repair of a foreign path.

Print lines use tabs, in the same shape as `brain workspace check`:

```
removed	agents	brain-reviewer	/Users/josep/.claude/agents/brain-reviewer.md
lost	skills	review-brain	/Users/josep/.claude/skills/review-brain
```

## Uninstall rules

`scripts/uninstall.sh` reads the receipt when the root line matches this checkout. For each item line, it removes what install added and prints `removed` with the type and the name. A missing path still gets that line. The name is the point of the receipt.

It then runs the current scan of skill directories, `~/.claude/agents`, the `brain` command, the Claude MCP servers, the SessionStart hook, and the Codex MCP tables. The scan removes a leftover link that points into this checkout and is not in the receipt. That covers an install from before this file existed.

It does not follow a receipt whose root is a different checkout. It does not remove a link that points outside this checkout. It does not remove the repo, the notes, `node_modules`, or the Chrome profile. After a matching uninstall, it deletes the receipt. A later install must not report every old name as removed.

## Proof

The implementation is done when these facts hold. Use a temporary copy of the repo and a temporary home directory. Do not run the proof against the daily home directory.

A first install writes `installed.txt` and lists each agent, each skill link, the `brain` command, both MCP servers for Claude Code and Codex, and the hook. A second install with the same tree prints no `removed` line and no `lost` line, and the file bytes stay the same.

Delete one agent file from the temporary tree and run install again. The output contains `removed`, the type `agents`, and that name. The link is gone. The receipt line is gone. Delete a skill directory and the skill link, then run uninstall. The output still contains `removed` and that skill name.

Delete only the agent link while the agent file remains, and run install. The output contains `lost` and that name, and the link points at the repo again. A link that points outside this checkout is still there after uninstall. The Chrome profile directory is still there after uninstall.

## Builder notes

Do not add a filename prefix. Do not put the receipt in the git repo. Keep the current scan in uninstall for installs that have no receipt. Agents in `scripts/install.sh` today only add links for `agents/*.md`. The receipt comparison is what removes an agent the new version dropped. `link-skills` already removes a stale skill link that is still on disk. The receipt adds the name when that link is already gone.
