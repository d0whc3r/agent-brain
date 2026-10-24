# Personal Qdrant review brain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Josep's personal review brain: a local git repo of skills and premises, a CLI and MCP to list, add, and delete premises, and the links that load active skills in Claude Code, OpenCode, and Codex.

**Architecture:** Markdown files are the store. One Go library reads and writes them. The `brain` CLI and the `brain mcp` server call that library. Active skills are symlinks into each tool's discovery path. Drafts stay off those paths. Obsidian and Chrome DevTools are registered as MCP servers. Engram stays the session log.

**Tech Stack:** Go 1.27 (`go1.27.2` is on this machine), `github.com/modelcontextprotocol/go-sdk/mcp`, git, the existing `engram` binary.

**Spec:** `/Users/josep/projects/specs/2026-10-23-qdrant-review-brain-design.md`

Contents:

- [Global Constraints](#global-constraints)
- [Review Focus](#review-focus)
- [File structure](#file-structure)
- [Spec coverage](#spec-coverage)
- [Not in this plan](#not-in-this-plan)

## Global Constraints

- Repo path: `/Users/josep/projects/qdrant-review-brain`. Local git. No remote. No push.
- Do not edit `/Users/josep/projects/qdrant/AGENTS.md`, `cloud-rc-docs`, or `dotfiles/`.
- Do not commit in `/Users/josep/projects/qdrant`.
- Commits in the brain repo happen only while executing this plan, or via `brain accept-skill`. Message format is in each task. No co-author trailer.
- Skills and notes are English. Chat with Josep is Spanish when he writes in Spanish.
- Premise strengths: `always`, `never`, `prefer`. Status: `active` or `dropped`.
- `brain premise rm` moves the file to `memory/dropped/` and sets status `dropped`. List does not return it.
- Chrome profile: `$HOME/.local/share/qdrant-review-brain/chrome-profile`. Flags: `--user-data-dir` that path, `--no-usage-statistics`, `--no-performance-crux`, `--redact-network-headers`. No `--isolated`. No `--autoConnect`.
- Screenshots directory `memory/sessions/screenshots/` is gitignored.
- Obsidian API key and MCP URL stay out of git.
- Brain skills are not entries in `dotfiles/skills-lock.json`.
- Copy directories named in the Qdrant workspace `AGENTS.md` are out of scope. The engine repo `qdrant/` is read-only.
- No third-party skill install, no Playwright MCP, no web-search MCP, no stop hook.

## Review Focus

These inputs are the ones most likely to bite. Each has a test in the task that owns the code.

1. `brain premise rm` must hide the premise from `list` and keep the file under `memory/dropped/`. A person expects undo, not a vanished rule. Test: `TestDeleteMovesAndHides` in Task 2.
2. `list --repo qdrant-cloud-ui` must include a premise whose repos are `*` and exclude a premise scoped only to `qdrant-cloud-cluster-service`. Test: `TestListRepoFilter` in Task 2.
3. An id of `../dropped` or `foo/bar` must be rejected. A person expects the store to stay inside `memory/premises/`. Test: `TestRejectPathID` in Task 2.
4. Premise text that looks like a token (`api_key=abcdefghij123456`) must be rejected. A person expects the note store to refuse a secret. Test: `TestRejectSecretText` in Task 2.
5. `brain accept-skill ../x` and `brain link-skills` must not publish `skills/drafts/example-draft`. A person expects drafts to stay invisible to the tools. Tests: `TestAcceptRejectsDotDot` in Task 6 and `TestLinkSkipsDrafts` in Task 6.

## File structure

| Path | Responsibility |
| --- | --- |
| `AGENTS.md` | Behavior rules. Exact text from the spec section "AGENTS.md to ship". |
| `README.md` | Commands, MCP snippets, probe result. |
| `internal/premise/store.go` | Open, list, get, add, update, delete, search. |
| `internal/premise/store_test.go` | Store tests. |
| `cmd/brain/main.go` | CLI and `mcp` subcommand. |
| `skills/active/<name>/SKILL.md` | Skills the tools load. |
| `skills/drafts/example-draft/SKILL.md` | Draft that must not be linked. |
| `mcp/snippets/` | Config fragments. No secrets. |
| `scripts/check-layout.sh` | File and gitignore checks. |

---

### Task 1: Repo skeleton

**Files:**

- Create: `/Users/josep/projects/qdrant-review-brain/AGENTS.md`
- Create: `/Users/josep/projects/qdrant-review-brain/README.md`
- Create: `/Users/josep/projects/qdrant-review-brain/.gitignore`
- Create: `/Users/josep/projects/qdrant-review-brain/templates/decision.md`
- Create: `/Users/josep/projects/qdrant-review-brain/templates/premise.md`
- Create: `/Users/josep/projects/qdrant-review-brain/templates/pattern.md`
- Create: `/Users/josep/projects/qdrant-review-brain/templates/session.md`
- Create: `/Users/josep/projects/qdrant-review-brain/templates/skill.md`
- Create: `/Users/josep/projects/qdrant-review-brain/scripts/check-layout.sh`
- Create: empty dirs `memory/decisions`, `memory/premises`, `memory/patterns`, `memory/sessions`, `memory/sessions/screenshots`, `memory/dropped`, `skills/active`, `skills/drafts`, `mcp/snippets`
- Copy: the spec to `docs/superpowers/specs/2026-10-23-qdrant-review-brain-design.md`
- Copy: this plan to `docs/superpowers/plans/2026-10-23-qdrant-review-brain.md`

**Interfaces:**

- Consumes: the spec section "AGENTS.md to ship"
- Produces: repo root `/Users/josep/projects/qdrant-review-brain` with no git remote

- [ ] **Step 1: Create the directory and git repo**

```bash
mkdir -p /Users/josep/projects/qdrant-review-brain
git -C /Users/josep/projects/qdrant-review-brain init
```

Expected: `Initialized empty Git repository`.

- [ ] **Step 2: Write `AGENTS.md` by copying the fenced text in the spec section "AGENTS.md to ship"**

Do not paraphrase. The file starts with `# AGENTS.md` and ends with the "Working if" line.

- [ ] **Step 3: Write `.gitignore`**

Exact lines:

```
memory/sessions/screenshots/*
!memory/sessions/screenshots/.gitkeep
mcp/snippets/obsidian.url
mcp/snippets/obsidian.key
.DS_Store
```

- [ ] **Step 4: Write `scripts/check-layout.sh`**

The script exits 0 only when all of these are true:

- `AGENTS.md` contains the line `Premises are rules. Skills are workflows. Engram is the session log.`
- `git remote -v` prints nothing
- `git check-ignore -q memory/sessions/screenshots/shot.png` succeeds after that path is created as an empty file for the check, then the script deletes that file
- the Chrome profile path is not inside the repo: the script prints the profile path and exits 1 if it starts with the repo root

- [ ] **Step 5: Write the five templates**

Each template is YAML frontmatter plus one sentence: "Replace the sample values. Do not commit secrets."

- `templates/premise.md` fields: `id`, `text`, `strength`, `repos`, `status`, `source`
- `templates/decision.md` fields: `date`, `tool`, `repo`, `correction`, `strength`, `evidence`, `status`
- `templates/pattern.md` fields: `id`, `premise_ids`, `draft_skill`, `status`
- `templates/session.md` fields: `date`, `tool`, `repo`, `finding_count`, `decision_links`
- `templates/skill.md` fields: `name`, `description`

- [ ] **Step 6: Write a short `README.md`**

Include the repo path, the four human commands from the spec (`brain premise list`, `add`, `show`, `rm`), the profile path, and a "Probe" heading left empty for Task 8.

- [ ] **Step 7: Run the layout check**

Run: `bash scripts/check-layout.sh`  
Expected: exit 0.

- [ ] **Step 8: Confirm the Qdrant workspace is untouched**

Run: `git -C /Users/josep/projects/qdrant status --short`  
Expected: no brain files. Do not commit there.

- [ ] **Step 9: Commit in the brain repo only**

```bash
git add AGENTS.md README.md .gitignore templates scripts memory skills mcp docs
git commit -m "chore: add review brain skeleton"
```

---

### Task 2: Premise store

**Files:**

- Create: `internal/premise/store.go`
- Create: `internal/premise/store_test.go`
- Create: `go.mod`
- Test: `internal/premise/store_test.go`

**Interfaces:**

- Consumes: repo layout from Task 1 (`memory/premises`, `memory/dropped`)
- Produces:

```go
package premise

type Strength string // "always" | "never" | "prefer"
type Status string   // "active" | "dropped"

type Premise struct {
    ID       string
    Text     string
    Strength Strength
    Repos    []string
    Status   Status
    Source   string
}

func Open(root string) (*Store, error)
func (s *Store) List(repo string) ([]Premise, error)
func (s *Store) Get(id string) (Premise, error)
func (s *Store) Add(p Premise) (Premise, error)
func (s *Store) Update(id string, p Premise) (Premise, error)
func (s *Store) Delete(id string) error
func (s *Store) Search(query string) ([]Premise, error)
```

`Open` creates `memory/premises` and `memory/dropped` if missing. `List("")` returns every active premise. `List("qdrant-cloud-ui")` returns active premises whose `repos` contain that name or `*`. `Add` with an empty ID slugs `Text` to `^[a-z0-9]+(-[a-z0-9]+)*$`. A collision returns an error. `Update` does not change `ID`. `Delete` writes `status: dropped` and moves the file to `memory/dropped/<id>.md`.

File shape:

```markdown
---
id: new-rpc-cluster-service
text: New RPC lands in cluster-service
strength: always
repos:
  - qdrant-cloud-cluster-service
status: active
source: ""
---
```

- [ ] **Step 1: Write the failing tests**

Tests, each with a temp directory:

- `TestAddAndList` adds one premise and expects `List("")` length 1 and text `New RPC lands in cluster-service`.
- `TestDeleteMovesAndHides` adds, deletes, expects `List("")` length 0 and a file at `memory/dropped/<id>.md` whose status is `dropped`.
- `TestListRepoFilter` adds one premise with repos `["*"]` and one with repos `["qdrant-cloud-cluster-service"]`. `List("qdrant-cloud-ui")` returns only the `*` premise.
- `TestRejectPathID` calls `Add` with ID `../dropped` and expects an error. The temp root has no file outside `memory/`.
- `TestRejectSecretText` calls `Add` with text `api_key=abcdefghij123456` and expects an error. No file is written.
- `TestSearch` adds two premises and expects `Search("cluster-service")` to return the one whose text contains that substring, case insensitive.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `go test ./internal/premise/ -count=1`  
Expected: FAIL, package or symbols missing.

- [ ] **Step 3: Implement `Open`, `List`, `Get`, `Add`, `Update`, `Delete`, `Search`**

Reject an ID that does not match `^[a-z0-9]+(-[a-z0-9]+)*$`. Reject text that matches `(?i)(api[_-]?key|token|secret|authorization)\s*[:=]\s*\S{8,}` or contains `BEGIN PRIVATE KEY`. Use the Go standard library for files and YAML frontmatter. Do not add a database.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `go test ./internal/premise/ -count=1`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add go.mod go.sum internal/premise
git commit -m "feat: add premise store"
```

---

### Task 3: CLI

**Files:**

- Create: `cmd/brain/main.go`
- Create: `cmd/brain/main_test.go`
- Test: `cmd/brain/main_test.go`

**Interfaces:**

- Consumes: `premise.Open`, `List`, `Get`, `Add`, `Update`, `Delete`, `Search`
- Produces: binary `brain` with these invocations:

```text
brain premise list [--repo name]
brain premise add TEXT --strength always|never|prefer [--repo name ...] [--id slug] [--source path]
brain premise show ID
brain premise rm ID
brain premise search QUERY
```

Exit 0 on success. Exit 2 when the store rejects the input. Exit 1 when the id is missing or the usage is wrong. Root comes from `BRAIN_ROOT`, else `/Users/josep/projects/qdrant-review-brain`.

- [ ] **Step 1: Write the failing CLI tests**

Use `go test` and a temp `BRAIN_ROOT`. Invoke the command function, not a shell, so the test does not depend on `PATH`.

- `TestCLIAddListRm` adds `New RPC lands in cluster-service` with `--strength always --repo qdrant-cloud-cluster-service`, expects list output to contain that text, then `rm` expects list output to omit it.
- `TestCLISecretExitCode` adds `api_key=abcdefghij123456` and expects exit 2.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `go test ./cmd/brain/ -count=1`  
Expected: FAIL.

- [ ] **Step 3: Implement the CLI in `cmd/brain/main.go`**

Parse with the standard library `flag` package. Call the store. Print one premise per line as `id\tstrength\ttext` for list and search.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `go test ./cmd/brain/ -count=1`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cmd/brain
git commit -m "feat: add brain premise CLI"
```

---

### Task 4: Premise MCP

**Files:**

- Modify: `cmd/brain/main.go`
- Create: `cmd/brain/mcp.go`
- Create: `cmd/brain/mcp_test.go`
- Test: `cmd/brain/mcp_test.go`

**Interfaces:**

- Consumes: the same store methods
- Produces: `brain mcp` on stdio, tools `premise_list`, `premise_get`, `premise_add`, `premise_update`, `premise_delete`, `premise_search`

Tool arguments match the store fields. `premise_list` takes optional `repo`. `premise_delete` takes `id`. Use `github.com/modelcontextprotocol/go-sdk/mcp`.

- [ ] **Step 1: Write the failing test**

`TestMCPAddAndList` builds the server in-process, calls `premise_add` then `premise_list`, and expects one premise. Use a temp `BRAIN_ROOT`.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `go test ./cmd/brain/ -run TestMCPAddAndList -count=1`  
Expected: FAIL.

- [ ] **Step 3: Implement `brain mcp`**

Register the six tools. Each tool calls the store and returns the premise JSON. Do not start a second store implementation.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `go test ./cmd/brain/ -count=1`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cmd/brain go.mod go.sum
git commit -m "feat: add brain-premises MCP"
```

---

### Task 5: Skills and example notes

**Files:**

- Create: `skills/active/qdrant-personal-review/SKILL.md`
- Create: `skills/active/skill-gardener/SKILL.md`
- Create: `skills/active/learn/SKILL.md`
- Create: `skills/active/garden/SKILL.md`
- Create: `skills/active/review-brain/SKILL.md`
- Create: `skills/active/accept-skill/SKILL.md`
- Create: `skills/active/brain-probe/SKILL.md`
- Create: `skills/drafts/example-draft/SKILL.md`
- Create: `memory/decisions/2026-10-23-example.md`
- Create: `memory/premises/example-new-rpc.md`
- Test: `scripts/check-skills.sh`

**Interfaces:**

- Consumes: premise field names from Task 2
- Produces: skill names the linker in Task 6 will publish: `qdrant-personal-review`, `skill-gardener`, `learn`, `garden`, `review-brain`, `accept-skill`, `brain-probe`. It will not publish `example-draft`.

Each `SKILL.md` starts with frontmatter `name` equal to the directory name and a `description` of at most 1024 characters. Set `metadata.opencode/slash` to `"true"` on `learn`, `garden`, `review-brain`, and `accept-skill`.

Pin these description sentences:

- `qdrant-personal-review`: `Personal Qdrant Cloud review rules. Use before reviewing a diff in qdrant-cloud-ui, qdrant-cloud-cluster-service, qdrant-cloud-cluster-api, or qdrant-cloud-public-api.`
- `skill-gardener`: `Draft a skill from repeated premises. Use when Josep asks to garden. Write only under skills/drafts. Do not edit skills/active.`
- `learn`: `Record a correction as a decision note and, when strength is always or never, as an active premise. Use when Josep states a rule to keep.`
- `review-brain`: `Review the current diff against active premises and qdrant-personal-review. Use when Josep asks for a brain review. Call premise_list first. Do not edit the diff.`
- `accept-skill`: `Move an accepted draft skill to skills/active and commit that move in the brain repo. Use only after Josep names the skill.`

Body rules the check script must find as literal strings:

- `qdrant-personal-review` contains `qdrant-cloud-cluster-service`, `qdrant-cloud-ui-copy`, and `read-only`.
- `skill-gardener` contains `skills/drafts` and `three similar premises`. It does not contain a line that tells the agent to write into `skills/active`.
- `learn` contains `memory/decisions` and `do not create a skill`.
- `review-brain` contains `premise_list` and `do not edit the diff`.
- `accept-skill` contains `brain accept-skill` and `do not push`.

The example decision and example premise are marked `example: true` in frontmatter. The example premise text is `New RPC lands in cluster-service` and strength is `always`.

- [ ] **Step 1: Write `scripts/check-skills.sh`**

Exit 0 only when:

- each active skill directory name equals the frontmatter `name`
- `skills/drafts/example-draft/SKILL.md` exists
- the literal strings in the body rules above are present
- `skills/active/skill-gardener/SKILL.md` has no line that contains both `write` and `skills/active`
- the example premise file contains `example: true`

- [ ] **Step 2: Run the check and confirm it fails**

Run: `bash scripts/check-skills.sh`  
Expected: exit 1.

- [ ] **Step 3: Write the skill files and example notes**

- [ ] **Step 4: Run the check and confirm it passes**

Run: `bash scripts/check-skills.sh`  
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add skills memory/decisions memory/premises scripts/check-skills.sh
git commit -m "feat: add review skills and example notes"
```

---

### Task 6: Accept and link

**Files:**

- Create: `internal/skills/accept.go`
- Create: `internal/skills/link.go`
- Create: `internal/skills/accept_test.go`
- Create: `internal/skills/link_test.go`
- Modify: `cmd/brain/main.go`
- Test: `internal/skills/accept_test.go`, `internal/skills/link_test.go`

**Interfaces:**

- Consumes: skill directory names from Task 5
- Produces:

```go
func Accept(root, name string) error
func Link(root string, targets []string, apply bool) ([]string, error)
```

`Accept` moves `skills/drafts/<name>` to `skills/active/<name>`, then commits only that path with message `skill: accept <name>`. It returns an error for a name that fails `^[a-z0-9]+(-[a-z0-9]+)*$`, for a missing draft, and for an existing active skill. It does not push.

`Link` with `apply=false` returns the `ln -sfn` lines and creates nothing. `Link` links only directories in `skills/active`. It never links `skills/drafts`.

- [ ] **Step 1: Write the failing tests**

- `TestAcceptRejectsDotDot` calls `Accept(root, "../x")` and expects an error. No directory outside `root` is created.
- `TestAcceptMovesDraft` creates `skills/drafts/demo/SKILL.md` in a temp git repo, calls `Accept`, expects the draft path gone, the active path present, and `git log -1 --format=%s` equal to `skill: accept demo`.
- `TestLinkSkipsDrafts` creates one active skill and `skills/drafts/example-draft`, calls `Link` with `apply=false`, and expects the returned lines to contain the active name and not `example-draft`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `go test ./internal/skills/ -count=1`  
Expected: FAIL.

- [ ] **Step 3: Implement `Accept` and `Link` and wire `brain accept-skill` and `brain link-skills`**

CLI:

```text
brain accept-skill NAME
brain link-skills [--apply] --target PATH [--target PATH ...]
```

`brain link-skills` without `--apply` is a dry-run. Targets come from repeated `--target` flags, not from a hardcoded home path, so tests stay local.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `go test ./internal/skills/ ./cmd/brain/ -count=1`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/skills cmd/brain
git commit -m "feat: accept and link skills"
```

---

### Task 7: MCP registration files

**Files:**

- Create: `mcp/snippets/chrome-devtools.json`
- Create: `mcp/snippets/brain-premises.json`
- Create: `mcp/snippets/obsidian.md`
- Modify: `README.md`
- Test: `scripts/check-snippets.sh`

**Interfaces:**

- Consumes: `brain mcp` from Task 4, profile path from Global Constraints
- Produces: snippet files the human configs can copy. This task does not edit `dotfiles/`.

`chrome-devtools.json` command is `npx`, args are exactly:

```text
-y
chrome-devtools-mcp@latest
--user-data-dir=${HOME}/.local/share/qdrant-review-brain/chrome-profile
--no-usage-statistics
--no-performance-crux
--redact-network-headers
--filesystemRoot=${HOME}/projects/qdrant-review-brain/memory/sessions/screenshots
```

`brain-premises.json` command is `/Users/josep/.local/bin/brain`, args are `["mcp"]`, and env `BRAIN_ROOT` is `/Users/josep/projects/qdrant-review-brain`.

`obsidian.md` tells Josep to install the Local REST API plugin, copy its MCP URL into `mcp/snippets/obsidian.url`, and copy the API key into `mcp/snippets/obsidian.key`. Both files are gitignored. The agent adds and deletes premises only through `brain premise` or the premise MCP.

- [ ] **Step 1: Write `scripts/check-snippets.sh`**

Exit 0 only when the chrome snippet contains `--no-usage-statistics`, `--redact-network-headers`, and the profile path, and does not contain `--isolated` or `--autoConnect`. Exit 1 if `obsidian.key` is tracked by git.

- [ ] **Step 2: Run the check and confirm it fails**

Run: `bash scripts/check-snippets.sh`  
Expected: exit 1.

- [ ] **Step 3: Write the three snippet files**

Create the profile directory:

```bash
mkdir -p "$HOME/.local/share/qdrant-review-brain/chrome-profile"
go build -o /Users/josep/.local/bin/brain ./cmd/brain
```

- [ ] **Step 4: Register chrome-devtools and brain-premises in the live user configs**

If `readlink ~/.config/opencode/opencode.json` points into `dotfiles`, do not edit that file. Record that fact in the README and skip the OpenCode edit. Otherwise add the two servers:

- Claude Code: `claude mcp add --scope user` for `chrome-devtools` and `brain-premises`
- OpenCode: `mcp.servers` in `~/.config/opencode/opencode.json` only when that file is not a dotfiles symlink
- Codex: `[mcp_servers.chrome-devtools]` and `[mcp_servers.brain-premises]` in `~/.codex/config.toml`

Do not register Obsidian until `obsidian.url` and `obsidian.key` exist. Those files are Josep's step. The README says so.

- [ ] **Step 5: Run the check and confirm it passes**

Run: `bash scripts/check-snippets.sh`  
Expected: exit 0.

Run: `test -d "$HOME/.local/share/qdrant-review-brain/chrome-profile"`  
Expected: exit 0.

- [ ] **Step 6: Commit snippets only**

```bash
git add mcp/snippets/chrome-devtools.json mcp/snippets/brain-premises.json mcp/snippets/obsidian.md README.md scripts/check-snippets.sh
git commit -m "docs: add MCP snippets"
```

Do not add `obsidian.url` or `obsidian.key`.

---

### Task 8: Probe, Engram, README

**Files:**

- Modify: `README.md`
- Create: `mcp/link-targets.txt` after the probe, only with paths that do not double-load

**Interfaces:**

- Consumes: `brain link-skills` from Task 6, active skill names from Task 5
- Produces: README probe section and symlinks for active skills only

- [ ] **Step 1: Write the probe record before linking**

Run:

```bash
test -d ~/.claude/skills && echo claude
test -d ~/.agents/skills && echo agents
test -d ~/.codex/skills && echo codex
test -d ~/.config/opencode/skills && echo opencode-config
```

Write `mcp/link-targets.txt` with one path per line, using this rule from the spec:

- Claude Code: `~/.claude/skills`
- OpenCode: `~/.agents/skills` if that directory exists. Do not also link `~/.config/opencode/skills`.
- Codex: `~/.codex/skills` unless a one-skill probe shows Codex also reads `~/.agents/skills`. If that double load is true, omit the Codex line and write the reason in the README.

- [ ] **Step 2: Dry-run the links**

Run `brain link-skills` with one `--target` flag per line in `mcp/link-targets.txt`, and without `--apply`.

Expected: lines for `qdrant-personal-review` and `brain-probe`. No line contains `example-draft`.

- [ ] **Step 3: Apply the links**

Run the same command with `--apply`. Do not run `brain accept-skill` on `example-draft`.

Then:

```bash
test -L ~/.claude/skills/qdrant-personal-review
test ! -e ~/.claude/skills/example-draft
test ! -e ~/.agents/skills/example-draft
test ! -e ~/.codex/skills/example-draft
```

Expected: all succeed. Skip a path that Task 8 Step 1 omitted, and say which path in the README.

- [ ] **Step 4: Engram on tools that lack it**

OpenCode already has an `engram` MCP entry. Claude Code has the Engram plugin. Codex `config.toml` had no Engram entry on 2026-10-23.

If `rg -q 'mcp_servers.engram' ~/.codex/config.toml` fails, run `engram setup codex`. Do not run it when the entry exists.

- [ ] **Step 5: Fill the README probe section**

Paste the dry-run output, the symlink checks, and whether `engram setup codex` ran. State that live "tool lists the skill" confirmation is one session per tool, and that Obsidian registration waits for the two gitignored files.

- [ ] **Step 6: Run the spec checks that this repo can run**

```bash
bash scripts/check-layout.sh
bash scripts/check-skills.sh
bash scripts/check-snippets.sh
go test ./... -count=1
git -C /Users/josep/projects/qdrant-review-brain remote -v
git -C /Users/josep/projects/qdrant status --short
```

Expected: script exits 0, tests PASS, remote prints nothing, Qdrant status shows no brain files.

- [ ] **Step 7: Commit**

```bash
git add README.md mcp/link-targets.txt
git commit -m "docs: record skill probe"
```

---

## Spec coverage

| Spec requirement                          | Task       |
| ----------------------------------------- | ---------- |
| Repo, AGENTS.md, templates, no remote     | 1          |
| Premise list, add, delete, search         | 2, 3, 4    |
| Secret and path rejection                 | 2          |
| Seed skill and example notes              | 5          |
| Gardener writes drafts only               | 5          |
| Accept moves and commits, no push         | 6          |
| Drafts not linked                         | 6, 8       |
| Chrome DevTools profile and flags         | 7          |
| Obsidian MCP instructions, key out of git | 7          |
| Engram on Codex if missing                | 8          |
| No team file edits, no third-party skills | every task |

## Not in this plan

- Playwright MCP, web-search MCP, stop hook, third-party skill installs, a git remote, and the Obsidian plugin install. Josep installs that plugin and fills the two gitignored files.
