# Personal agent brain

Date: 2026-10-23  
Status: approved 2026-10-23  
Owner: Josep  
Audience: one person. The Cloud team does not use this repo.

Summary: This spec designs one personal git repo of Markdown premises and skills. Claude Code, OpenCode, and Codex load it, so a correction from one review applies in the next one. A skill reaches the tools only after Josep accepts it.

Contents:

- [Intent](#intent)
- [Goals](#goals)
- [Out of scope](#out-of-scope)
- [Anti-goals](#anti-goals)
- [Constraints](#constraints)
- [Approaches](#approaches)
- [Decisions Josep made](#decisions-josep-made)
- [Calls made in this design](#calls-made-in-this-design)
- [Parts](#parts)
- [First slice](#first-slice)
- [Verification](#verification)
- [Later slices, not this build](#later-slices-not-this-build)
- [AGENTS.md to ship](#agentsmd-to-ship)
- [Open questions for Josep](#open-questions-for-josep)

## Intent

Josep reviews, simplifies, and improves Qdrant Cloud code across several repos and three coding tools. A correction he gives today is gone tomorrow. He wants one personal store that remembers those corrections, turns a repeated correction into a skill, and loads that skill in Claude Code, OpenCode, and Codex.

The store is a git repo of markdown files. Obsidian opens that repo as a vault. Engram recalls a fact across sessions. A skill reaches the tools only after Josep accepts it.

## Goals

- One source repo holds active skills, draft skills, decision notes, pattern notes, and session notes.
- Claude Code, OpenCode, and Codex load the same active skills.
- Josep can record a correction in one command during a review.
- A gardener pass drafts a skill after a correction repeats, and leaves the draft where the tools do not load it.
- Josep accepts, edits, or drops each draft. Accept moves the skill to the active set and commits it in the brain repo.
- A review command uses the active skills plus the rules already written in `/Users/josep/projects/qdrant/AGENTS.md`.
- The first slice works with no new third-party skill install.
- Josep can list, add, and delete premises from the terminal and from each coding tool.
- A review loads every active premise for the repo before it writes findings.
- A UI review can open the local page, take a screenshot, and read the console and the network log.

## Out of scope

- A team brain, a shared remote, and edits to `/Users/josep/projects/qdrant/AGENTS.md`.
- Edits to `cloud-rc-docs`. That vault stays the team record of why a service exists. The brain may link to a page there. It does not copy the page.
- Install of Addy Osmani, Matt Pocock, samber Go, or Vercel skills. That is a later slice, after this repo exists and Josep names the set.
- A vector database, a new orchestrator, and a second copy of the OpenCode specialist agents.
- Engram as the premise store. Engram stays the session memory: what was tried, what failed, what was decided in a chat.
- The OpenCode `memory` knowledge-graph server as the premise store. It has no git history, and Claude Code and Codex do not share that server today.
- Playwright MCP in the first slice. See Browser server below.
- A web-search MCP. Claude Code, OpenCode, and Codex already fetch pages. Context7 already answers library-doc questions. A search MCP is a later add only if a probe shows one tool cannot fetch a URL.
- Copies of Sentry, Notion, or MUI into the personal config. Those servers already live in `/Users/josep/projects/qdrant/mcp.json` for the workspace.
- Automatic edits to active `SKILL.md` files.
- Learning from the ignored copies listed in the Qdrant `AGENTS.md` (`qdrant-cloud-ui-copy`, `qdrant-cloud-ui-copy2`, and the other copy directories in that section).
- Changes inside the Qdrant engine repo. That repo stays a read-only reference.

## Anti-goals

A run is a failure when any of these happen, even if the files exist:

- An active skill changes without an accept from Josep.
- A session note stores a token, a `.env` value, customer data, or a full diff.
- The gardener writes a skill from a stale copy repo.
- OpenCode, Claude Code, or Codex loads a draft skill.
- The brain repo is pushed to a remote.

## Constraints

- Personal data stays on this machine until Josep asks for a remote.
- The Qdrant workspace rule still holds: no commit and no push in a Qdrant repo unless Josep asks. Accept is the ask for a commit inside the brain repo only.
- Skills and notes are in English. The coding tools and the Qdrant `AGENTS.md` are in English.
- Chat with Josep stays in Spanish when he writes in Spanish.
- Active skills follow the Agent Skills layout: one directory, one `SKILL.md`, `name` and `description` in the frontmatter.
- The dotfiles skill installer (`dotfiles/install.sh` and `skills-lock.json`) does not own this repo. Brain skills are not entries in that lockfile.

## Approaches

### A. Skill garden (chosen)

One git repo. Active skills are linked into each tool's discovery path. Drafts stay inside the repo, off those paths. Josep promotes a draft. Git is the undo.

Tradeoff: learning is slower than a hook that rewrites skills. The rules stay readable, and a bad note does not become a rule.

### B. Auto-reflect

A stop hook rewrites `SKILL.md` and commits at the end of every session.

Tradeoff: the vault fills fast. A bad session becomes a permanent rule. Rejected for the first slice.

### C. Obsidian as the runtime

The vault is the only store. Each tool would still need `SKILL.md` files on its discovery path. That export is approach A. Rejected as a second store.

Josep chose A on 2026-10-23, and limited it to himself.

## Decisions Josep made

- The brain is personal. It does not serve the Cloud team.
- The shape is approach A.

## Calls made in this design

These are builder defaults. Josep can override them when he reviews this doc.

1. **Repo path:** `/Users/josep/projects/agent-brain`. It sits next to other personal projects. It does not sit inside `/Users/josep/projects/qdrant`, because that tree is the team workspace.
2. **Git remote:** none in the first slice. Local commits only. Push waits for a separate ask.
3. **First slice has no stop hook.** A hook on every Claude session would also see job-search sessions and other trees. Session notes come from `/learn` and from the review command. A later slice can add a hook limited to `/Users/josep/projects/qdrant`, still with no skill rewrite.
4. **Review does not edit code.** `/review-brain` writes findings. A fix waits for a separate ask, in the tool Josep is already using.
5. **One probe skill before the links.** The builder adds `brain-probe`, asks each tool to list skills, then links the rest only on paths that tool actually reads. A tool that already reads `~/.agents/skills` does not get a second link.
6. **Expected links, after the probe confirms them:**
   - Claude Code reads `~/.claude/skills/<name>`. It does not scan `~/.agents/skills` on its own. Link each active skill there.
   - OpenCode reads `~/.agents/skills`, `~/.claude/skills`, and `~/.config/opencode/skills` ([OpenCode skills docs](https://opencode.ai/docs/skills/)). Prefer one path. If the probe shows `~/.agents/skills`, link there and skip the OpenCode config directory, so `dotfiles/install.sh` does not own these skills.
   - Codex reads `~/.codex/skills`. Link there. If the probe shows Codex also reads `~/.agents/skills`, skip the Codex link and record that in the repo README.
7. **Do not edit** `/Users/josep/projects/qdrant/AGENTS.md`, `dotfiles/agents/`, or `dotfiles/.agents/skills/`.
8. **Engram** stores the same decision, with topic key `agent-brain/<slug>`. The markdown file is the source. Engram is the recall index.
9. **Pattern rule:** three similar premises are enough for a skill draft. One `always` or `never` correction becomes a premise at once, so the next review loads it. It does not become a skill until the pattern rule is met, or until Josep asks for a skill. The draft still waits for accept.
10. **Obsidian:** open the repo folder as a vault. No plugin is required for the first slice.
11. **Premises are markdown files** in `memory/premises/`. A small custom MCP and a CLI read and write those files. Delete moves a premise to `memory/dropped/`. The active list no longer returns it. The file remains for undo.
12. **Browser server:** Chrome DevTools MCP with a persistent profile. See Browser server below.
13. **Obsidian MCP:** the built-in MCP in the Local REST API plugin ([coddingtonbear/obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api)). The API key stays in the user MCP config. It does not go in this repo.

## Parts

### Repo layout

```
agent-brain/
  README.md
  AGENTS.md
  skills/active/          # tools load these, via links
  skills/drafts/          # tools do not load these
  memory/decisions/       # one file per correction
  memory/premises/        # active rules a review must load
  memory/patterns/        # one file per repeated correction
  memory/sessions/        # one file per review day
  memory/dropped/         # premises and drafts Josep removed
  mcp/brain-premises/     # stdio MCP, same rules as the CLI
  templates/
    decision.md
    pattern.md
    session.md
    skill.md
```

`skills/active/` and `skills/drafts/` hold skill directories, not loose markdown files.

### Seed skill

The first active skill is `qdrant-personal-review`. It restates the personal review bar, in short rules the tools can follow:

- Protobuf in `qdrant-cloud-public-api` is the source for an API change.
- A new RPC lands in `qdrant-cloud-cluster-service` (Go), not in `qdrant-cloud-cluster-api` (Python).
- The engine repo `qdrant/` is read-only.
- Copy directories named in the workspace `AGENTS.md` are out of scope.
- A change stays inside the request. Mention unrelated dead code. Leave it in place.
- Run the project check before calling the work done.
- Ask before commit, push, schema change, or production deploy in a Qdrant repo.

This skill points at `/Users/josep/projects/qdrant/AGENTS.md` for the repo map. It does not copy the map.

### Decision note

Path: `memory/decisions/YYYY-MM-DD-<slug>.md`

Fields:

- date
- tool (claude-code, opencode, or codex)
- repo (for example `qdrant-cloud-ui`)
- correction, in one sentence
- strength: `once`, `always`, or `never`
- evidence: file path, or a short quote of what Josep said
- status: `open`, `drafted`, or `active`

`/learn` writes this file and calls Engram. When the strength is `always` or `never`, it also writes an active premise. It does not write a skill.

### Premises

A premise is one rule a review must apply. A skill is a workflow. An Engram observation is a record of a session. The three stay separate so a chat memory cannot overwrite a rule, and a rule does not require a skill promotion.

Path: `memory/premises/<id>.md`

Fields:

- id
- text, one sentence
- strength: `always`, `never`, or `prefer`
- repos: a list, or `*`
- status: `active` or `dropped`
- source: decision note path, when one exists

Human commands, from the brain repo:

```bash
brain premise list [--repo qdrant-cloud-ui]
brain premise add "New RPC lands in cluster-service" --strength always --repo qdrant-cloud-cluster-service
brain premise show <id>
brain premise rm <id>
```

`brain premise rm` sets status to `dropped` and moves the file to `memory/dropped/`. A review does not load dropped premises.

The custom MCP `brain-premises` exposes the same five operations: `premise_list`, `premise_get`, `premise_add`, `premise_update`, `premise_delete`. It also exposes `premise_search` for a text query. The CLI and the MCP call one library. The library reads and writes the markdown files. It does not keep a second database.

Why this server exists: Engram search can miss a rule. A skill is too heavy for a one-line rule. The knowledge-graph memory server is not on Claude Code or Codex. An Obsidian MCP needs the app open. A six-tool server over the markdown files is the small piece none of those provide.

`/review-brain` calls `premise_list` for the repo before it writes findings. The review output quotes each `always` and `never` premise it applied. A `prefer` premise is a note, not a failure, unless the diff breaks it and Josep has marked it `always`.

### MCP servers

| Server | Role in this brain | First slice |
| --- | --- | --- |
| `brain-premises` | List, add, update, and delete premises. | Build it. Register it on all three tools. |
| `chrome-devtools` | Screenshot, console, network, performance trace on a local UI. Login for test environments stays in one profile folder. | Register the official server. Use it when the diff touches `qdrant-cloud-ui` or `qdrant-cloud-admin-v2` and a local URL is up. Skip it for a Go-only or Python-only diff. |
| Obsidian Local REST API | Read and edit vault notes while Obsidian is open. | Register it. Premise add and delete still go through `brain premise` when the agent is the writer. |
| Engram | Session recall across days. | Keep the install that already exists. Run `engram setup <agent>` only when a tool has no Engram server. Codex `config.toml` has no Engram entry today. |
| Context7 | Current library docs. | Keep it. Add it to a tool that does not have it. |
| `brain-lsp` plugin | Definitions, references, and call hierarchy for Go, TypeScript, protobuf, and Python. | Ship it with the brain. Run no code index server. [The code index benchmark](../../../communications/2026-10-26-code-index-benchmark.md) gives the reason. |
| GitHub MCP | Issues and pull requests. | Already on OpenCode. Do not add a second copy. |

### Browser server

Josep wants one folder that keeps test-environment logins, and he wants the next UI check to start already signed in.

Both servers can do that:

|  | Chrome DevTools MCP | Playwright MCP |
| --- | --- | --- |
| Persistent folder | `--user-data-dir` ([configuration](https://developer.chrome.com/docs/devtools/agents/get-started/configuration)) | `--user-data-dir`, and persistent is the default ([profile docs](https://playwright.dev/mcp/configuration/user-profile)) |
| What you lose with a fresh profile | `--isolated` deletes the profile when Chrome closes. That flag fights the login goal. | `--isolated` also starts with no saved login. |
| Extra diagnostic tools | Performance trace, console with source maps, network tools, header redaction | Screenshots, console, storage-state export, cross-browser runs |
| Lock | One Chrome process per profile folder. A second start fails until the first browser closes. | Same lock on one user-data directory. |
| Fit for this brain | Review a Cloud UI page, stay logged in, read console and network, save a screenshot | Repeat the same script in CI, or run a browser other than Chrome |

Choice: Chrome DevTools MCP. The review job is to see the page and keep the test login. Playwright stays a later slice if a check must repeat headless or run outside Chrome.

Profile path: `$HOME/.local/share/agent-brain/chrome-profile`. It sits outside the git repo and outside the Obsidian vault, so cookies and tokens are not notes and are not commits.

Flags:

- `--user-data-dir=$HOME/.local/share/agent-brain/chrome-profile`
- `--no-usage-statistics`
- `--no-performance-crux` so a staging URL is not sent to the Chrome UX report
- `--redact-network-headers`
- no `--isolated`
- no `--autoConnect` to the daily Chrome. That profile holds personal accounts. This one holds test accounts only.

First login: Josep signs in to each test environment once in that Chrome window. Later reviews reuse the cookies. If a second tool reports a profile lock, close the first Chrome window and retry.

Screenshots go to `memory/sessions/screenshots/`. That directory is gitignored. A session note may name the file. It does not embed the image. `--filesystemRoot` includes that directory so the screenshot tool can write there.

### Obsidian MCP

Install the Local REST API community plugin and enable its built-in MCP endpoint. Point Claude Code, OpenCode, and Codex at that endpoint. The API key is an env value in the user MCP config.

Obsidian must be open for this server. When it is closed, `brain premise` and `brain-premises` still work. The agent uses Obsidian MCP to read and edit notes. The agent adds and deletes premises only through `brain premise` or `premise_add` / `premise_delete`, so a delete leaves a file in `memory/dropped/`.

Josep may edit or delete a note by hand in Obsidian. That is a human edit, not an agent delete.

Registration snippets live in `mcp/snippets/`. The builder adds `brain-premises` and `chrome-devtools` to the live user config of each tool:

- Claude Code: `claude mcp add --scope user`
- OpenCode: `mcp.servers` in `~/.config/opencode/opencode.json`
- Codex: `[mcp_servers.*]` in `~/.codex/config.toml`

If the OpenCode file is a copy that `dotfiles/install.sh` overwrites, the builder does not edit dotfiles. It records the snippet in the brain repo and tells Josep that a later install can drop the two servers.

### Gardener

The gardener is a skill, `skill-gardener`, plus a Claude Code agent file at `~/.claude/agents/skill-gardener.md` that only runs this skill.

The gardener:

1. Reads open decision notes and pattern notes.
2. Clusters notes that share a repo and a rule.
3. When the pattern rule is met, writes a skill directory under `skills/drafts/<name>/`.
4. Sets the decision status to `drafted` and writes a pattern note that links to the draft.
5. Stops. It does not move files into `skills/active/`, and it does not commit.

Accept is a separate command, `/accept-skill <name>`:

1. Josep has read the draft.
2. The command moves `skills/drafts/<name>` to `skills/active/<name>`.
3. It refreshes the links for that skill.
4. It commits in the brain repo with message `skill: accept <name>`.
5. It does not push.

Drop moves the draft to `memory/dropped/` and leaves the decision notes open.

### Review command

`/review-brain` loads `qdrant-personal-review` and any other active skill whose description matches the repo (Go, UI, proto). It reviews the current diff in the repo Josep names.

Output order:

1. Findings that break an active skill or a decision note, with file and line.
2. Simplify and performance notes, each tied to a measurement or a concrete duplication. A style preference without a decision note stays out.
3. A suggested `/learn` line when Josep rejects a finding, so the rejection can become a decision.

The command does not edit the diff.

### Session note

`/review-brain` appends a short session file at `memory/sessions/YYYY-MM-DD.md`: repo, tool, finding count, and links to new decision notes. It omits file contents, secrets, and customer data.

### Tool adapters

| Tool | How the brain shows up | What the first slice adds |
| --- | --- | --- |
| Claude Code | Skill links in `~/.claude/skills/`. Agent file for the gardener. | `/learn`, `/garden`, `/review-brain`, `/accept-skill` as skills. Claude Code exposes a skill as a slash command when the skill is installed. |
| OpenCode | Skill links on the one path the probe confirms. Existing `code-reviewer` stays. `/review` in the profile stays. | Skills with `metadata.opencode/slash: "true"` for the four commands. No edit to `dotfiles/agents/`. |
| Codex | Skill links in `~/.codex/skills/` unless the probe shows a double load. | The same skills. Codex has no subagent file in this slice. The skill text is the adapter. |

A README in the brain repo records the probe result: which path each tool read.

### Obsidian

Open `/Users/josep/projects/agent-brain` as a vault. Folders match the repo. A decision note links to the pattern note. A pattern note links to the draft or active skill. No Dataview plugin in the first slice. Wikilinks are enough.

## First slice

In:

- Repo skeleton, templates, seed skill, gardener skill, four commands.
- `brain` CLI and `brain-premises` MCP over `memory/premises/`.
- Chrome DevTools MCP registered on the three tools, with a persistent profile outside the repo, usage stats off, and header redaction on.
- Obsidian Local REST API MCP registered on the three tools. The API key stays out of git.
- Engram setup on any of the three tools that lacks it.
- Local git init. No remote.
- Probe, then skill links.
- README with the probe result and the accept rule.
- One example decision note and one example premise, both marked as examples.

Out:

- Third-party skill installs.
- Stop hook.
- Push.
- Playwright MCP and a web-search MCP.
- Edits to Qdrant repos, dotfiles skill lock, and team docs.

## Verification

The slice is done when all of these are true:

1. `skills/drafts/example-draft/` exists, and none of the three tools list `example-draft` as a skill.
2. `skills/active/qdrant-personal-review/` exists, and each tool that passed the probe lists `qdrant-personal-review`.
3. A dry run of `/learn` writes one decision file and does not create a skill.
4. A dry run of `/garden` on three similar example decisions writes one draft and does not move it to `skills/active/`.
5. `/accept-skill` is not run during verification unless Josep asks. The README shows the command.
6. `brain premise add` writes a file under `memory/premises/`. `brain premise rm` moves it to `memory/dropped/`. `brain premise list` no longer shows it.
7. Each tool lists `premise_list` from `brain-premises`, a screenshot tool from `chrome-devtools`, and the Obsidian MCP when Obsidian is open.
8. The Chrome profile path is `$HOME/.local/share/agent-brain/chrome-profile`, and that path is not inside the git repo.
9. `git status` in `/Users/josep/projects/qdrant` is clean of brain files.
10. `git remote -v` in the brain repo prints no remote.
11. `AGENTS.md` in the brain repo matches the text in this design.

## Later slices, not this build

- Install the missing Addy skills into `~/.agents/skills` so OpenCode and Codex match the Claude Code plugin.
- Add a small Go set from `samber/cc-skills-golang`: style, errors, testing, safety, grpc, performance, observability.
- Add `vercel-react-best-practices` and `vercel-composition-patterns` for `qdrant-cloud-ui`.
- Add a stop hook limited to the Qdrant workspace, append-only, no skill rewrite.
- Add a private remote if Josep wants the vault on a second machine.
- Add Playwright MCP if a UI check must repeat headless, or must run in a browser other than Chrome.
- Add a search MCP only if a probe shows one tool cannot fetch a URL.

## AGENTS.md to ship

The cloud-ui file at `qdrant-cloud-ui/AGENTS.md` is the example: short behavior rules, a test at the end of a section, project facts left to the README. The brain file keeps that shape and adds the memory rules this repo needs. It does not copy the UI lint command or the React layering rules.

The builder writes this text to `AGENTS.md` in the brain repo:

```markdown
# AGENTS.md

Behavioral rules for coding agents in this repo. Commands, paths, and MCP snippets belong in the README.

## 1. Think before coding

**Read first. State assumptions. Ask when two readings exist.**

- Read the file you will change, and the note it links to, before you edit.
- State assumptions. Uncertain: ask.
- Two valid readings: present both. Do not pick in silence.
- A simpler approach exists: say so.
- The request is unclear: stop, name the gap, ask.

## 2. Simplicity first

**The smallest change that does the job.**

- No feature beyond the ask.
- No abstraction with one caller.
- No config for a value that never changes.
- No error handling for a state that cannot happen.
- The CLI and the premise MCP call one library. They do not keep a second database.

The test: a senior engineer would call this overcomplicated. Simplify it.

## 3. Surgical changes

**Touch only what the request names.**

- Do not reformat, rename, or improve adjacent notes, skills, or code.
- Do not rewrite an active skill as a side effect. Match the note style already in the folder.
- Unrelated stale text: mention it. Leave it.
- Remove only the orphans your change created.

The test: every changed line traces to the request.

## 4. Verify before done

**Name the check first. The work is done when the check passes.**

- A premise change: `brain premise list` shows the new state, and the file is in `memory/premises/` or `memory/dropped/`.
- A skill draft: the directory is under `skills/drafts/`, and no tool lists that skill name.
- A review: the output quotes each active `always` and `never` premise for that repo.
- "Looks right" is not a result. Run the check and paste the output.

## 5. Git

**A commit in a Qdrant repo waits for an explicit ask. A push always waits.**

- Never commit in `/Users/josep/projects/qdrant` unless Josep asks in this turn.
- Never push this repo unless Josep asks.
- Never add a co-author.
- `/accept-skill <name>` is the ask to commit that one skill move in this repo. It is not a push.

## 6. Code style

**Flat, named, short.**

- Name a value that comes from a contract. Leave a one-off inline.
- Return early. Do not build an else pyramid.
- Function names stay under 30 characters.
- Braces on every `if`.
- Comments say what the block does and why. Cut the rest.

## 7. Words

**Few words. Cold facts.**

- Comments, commit messages, and replies: cut every word that does not change the meaning.
- No praise, no superlatives.
- Chat with Josep in Spanish when he writes in Spanish. Files in this repo stay in English.

## 8. This brain

**Premises are rules. Skills are workflows. Engram is the session log.**

- This repo is Josep's. It is not a team repo. Do not edit `/Users/josep/projects/qdrant/AGENTS.md`.
- Do not learn from the copy directories named in that workspace file. Do not modify the engine repo `qdrant/`.
- Before a review, call `premise_list` for the repo. Apply every active `always` and `never` premise. Quote each one you applied.
- Add a premise with `brain premise add` or `premise_add`. Remove one with `brain premise rm` or `premise_delete`. Do not delete the markdown file by hand in an agent turn.
- Do not edit `skills/active/` unless Josep accepted that skill in this turn.
- Do not write tokens, `.env` values, or customer data into a note.
- Do not read the Chrome profile directory into a note. Do not commit it.
- Obsidian shows these files. When Obsidian is closed, use the premise CLI and `brain-premises`.
- A UI check uses the Chrome DevTools profile for test logins. It does not use Josep's daily Chrome profile.

**Working if:** a correction becomes a premise Josep can list and delete, the next review quotes it, and no team repo changed unless he asked.
```

## Open questions for Josep

None that block the plan. The calls above are defaults. Override any of them in review.
