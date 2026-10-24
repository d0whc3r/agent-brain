#!/usr/bin/env node

// Edit the user config files that install.sh and uninstall.sh manage.
// Each command is safe to run twice. A file write keeps a .brain-bak copy.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { applyHooks, removeHooks, setCodexHook, setHook } from "../hooks/install.mjs";

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

// dropTables removes each [mcp_servers.NAME] table and its subtables from TOML text.
export function dropTables(text, names) {
  const headers = names.map((name) => `mcp_servers.${name}`);
  const out = [];
  let skip = false;
  for (const line of text.split("\n")) {
    const header = line.match(/^\s*\[{1,2}([^\]]+)\]{1,2}\s*(?:#.*)?$/u);
    if (header) {
      const name = header[1].trim();
      skip = headers.some((h) => name === h || name.startsWith(`${h}.`));
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

// edit applies change to the text of path and prints whether the file changed. A missing file
// starts as initial, or stays missing when initial is undefined, as a remove needs.
function edit(path, change, initial) {
  const exists = existsSync(path);
  const before = exists ? readFileSync(path, "utf8") : initial;
  const after = before === undefined ? before : change(before);
  if (after !== before) {
    mkdirSync(dirname(path), { recursive: true });
    if (exists) {
      copyFileSync(path, `${path}.brain-bak`);
    }
    // Write in place so a symlinked config file stays a symlink.
    writeFileSync(path, after, { mode: 0o600 });
  }
  process.stdout.write(`${after === before ? "unchanged" : "updated"} ${path}\n`);
  return 0;
}

// editSettings applies change to the JSON of ~/.claude/settings.json. add creates the file.
function editSettings(home, add, change) {
  const path = join(home, ".claude", "settings.json");
  return edit(path, (text) => `${JSON.stringify(change(JSON.parse(text)), null, 2)}\n`, add ? "{}" : undefined);
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
// back when add is true.
function editCodex(vars, add) {
  return edit(
    join(vars.home, ".codex", "config.toml"),
    (text) => {
      let out = dropTables(text, servers).trimEnd();
      if (add) {
        out += `${out ? "\n\n" : ""}${servers.map((name) => tomlTable(name, render(name, vars))).join("\n\n")}`;
      }
      return out ? `${out}\n` : "";
    },
    add ? "" : undefined,
  );
}

// Each command takes its argument and the paths, and returns the exit code.
// The arg of instructions-add and instructions-remove is the global instruction file of a tool,
// such as ~/.codex/AGENTS.md.
const commands = {
  "claude-json": (arg, vars) => {
    process.stdout.write(`${JSON.stringify(render(arg, vars))}\n`);
    return 0;
  },
  "hook-add": (arg, vars) => editSettings(vars.home, true, (settings) => setHook(settings, arg)),
  "hook-remove": (_arg, vars) => editSettings(vars.home, false, (settings) => setHook(settings, "")),
  "hooks-apply": (_arg, vars) => applyHooks(vars.home, vars.root),
  "hooks-remove": (_arg, vars) => removeHooks(vars.home, vars.root),
  "guard-add": (_arg, vars) => editSettings(vars.home, true, (settings) => setGuards(settings, true)),
  "guard-remove": (_arg, vars) => editSettings(vars.home, false, (settings) => setGuards(settings, false)),
  "opencode-agents": () => writeOpencodeAgents(),
  "instructions-add": (arg) => {
    const block = readFileSync(join(root, "templates", "agent-instructions.md"), "utf8");
    return edit(arg, (text) => setBlock(text, block), "");
  },
  "instructions-remove": (arg) => edit(arg, (text) => setBlock(text, "")),
  "codex-add": (_arg, vars) => editCodex(vars, true),
  "codex-remove": (_arg, vars) => editCodex(vars, false),
};

function main(args) {
  const [cmd, arg] = args;
  if (!Object.hasOwn(commands, cmd)) {
    process.stderr.write(
      "usage: setup-config.mjs claude-json NAME | hook-add COMMAND | hook-remove | hooks-apply | hooks-remove | guard-add | guard-remove | codex-add | codex-remove | opencode-agents | instructions-add FILE | instructions-remove FILE\n",
    );
    return 1;
  }
  return commands[cmd](arg, { home: homedir(), root });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
