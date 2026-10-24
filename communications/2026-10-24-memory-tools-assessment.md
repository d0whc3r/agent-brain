# Local premise management and memory tools

Date: 2026-10-24.

The user asked to improve premise understanding, assess Obsidian MCP and alternatives for a growing knowledge base, and configure the result. The user chose local storage and no paid services. This assessment is documentation, not a premise or an installed workflow.

Contents:

- [Recommendation](#recommendation)
- [Evidence](#evidence)
- [Separate rules from recalled knowledge](#separate-rules-from-recalled-knowledge)
- [Market comparison](#market-comparison)
- [Community and operational evidence](#community-and-operational-evidence)
- [Changes configured now](#changes-configured-now)
- [Growth plan](#growth-plan)
- [Verification boundary](#verification-boundary)

## Recommendation

Keep Markdown as the premise source and `brain-premises` as the rule interface. Use Obsidian Bases to inspect the same notes. Keep Engram in its existing session role. Add a separate retrieval index only when measured searches over durable knowledge justify it.

For that later index, pilot QMD first when the main need is searching decisions and explanations without changing their format. Basic Memory is the stronger alternative when the main need becomes authoring interconnected knowledge notes with observations and relations. Neither should replace the premise contract without demonstrating scope, status, and mandatory-rule coverage.

This recommendation follows the observed size and the user's requirements; it is not a benchmark ranking of the products below.

## Evidence

| Label | Meaning |
| --- | --- |
| Observed | Read from this checkout, tool configuration, or the local app during this assessment |
| Documented | Described by the project's own documentation or implementation |
| Reported | A first-hand issue or community report; not reproduced here |
| Proposed | A future experiment, not configured or measured here |

Observed before implementation: 16 premise notes, 6,486 bytes, 13 active and 3 candidate. Nine active global premises apply to this personal repo. There are three decision notes and no pattern notes. This is a small rule store; a growing session database does not make all sessions durable knowledge.

Observed: Codex and Claude Code already register `brain-premises`. This vault has Bases enabled, no community-plugin registration, and neither private Obsidian MCP setup file. The Obsidian app was closed initially. After opening the vault, its window reported version 1.14.5; the application bundle's installer metadata reported 1.12.7. The Obsidian CLI is not registered on PATH. QMD is not installed. Engram and Ollama are installed.

Before this change, premise search made two directory passes and matched only a literal substring in rule text. There was no search filter for repo, scope, or status. The MCP initialization supplied no explanation of how rule polarity, candidates, or evidence should be interpreted.

## Separate rules from recalled knowledge

Rules need exhaustive selection by repo, scope, and active status. `always` requires the described action; `never` prohibits it; `prefer` supplies a default. A candidate is evidence awaiting promotion, not an active instruction. The decision note explains a rule's origin.

Recalled knowledge can be ranked by relevance, returned as short excerpts, and read on demand. A similarity score cannot prove that every applicable prohibition was retrieved. Searching is useful for discovery and repeat detection; the complete `premise_list` remains necessary before work or review.

That distinction is an architectural inference from this repo's contract. MCP itself is a transport and tool interface; choosing an Obsidian MCP does not add the brain's validation, promotion policy, or archive behavior.

## Market comparison

The fit column is this assessment's judgment. Local capability does not establish the behavior of an installed instance; only the existing brain was exercised here.

| Tool | Documented capability and storage | Fit for this brain |
| --- | --- | --- |
| [Obsidian Local REST API with native MCP](https://github.com/coddingtonbear/obsidian-local-rest-api) | Authenticated vault CRUD, live metadata, active note, commands, and Streamable HTTP MCP inside Obsidian | Useful for app integration. Requires the app and plugin; arbitrary vault writes do not enforce the premise contract. Optional. |
| [Obsidian CLI](https://obsidian.md/help/cli) | Search, properties, Bases queries, and commands through the desktop app | Useful for local app automation. It requires the running app and can launch it. The brain CLI already covers rule operations with Obsidian closed. |
| [Basic Memory](https://docs.basicmemory.com/reference/technical-information) | Markdown is primary; a derived database indexes notes, observations, and relations; MCP and a file watcher expose them | Closest general knowledge-management alternative. Pilot separately before allowing it to write premise frontmatter. |
| [QMD](https://github.com/tobi/qmd) | Local BM25, vector search, hybrid fusion, reranking, collections, document retrieval, and MCP | Preferred retrieval pilot. Keep its index rebuildable and its corpus restricted to durable knowledge. It is not a rule lifecycle manager. |
| [Seekstone](https://github.com/shaqmughal/seekstone) | Direct vault filesystem access, a warm search index, frontmatter queries, and read/write MCP tools without the app | Relevant for Obsidian-shaped queries. A general write tool still bypasses premise validation. Evaluate independently before selecting it over QMD. |
| [Engram](https://github.com/Gentleman-Programming/engram) | Go service with SQLite and FTS5, project-aware memory, CLI and MCP | Already available. Preserve its session role; do not copy the authoritative rule set into it. |
| [Mem0 OSS](https://github.com/mem0ai/mem0/blob/main/docs/open-source/overview.mdx) | Configurable fact extraction and retrieval using model, vector, and history components; library or self-hosted server | Useful when building a memory-backed application. Adds another fact store and processing pipeline. Its defaults use OpenAI; fully local operation requires explicit local providers. |
| [Graphiti](https://github.com/getzep/graphiti) | Temporal knowledge graphs, episode ingestion, entity/relationship extraction, hybrid retrieval, and reference MCP servers | Appropriate for changing facts and historical relationships. Adds a graph database and model processing without solving this repo's rule contract. |
| [Hindsight](https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/docs-integrations/local-mcp.md) | Local MCP with embedded PostgreSQL, memory banks, retain/recall/reflect, and an Ollama option | A candidate if reasoning over accumulated episodes becomes the central need. More processing and another authoritative memory store than this change needs. |
| [Letta](https://docs.letta.com/v1-sdk/concepts/stateful-agents) | Stateful agents; its documented v1 API pins and shares editable memory blocks | Useful when adopting an agent runtime. The cited API is marked legacy; evaluate the current SDK separately for a runtime migration. It is not a drop-in shared premise registry. |
| [MCP reference memory server](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) | Entities, relations, observations, and a local JSONL store | A simple graph memory example. Adopting it would add another source without the existing scope, status, or archive semantics. |

Basic Memory's current local semantic search uses FastEmbed and sqlite-vec. Its documentation describes a keyword fallback when a Python build cannot load SQLite extensions. It also exposes query inspection. These are useful capabilities, but a successful install alone would not prove semantic recall on this machine. [Semantic search documentation](https://docs.basicmemory.com/concepts/semantic-search).

QMD's default embedding, reranking, and expansion models total roughly 2 GB of downloads according to its README. BM25 can be used without running those model stages. Its MCP supports typed lexical/vector queries and a reranking switch. Use the schema of a pinned installed release: the README and source references consulted during this assessment differed on whether a plain `query` string was accepted. [QMD README](https://github.com/tobi/qmd), [MCP implementation](https://github.com/tobi/qmd/blob/main/src/mcp/server.ts).

## Community and operational evidence

An author-reported QMD issue measured large CPU reranking latency and requested a faster hybrid path. That report concerns its own hardware and older releases, not this Mac; current QMD documents `--no-rerank`. The lesson for a pilot is to compare lexical, vector, and reranked modes separately. [QMD issue 264](https://github.com/tobi/qmd/issues/264).

A Basic Memory user reported duplicated frontmatter that hid note descriptions from parsers. The issue is closed and linked to a fix; it is not evidence that the current release still has the defect. It does explain why a trial should hash source notes and check metadata preservation before pointing another writer at this vault. [Basic Memory issue 1171](https://github.com/basicmachines-co/basic-memory/issues/1171).

Seekstone's author posted filesystem search and payload comparisons on the Obsidian forum. Those comparisons used the author's queries and vaults, with some results captured at different times. They are leads for reproducible testing, not independent proof that it is the best server. The forum page was returned by search but direct fetching failed during this assessment. [Author's forum post](https://forum.obsidian.md/t/seekstone-obsidian-mcp-server-for-claude-that-works-with-obsidian-closed-and-returns-2-kb-per-search-benchmarked-against-7-others/118791), [project repository](https://github.com/shaqmughal/seekstone).

Hindsight's project blog explains its combination of keyword, vector, entity, and temporal retrieval. It supports the comparison of approaches, not a claim of superior quality for these premises. No advertised benchmark score was used to select the implementation. [Project blog](https://github.com/vectorize-io/hindsight/blob/main/hindsight-docs/blog/2026-03-04-mcp-agent-memory.md).

## Changes configured now

- The MCP sends initialization instructions covering complete rule loading, rule polarity, candidate status, evidence, repeat detection, and the validated write path. Tool descriptions and read-only/mutation hints expose these distinctions at the tool boundary. MCP annotations are descriptive hints, not permission enforcement. [MCP schema](https://modelcontextprotocol.io/specification/2025-11-25/schema#toolannotations).
- `premise_search` and `brain premise search` accept optional repo, scope, and status filters. Existing calls without filters still search active and candidate notes. Matching includes IDs and remains case-insensitive and literal. A search reads the premise directory once and returns IDs in order.
- [premises.base](../premises.base) adds Active, Candidates, and Archived views over existing files, with explicit Required, Forbidden, Preferred, and Not active labels. This uses Obsidian's core Bases feature without a community plugin. [Bases syntax](https://obsidian.md/help/bases/syntax).
- [Integration guidance](../docs/integrations.md) explains which interface to use. The optional Obsidian MCP notes now distinguish private setup inputs from actual client registration. The installer does not register a general Obsidian server.

No premises were rewritten or promoted. No new model, index service, dependency, paid account, or external memory store was installed. Obsidian Bases cells remain editable by the user; this view is not a write-protection mechanism. Agents must route rule changes through the brain library.

## Growth plan

First improve the corpus: one rule per note, a clear strength, scope, repo set, source, and lifecycle state. Keep the existing candidate/repeat process and inspect `brain premise stats` before promoting, merging, or retiring rules. Ask the user to resolve contradictions; do not let similarity merge rules or change their strength.

If durable decisions and patterns become hard to find, pilot a rebuildable index over those folders. Exclude vendor skills, `node_modules`, `.git`, `.obsidian`, credentials, captures, and raw session history. Keep work and personal collections separate. A retrieval filter is a relevance boundary, not an access-control guarantee.

Use a labeled set of at least 20 real questions, including Spanish questions about English notes, paraphrases, exact identifiers, negatives, missing answers, and work/personal isolation. Proposed acceptance conditions: the expected source appears in the first five results for at least 18 questions; no out-of-scope result; unchanged source hashes; edits and archived removals reflected after refresh; rebuild produces the same source set. Measure cold and warm latency plus returned bytes. A proposed warm p95 target is below one second; this is a target, not a measured result.

Start with QMD BM25. Add multilingual vector search only if it improves the labeled failures, and reranking only if its added latency is justified. Revalidate selected rules against `brain-premises`, regardless of index metadata. If explicit note relationships and authoring become more useful than retrieval alone, repeat the trial with Basic Memory on a separate copy and verify its sync behavior before any migration.

There is no measured note-count threshold requiring a graph or vector database. Failed recall, context volume, update correctness, and latency should trigger a change. Exhaustive mandatory-rule selection still requires 100% coverage; the knowledge-search target above does not apply to rules.

## Verification boundary

The new search behavior was tested against global, personal, work, repository-specific, active, and candidate rules, including an empty scope and invalid status. A real stdio MCP client checks initialization instructions and CLI/MCP result parity. The Obsidian view was inspected in the running app. The branch DoD records the final repository checks and UI evidence.

These checks establish the brain change, not that any external alternative has been installed or benchmarked. Reconnect existing `brain-premises` clients to receive the new instructions and schema; the existing drift guard rejects calls from a process that loaded older code.
