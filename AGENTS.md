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

- Never commit in `/Users/josep/projects/qdrant` unless the user asks in this turn.
- Never push this repo unless the user asks.
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
- Chat with the user in Spanish when the user writes in Spanish. Files in this repo stay in English.

## 8. This brain

**Premises are rules. Skills are workflows. Engram is the session log.**

The user talks in natural language. You run `brain` and the review steps. Do not ask the user to type a slash command. Read `docs/use-cases.md` when the request matches a case there.

- This repo is the user's. It is not a team repo. Do not edit `/Users/josep/projects/qdrant/AGENTS.md`.
- Do not learn from the copy directories named in that workspace file. Do not modify the engine repo `qdrant/`.
- Before a review, call `premise_list` for the repo. Apply every active `always` and `never` premise. Quote each one you applied.
- Add a premise with `brain premise add` or `premise_add`. Remove one with `brain premise rm` or `premise_delete`. Do not delete the markdown file by hand in an agent turn.
- Do not edit `skills/active/` unless the user accepted that skill in this turn.
- Do not write tokens, `.env` values, or customer data into a note.
- Do not read the Chrome profile directory into a note. Do not commit it.
- Obsidian shows these files. When Obsidian is closed, use the premise CLI and `brain-premises`.
- A UI check uses the Chrome DevTools profile for test logins. It does not use the user's daily Chrome profile.

**Working if:** a correction becomes a premise the user can list and delete, the next review quotes it, and no team repo changed unless the user asked.
