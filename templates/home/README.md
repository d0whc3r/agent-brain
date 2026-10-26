# Brain home

This folder holds your brain data: your config, premises, notes, standing DoDs, flows, and skills. The brain code reads it from `brain home`, and an update of the code never changes it.

Commit this folder to a private git repo of your own. The history keeps every change to a premise, and a clone gives you the same brain on another machine: run `scripts/install.sh --home <clone>`.

| Path | Holds |
| --- | --- |
| `brain.config.json` | Your scopes: the owners and the folders of your repos. The optional `decide` block turns on a local decision model |
| `memory/premises/` | Your premises. The install adds starter premises as candidates. `brain premise promote ID` makes one active |
| `memory/decisions/`, `memory/patterns/` | The notes behind your premises and your skill drafts |
| `memory/sessions/` | Review notes and screenshots. Git ignores them, so they stay on this machine |
| `dod/<repo>.md` | The standing DoD of a repo: the criteria that every task of that repo keeps |
| `flows/` | Your own flows. A flow here replaces the brain flow of the same name |
| `skills/drafts/`, `skills/active/` | Your own skills. `brain accept-skill NAME` moves a draft to active and commits the move |
| `premises.base` | An Obsidian view of the premises. Open this folder as a vault |
