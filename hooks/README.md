# Hooks

The install registers every row in [catalog.json](catalog.json). You do not edit `~/.claude`, `~/.codex`, or `~/.config/opencode` by hand. Run `scripts/install.sh` after you add a row. Run `scripts/uninstall.sh` to remove the rows.

Each row has an `id`. The same id can have one row per tool. The marker in a command is `session-premises.mjs`. The installer removes an old row with that marker before it writes the new command, so a second install does not duplicate it.

| Tool | Where the install writes | What runs |
| --- | --- | --- |
| Claude Code | `~/.claude/settings.json` | `SessionStart` runs `bin/session-premises.mjs` |
| Codex | `~/.codex/hooks.json` | The same command. Codex skips it until you trust it in `/hooks` |
| OpenCode | a link in `~/.config/opencode/plugins/` | `hooks/opencode/session-premises.js` adds the same text before each model call |

The command stays stable. Codex ties trust to the hook definition. A changed command asks for trust again.

The script fails open. A lookup error does not stop the session. The script skips the pull-request lookup, so it stays fast. It prints nothing outside a git repo.

OpenCode has no `SessionStart` event. The plugin reads `session.location.directory` and calls the same script. It caches that text until `memory/premises/` changes. The install links the plugin only when `~/.config/opencode` already exists. It does not edit `opencode.json`, because that file can be a link into dotfiles.

Do not put a hook file in a team repository. These hooks are user-level, so they apply in every repo you open.

## Add a hook

1. Add a script under `bin/` or `hooks/` that reads JSON on stdin and exits 0 when it has nothing to say.
2. Add one catalog row per tool. Use `${BRAIN_ROOT}` in a command. Give an OpenCode row `plugin` and `linkName`.
3. Keep the command free of network calls. A context hook fails open. A guard hook must deny, not rewrite the command.
4. Add a `node --test` case with a JSON fixture.
5. Run `scripts/install.sh`. For Codex, trust the new hook once in `/hooks`.
