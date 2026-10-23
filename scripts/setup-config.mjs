#!/usr/bin/env node

// Edit the user config files that install.sh and uninstall.sh manage.
// Each command is safe to run twice. A file write keeps a .brain-bak copy.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const servers = ["brain-premises", "chrome-devtools"];
const hookMarker = "session-premises.mjs";

// Git commands that need a confirmation in Claude Code. They enforce the premises
// no-commit-push-unasked and no-schema-or-deploy-unasked for git, so the rule does not
// depend on the model reading it. After git-guardrails-claude-code in mattpocock/skills.
export const guardRules = [
  "Bash(git commit:*)",
  "Bash(git push:*)",
  "Bash(git reset --hard:*)",
  "Bash(git clean:*)",
  "Bash(git branch -D:*)",
];

// render fills ${HOME} and ${BRAIN_ROOT} in an MCP snippet.
export function render(name, vars) {
  const text = readFileSync(join(vars.root, "mcp", "snippets", `${name}.json`), "utf8");
  const filled = text.replaceAll("${HOME}", vars.home).replaceAll("${BRAIN_ROOT}", vars.root.replace(/\/$/, ""));
  return { type: "stdio", ...JSON.parse(filled) };
}

// setHook removes the brain SessionStart hook, then adds command when it is set.
export function setHook(settings, command) {
  const hooks = settings.hooks ?? {};
  const kept = [];
  for (const entry of hooks.SessionStart ?? []) {
    const rest = (entry.hooks ?? []).filter((h) => !String(h.command ?? "").includes(hookMarker));
    if (rest.length > 0) {
      kept.push({ ...entry, hooks: rest });
    }
  }
  if (command) {
    kept.push({ hooks: [{ type: "command", command, timeout: 10 }] });
  }
  if (kept.length > 0) {
    hooks.SessionStart = kept;
  } else {
    delete hooks.SessionStart;
  }
  return { ...settings, hooks };
}

// setGuards removes the guard rules from permissions.ask, then adds them back when add is true.
// Other ask rules stay.
export function setGuards(settings, add) {
  const permissions = settings.permissions ?? {};
  const ask = (permissions.ask ?? []).filter((rule) => !guardRules.includes(rule));
  if (add) {
    ask.push(...guardRules);
  }
  const next = { ...permissions, ask };
  if (ask.length === 0) {
    delete next.ask;
  }
  return { ...settings, permissions: next };
}

// dropTables removes each [mcp_servers.NAME] table and its subtables from TOML text.
export function dropTables(text, names) {
  const headers = names.map((name) => `mcp_servers.${name}`);
  const out = [];
  let skip = false;
  for (const line of text.split("\n")) {
    const header = line.match(/^\s*\[{1,2}([^\]]+)\]{1,2}\s*(?:#.*)?$/);
    if (header) {
      const name = header[1].trim();
      skip = headers.some((h) => name === h || name.startsWith(`${h}.`));
    }
    if (!skip) {
      out.push(line);
    }
  }
  return out.join("\n").replace(/\n+$/, "\n");
}

export function tomlTable(name, server) {
  const lines = [
    `[mcp_servers.${name}]`,
    `type = "stdio"`,
    `command = ${JSON.stringify(server.command)}`,
    `args = [${server.args.map((a) => JSON.stringify(a)).join(", ")}]`,
  ];
  const env = Object.entries(server.env ?? {});
  if (env.length > 0) {
    lines.push("", `[mcp_servers.${name}.env]`);
    for (const [key, value] of env) {
      lines.push(`${key} = ${JSON.stringify(value)}`);
    }
  }
  return lines.join("\n");
}

function edit(path, change, initial) {
  const exists = existsSync(path);
  if (!exists && initial === undefined) {
    return false;
  }
  const before = exists ? readFileSync(path, "utf8") : initial;
  const after = change(before);
  if (after === before) {
    return false;
  }
  mkdirSync(dirname(path), { recursive: true });
  if (exists) {
    copyFileSync(path, `${path}.brain-bak`);
  }
  // Write in place so a symlinked config file stays a symlink.
  writeFileSync(path, after, { mode: 0o600 });
  return true;
}

function main(args) {
  const home = homedir();
  const vars = { home, root };
  const [cmd, arg] = args;
  switch (cmd) {
    case "claude-json":
      process.stdout.write(`${JSON.stringify(render(arg, vars))}\n`);
      return 0;
    case "hook-add":
    case "hook-remove": {
      const path = join(home, ".claude", "settings.json");
      const command = cmd === "hook-add" ? arg : "";
      const changed = edit(path, (text) => `${JSON.stringify(setHook(JSON.parse(text), command), null, 2)}\n`,
        cmd === "hook-add" ? "{}" : undefined);
      process.stdout.write(`${changed ? "updated" : "unchanged"} ${path}\n`);
      return 0;
    }
    case "guard-add":
    case "guard-remove": {
      const path = join(home, ".claude", "settings.json");
      const changed = edit(path, (text) => `${JSON.stringify(setGuards(JSON.parse(text), cmd === "guard-add"), null, 2)}\n`,
        cmd === "guard-add" ? "{}" : undefined);
      process.stdout.write(`${changed ? "updated" : "unchanged"} ${path}\n`);
      return 0;
    }
    case "codex-add":
    case "codex-remove": {
      const path = join(home, ".codex", "config.toml");
      const changed = edit(path, (text) => {
        let out = dropTables(text, servers).trimEnd();
        if (cmd === "codex-add") {
          out += `${out ? "\n\n" : ""}${servers.map((name) => tomlTable(name, render(name, vars))).join("\n\n")}`;
        }
        return out ? `${out}\n` : "";
      }, cmd === "codex-add" ? "" : undefined);
      process.stdout.write(`${changed ? "updated" : "unchanged"} ${path}\n`);
      return 0;
    }
    default:
      process.stderr.write("usage: setup-config.mjs claude-json NAME | hook-add COMMAND | hook-remove | guard-add | guard-remove | codex-add | codex-remove\n");
      return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
