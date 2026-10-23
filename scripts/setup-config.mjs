#!/usr/bin/env node

// Edit the user config files that install.sh and uninstall.sh manage.
// Each command is safe to run twice. A file write keeps a .brain-bak copy.

import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const servers = ["brain-premises", "chrome-devtools"];
const hookMarker = "session-premises.mjs";

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

// dropTables removes each [mcp_servers.NAME] table and its subtables from TOML text.
export function dropTables(text, names) {
  const headers = names.map((name) => `mcp_servers.${name}`);
  const out = [];
  let skip = false;
  for (const line of text.split("\n")) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) {
      skip = headers.some((h) => header[1] === h || header[1].startsWith(`${h}.`));
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

function edit(path, change) {
  if (!existsSync(path)) {
    return false;
  }
  const before = readFileSync(path, "utf8");
  const after = change(before);
  if (after === before) {
    return false;
  }
  copyFileSync(path, `${path}.brain-bak`);
  // Write in place so a symlinked config file stays a symlink.
  writeFileSync(path, after);
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
      const changed = edit(path, (text) => `${JSON.stringify(setHook(JSON.parse(text), command), null, 2)}\n`);
      process.stdout.write(`${changed ? "updated" : "unchanged"} ${path}\n`);
      return 0;
    }
    case "codex-add":
    case "codex-remove": {
      const path = join(home, ".codex", "config.toml");
      const changed = edit(path, (text) => {
        let out = dropTables(text, servers);
        if (cmd === "codex-add") {
          out += `\n${servers.map((name) => tomlTable(name, render(name, vars))).join("\n\n")}\n`;
        }
        return out;
      });
      process.stdout.write(`${changed ? "updated" : "unchanged"} ${path}\n`);
      return 0;
    }
    default:
      process.stderr.write("usage: setup-config.mjs claude-json NAME | hook-add COMMAND | hook-remove | codex-add | codex-remove\n");
      return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
