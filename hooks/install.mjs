// Install and uninstall walk hooks/catalog.json. They do not edit a team repository.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const root = join(import.meta.dirname, "..");
export const hookMarker = "session-premises.mjs";

// setCommandHook removes handlers whose command contains marker, then adds command on event.
// Claude and Codex share this shape. A second call with the same command leaves the file unchanged.
export function setCommandHook(config, hook) {
  const event = hook.event;
  const hooks = config.hooks ?? {};
  const kept = [];
  for (const entry of hooks[event] ?? []) {
    const rest = (entry.hooks ?? []).filter((h) => !String(h.command ?? "").includes(hook.marker));
    if (rest.length > 0) {
      kept.push({ ...entry, hooks: rest });
    }
  }
  if (hook.command) {
    kept.push({ hooks: [{ type: "command", command: hook.command, timeout: hook.timeout ?? 10 }] });
  }
  if (kept.length > 0) {
    hooks[event] = kept;
  } else {
    delete hooks[event];
  }
  return { ...config, hooks };
}

function sessionHook(command) {
  return { event: "SessionStart", marker: hookMarker, command };
}

// setHook removes the brain SessionStart hook, then adds command when it is set.
export function setHook(settings, command) {
  return setCommandHook(settings, sessionHook(command));
}

// setCodexHook writes the same SessionStart command into Codex hooks.json.
export function setCodexHook(config, command) {
  return setCommandHook(config, sessionHook(command));
}

// loadCatalog reads the hook list.
export function loadCatalog(dir = root) {
  return JSON.parse(readFileSync(join(dir, "hooks", "catalog.json"), "utf8"));
}

// fillCommand puts the checkout path into a catalog command. The command text stays stable.
export function fillCommand(template, dir) {
  return template.replaceAll("${BRAIN_ROOT}", dir.replace(/\/$/u, ""));
}

// install.sh --dry-run sets BRAIN_DRY_RUN=1. Each status line still prints, but no file changes.
export const isDryRun = () => process.env.BRAIN_DRY_RUN === "1";

// entryStatus names the change to one brain entry in a config file.
export function entryStatus(had, add, changed) {
  if (!add) {
    return had ? "removed" : "unchanged";
  }
  if (!changed) {
    return "unchanged";
  }
  return had ? "updated" : "added";
}

const prepositions = { added: "to", removed: "from", updated: "in", unchanged: "in" };

// writeEntryStatus prints "STATUS LABEL to|in|from PATH". install.sh reads the first word.
export function writeEntryStatus(status, label, path) {
  process.stdout.write(`${status} ${label} ${prepositions[status]} ${path}\n`);
}

// writeConfig keeps a .brain-bak copy and writes in place, so a linked config stays a link.
export function writeConfig(path, text) {
  if (isDryRun()) {
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    copyFileSync(path, `${path}.brain-bak`);
  }
  writeFileSync(path, text, { mode: 0o600 });
}

// editEntry applies change to the text of path and prints the status of one brain entry.
// has tells whether a text holds the entry. A missing file starts as initial, or stays missing
// when initial is undefined, as a remove needs. An unchanged entry leaves the file as it is.
export function editEntry(path, { change, has, add, label, initial }) {
  const before = existsSync(path) ? readFileSync(path, "utf8") : initial;
  const after = before === undefined ? before : change(before);
  const status = entryStatus(before !== undefined && has(before), add, after !== before);
  writeEntryStatus(status, label, path);
  if (status !== "unchanged") {
    writeConfig(path, after);
  }
}

// parseJson names the file in a parse error, so the install tells the user which file to fix.
export function parseJson(path, text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${err.message}`, { cause: err });
  }
}

// jsonChange turns a change of the parsed JSON into a change of the file text.
export function jsonChange(path, change) {
  return (text) => `${JSON.stringify(change(parseJson(path, text)), null, 2)}\n`;
}

function pluginLink(home, entry) {
  return join(home, ".config", "opencode", "plugins", entry.linkName);
}

// readPluginLink returns the target, "" when missing, or null when the path is not a link.
function readPluginLink(link) {
  try {
    return readlinkSync(link);
  } catch (err) {
    if (err.code === "ENOENT") {
      return "";
    }
    return null;
  }
}

function writeLinkStatus(link, status, reason = "") {
  process.stdout.write(`${status} ${link}${reason && ` (${reason})`}\n`);
}

function placeLink(link, current, target) {
  if (current === null || (current === "" && existsSync(link))) {
    writeLinkStatus(link, "skipped", "a file, not a link");
    return;
  }
  if (current === target) {
    writeLinkStatus(link, "unchanged");
    return;
  }
  writeLinkStatus(link, current ? "updated" : "added");
  if (isDryRun()) {
    return;
  }
  mkdirSync(dirname(link), { recursive: true });
  if (current) {
    unlinkSync(link);
  }
  symlinkSync(target, link);
}

// linkPlugin points the OpenCode plugin name at this checkout. It skips a real file.
function linkPlugin(home, dir, entry) {
  const link = pluginLink(home, entry);
  if (!existsSync(join(home, ".config", "opencode"))) {
    writeLinkStatus(link, "skipped", "OpenCode is not installed");
    return;
  }
  placeLink(link, readPluginLink(link), join(dir, entry.plugin));
}

// unlinkPlugin removes the plugin link when it points at this checkout or at nothing.
function unlinkPlugin(home, dir, entry) {
  const link = pluginLink(home, entry);
  const current = readPluginLink(link);
  if (current === null) {
    writeLinkStatus(link, "skipped", "a file, not a link");
    return;
  }
  if (current === "") {
    writeLinkStatus(link, "unchanged");
    return;
  }
  if (current !== join(dir, entry.plugin) && existsSync(link)) {
    writeLinkStatus(link, "skipped", "links to another checkout");
    return;
  }
  writeLinkStatus(link, "removed");
  if (!isDryRun()) {
    unlinkSync(link);
  }
}

function writeCommandHook(home, entry, command) {
  const path = entry.tool === "claude" ? join(home, ".claude", "settings.json") : join(home, ".codex", "hooks.json");
  const hook = { event: entry.event, marker: hookMarker, command, timeout: entry.timeout ?? 10 };
  editEntry(path, {
    change: jsonChange(path, (config) => setCommandHook(config, hook)),
    has: (text) => text.includes(hookMarker),
    add: command !== "",
    label: `${entry.id.replaceAll("-", " ")} hook`,
    initial: command === "" ? undefined : "{}\n",
  });
}

// applyHooks registers every catalog row for this user. It does not trust a Codex hook.
// skip names the tools that get no hook, such as codex when Codex is not installed.
export function applyHooks(home, dir = root, skip = new Set()) {
  for (const entry of loadCatalog(dir)) {
    if (skip.has(entry.tool)) {
      continue;
    }
    if (entry.tool === "opencode") {
      linkPlugin(home, dir, entry);
    } else {
      writeCommandHook(home, entry, fillCommand(entry.command, dir));
    }
  }
  return 0;
}

// removeHooks drops every catalog row. A missing file stays missing.
export function removeHooks(home, dir = root) {
  for (const entry of loadCatalog(dir)) {
    if (entry.tool === "opencode") {
      unlinkPlugin(home, dir, entry);
    } else {
      writeCommandHook(home, entry, "");
    }
  }
  return 0;
}
