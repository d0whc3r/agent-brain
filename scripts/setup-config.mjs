#!/usr/bin/env node

// Edit the user config files that install.sh and uninstall.sh manage.
// Each command is safe to run twice. A file write keeps a .brain-bak copy.
// Each command prints one status line for each brain entry. BRAIN_DRY_RUN=1 writes nothing.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  applyHooks,
  editEntry,
  entryStatus,
  hookMarker,
  jsonChange,
  parseJson,
  removeHooks,
  setCodexHook,
  setHook,
  writeConfig,
  writeEntryStatus,
} from "../hooks/install.mjs";

export { setCodexHook, setHook };

const root = fileURLToPath(new URL("..", import.meta.url));
const servers = ["brain-premises", "chrome-devtools"];

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

// The brain block in a global instruction file, between these markers.
const blockStart = "<!-- brain:start -->";
const blockEnd = "<!-- brain:end -->";

// setBlock removes the brain block from text, then appends block when it is set.
export function setBlock(text, block) {
  const start = text.indexOf(blockStart);
  const end = text.indexOf(blockEnd);
  let out = text;
  if (start !== -1 && end > start) {
    out = (text.slice(0, start) + text.slice(end + blockEnd.length)).replaceAll(/\n{3,}/gu, "\n\n");
  }
  out = out.trimEnd();
  if (block) {
    out += `${out ? "\n\n" : ""}${blockStart}\n${block.trimEnd()}\n${blockEnd}`;
  }
  return out ? `${out}\n` : "";
}

// opencodeAgent turns a Claude Code agent file into an OpenCode subagent file.
// OpenCode takes a tools map, so a tool missing from the Claude list is turned off.
export function opencodeAgent(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/u);
  if (!match) {
    throw new Error("agent file has no frontmatter");
  }
  const field = (name) => (match[1].match(new RegExp(`^${name}:\\s*(.*)$`, "mu")) ?? [])[1] ?? "";
  const tools = new Set(
    field("tools")
      .split(",")
      .map((t) => t.trim()),
  );
  const lines = [
    "---",
    `description: ${field("description")}`,
    "mode: subagent",
    "tools:",
    `  edit: ${tools.has("Edit")}`,
    `  write: ${tools.has("Write")}`,
  ];
  return `${lines.join("\n")}\n---\n${match[2]}`;
}

// render fills ${HOME} and ${BRAIN_ROOT} in an MCP snippet.
export function render(name, vars) {
  const text = readFileSync(join(vars.root, "mcp", "snippets", `${name}.json`), "utf8");
  const filled = text.replaceAll("${HOME}", vars.home).replaceAll("${BRAIN_ROOT}", vars.root.replace(/\/$/u, ""));
  return { type: "stdio", ...JSON.parse(filled) };
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

// dropTables removes each named table, such as mcp_servers.NAME, and its subtables from TOML text.
export function dropTables(text, tables) {
  const out = [];
  let skip = false;
  for (const line of text.split("\n")) {
    const header = line.match(/^\s*\[{1,2}([^\]]+)\]{1,2}\s*(?:#.*)?$/u);
    if (header) {
      const name = header[1].trim();
      skip = tables.some((h) => name === h || name.startsWith(`${h}.`));
    }
    if (!skip) {
      out.push(line);
    }
  }
  return out.join("\n").replace(/\n+$/u, "\n");
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

// editSettings edits one brain entry in ~/.claude/settings.json. add creates the file.
function editSettings(home, add, entry) {
  const path = join(home, ".claude", "settings.json");
  editEntry(path, { ...entry, add, change: jsonChange(path, entry.change), initial: add ? "{}" : undefined });
  return 0;
}

const hookEntry = (command) => ({
  change: (settings) => setHook(settings, command),
  has: (text) => text.includes(hookMarker),
  label: "session premises hook",
});

const guardEntry = (add) => ({
  change: (settings) => setGuards(settings, add),
  has: (text) => guardRules.some((rule) => text.includes(rule)),
  label: "git confirmation rules",
});

// editInstructions sets the brain block in a global instruction file. An empty block removes it.
function editInstructions(path, block) {
  editEntry(path, {
    change: (text) => setBlock(text, block),
    has: (text) => text.includes(blockStart),
    add: block !== "",
    label: "brain instructions",
    initial: block ? "" : undefined,
  });
  return 0;
}

// writeOpencodeAgents rebuilds the OpenCode copies of the agents. install.sh links them.
function writeOpencodeAgents() {
  const out = join(root, ".agents", "linked", "opencode-agents");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const name of readdirSync(join(root, "agents")).filter((n) => n.endsWith(".md"))) {
    writeFileSync(join(out, name), opencodeAgent(readFileSync(join(root, "agents", name), "utf8")));
    process.stdout.write(`${join(out, name)}\n`);
  }
  return 0;
}

// editCodex removes the brain MCP server tables from ~/.codex/config.toml, then adds them
// back when add is true. It prints one status line for each server.
function editCodex(vars, add) {
  const path = join(vars.home, ".codex", "config.toml");
  const initial = add ? "" : undefined;
  const before = existsSync(path) ? readFileSync(path, "utf8") : initial;
  const tables = servers.map((name) => tomlTable(name, render(name, vars)));
  const statuses = servers.map((name, i) =>
    entryStatus(before !== undefined && hasTable(before, `mcp_servers.${name}`), add, !before?.includes(tables[i])),
  );
  for (const [i, name] of servers.entries()) {
    writeEntryStatus(statuses[i], `MCP server ${name}`, path);
  }
  if (statuses.every((status) => status === "unchanged")) {
    return 0;
  }
  let out = dropTables(
    before,
    servers.map((name) => `mcp_servers.${name}`),
  ).trimEnd();
  if (add) {
    out += `${out ? "\n\n" : ""}${tables.join("\n\n")}`;
  }
  writeConfig(path, out ? `${out}\n` : "");
  return 0;
}

function hasTable(text, table) {
  return text.split("\n").some((line) => line.trim().startsWith(`[${table}]`));
}

// hookTrustTables names the [hooks.state."KEY"] table of each brain handler in ~/.codex/hooks.json.
// Codex keys the trust of a hook by its place: the file, the event in snake case, the group
// index, and the handler index.
function hookTrustTables(home) {
  const path = join(home, ".codex", "hooks.json");
  const hooks = existsSync(path) ? (parseJson(path, readFileSync(path, "utf8")).hooks ?? {}) : {};
  return Object.entries(hooks).flatMap(([event, groups]) => {
    const name = event.replaceAll(/(?<=[a-z])(?=[A-Z])/gu, "_").toLowerCase();
    return groups.flatMap((group, i) =>
      (group.hooks ?? [])
        .map((handler, j) => [String(handler.command ?? ""), `${path}:${name}:${i}:${j}`])
        .filter(([command]) => command.includes(hookMarker))
        .map(([, key]) => `hooks.state.${JSON.stringify(key)}`),
    );
  });
}

// trustTables lists the table and the label of each trust that editTrust removes: the
// [projects."DIR"] table of oldRoot, the checkout of the last install, when that checkout is
// gone. With all, it adds the table of this checkout and the trust of the brain hook.
function trustTables(vars, oldRoot, all) {
  const checkout = vars.root.replace(/\/$/u, "");
  const dirs = all ? [checkout] : [];
  if (oldRoot && oldRoot !== checkout && !existsSync(oldRoot)) {
    dirs.push(oldRoot);
  }
  const hooks = all ? hookTrustTables(vars.home) : [];
  return [
    ...dirs.map((dir) => [`projects.${JSON.stringify(dir)}`, `trusted project ${dir}`]),
    ...hooks.map((table) => [table, "trust of the session premises hook"]),
  ];
}

// editTrust removes the trust that Codex keeps for the brain in ~/.codex/config.toml. It never
// adds a trust: the user gives it in Codex. It prints one status line for each entry.
function editTrust(vars, oldRoot, all) {
  const path = join(vars.home, ".codex", "config.toml");
  const before = existsSync(path) ? readFileSync(path, "utf8") : "";
  const found = [];
  for (const [table, label] of trustTables(vars, oldRoot, all)) {
    const had = hasTable(before, table);
    writeEntryStatus(entryStatus(had, false), label, path);
    if (had) {
      found.push(table);
    }
  }
  if (found.length > 0) {
    writeConfig(path, dropTables(before, found));
  }
  return 0;
}

// claudeMcpState compares the server that Claude Code stores in ~/.claude.json with the snippet.
function claudeMcpState(name, vars) {
  const path = join(vars.home, ".claude.json");
  const current = existsSync(path) ? parseJson(path, readFileSync(path, "utf8")).mcpServers?.[name] : undefined;
  if (current === undefined) {
    return "missing";
  }
  return JSON.stringify(current) === JSON.stringify(render(name, vars)) ? "same" : "different";
}

// Each command takes its argument and the paths, and returns the exit code.
// The arg of instructions-add and instructions-remove is the global instruction file of a tool,
// such as ~/.codex/AGENTS.md.
const commands = {
  "claude-json": (arg, vars) => {
    process.stdout.write(`${JSON.stringify(render(arg, vars))}\n`);
    return 0;
  },
  "claude-mcp-state": (arg, vars) => {
    process.stdout.write(`${claudeMcpState(arg, vars)}\n`);
    return 0;
  },
  "hook-add": (arg, vars) => editSettings(vars.home, true, hookEntry(arg)),
  "hook-remove": (_arg, vars) => editSettings(vars.home, false, hookEntry("")),
  "hooks-apply": (_arg, vars) => applyHooks(vars.home, vars.root),
  "hooks-remove": (_arg, vars) => removeHooks(vars.home, vars.root),
  "guard-add": (_arg, vars) => editSettings(vars.home, true, guardEntry(true)),
  "guard-remove": (_arg, vars) => editSettings(vars.home, false, guardEntry(false)),
  "opencode-agents": () => writeOpencodeAgents(),
  "instructions-add": (arg) =>
    editInstructions(arg, readFileSync(join(root, "templates", "agent-instructions.md"), "utf8")),
  "instructions-remove": (arg) => editInstructions(arg, ""),
  "codex-add": (_arg, vars) => editCodex(vars, true),
  "codex-remove": (_arg, vars) => editCodex(vars, false),
  "codex-trust-clean": (arg, vars) => editTrust(vars, arg, false),
  "codex-trust-remove": (arg, vars) => editTrust(vars, arg, true),
};

function main(args) {
  const [cmd, arg] = args;
  if (!Object.hasOwn(commands, cmd)) {
    process.stderr.write(
      "usage: setup-config.mjs claude-json NAME | claude-mcp-state NAME | hook-add COMMAND | hook-remove | hooks-apply | hooks-remove | guard-add | guard-remove | codex-add | codex-remove | codex-trust-clean [OLD_ROOT] | codex-trust-remove [OLD_ROOT] | opencode-agents | instructions-add FILE | instructions-remove FILE\n",
    );
    return 1;
  }
  return commands[cmd](arg, { home: homedir(), root });
}

// A failure prints its message without a stack, because install.sh shows it to the user.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
