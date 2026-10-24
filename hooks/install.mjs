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
const hookMarker = "session-premises.mjs";

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

// writeText keeps a .brain-bak copy and writes in place, so a linked config stays a link.
function writeText(path, change, initial) {
  const exists = existsSync(path);
  const before = exists ? readFileSync(path, "utf8") : initial;
  const after = before === undefined ? before : change(before);
  if (after !== before) {
    mkdirSync(dirname(path), { recursive: true });
    if (exists) {
      copyFileSync(path, `${path}.brain-bak`);
    }
    writeFileSync(path, after, { mode: 0o600 });
  }
  process.stdout.write(`${after === before ? "unchanged" : "updated"} ${path}\n`);
}

function writeJson(path, change, initial) {
  writeText(path, (text) => `${JSON.stringify(change(JSON.parse(text)), null, 2)}\n`, initial);
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

function writeLinkStatus(link, status) {
  process.stdout.write(`${status} ${link}\n`);
}

function placeLink(link, current, target) {
  if (current === null || (current === "" && existsSync(link))) {
    writeLinkStatus(link, "skipped");
    return;
  }
  if (current === target) {
    writeLinkStatus(link, "unchanged");
    return;
  }
  if (current) {
    unlinkSync(link);
  }
  symlinkSync(target, link);
  writeLinkStatus(link, "updated");
}

// linkPlugin points the OpenCode plugin name at this checkout. It skips a real file.
function linkPlugin(home, dir, entry) {
  const link = pluginLink(home, entry);
  if (!existsSync(join(home, ".config", "opencode"))) {
    writeLinkStatus(link, "skipped");
    return;
  }
  mkdirSync(dirname(link), { recursive: true });
  placeLink(link, readPluginLink(link), join(dir, entry.plugin));
}

// unlinkPlugin removes the plugin link only when it points at this checkout.
function unlinkPlugin(home, dir, entry) {
  const link = pluginLink(home, entry);
  const current = readPluginLink(link);
  if (current === "" || current === null) {
    writeLinkStatus(link, current === null ? "skipped" : "unchanged");
    return;
  }
  if (current !== join(dir, entry.plugin)) {
    writeLinkStatus(link, "skipped");
    return;
  }
  unlinkSync(link);
  writeLinkStatus(link, "updated");
}

function writeCommandHook(home, entry, command) {
  const path = entry.tool === "claude" ? join(home, ".claude", "settings.json") : join(home, ".codex", "hooks.json");
  if (command === "" && !existsSync(path)) {
    return;
  }
  const change = (config) =>
    setCommandHook(config, { event: entry.event, marker: hookMarker, command, timeout: entry.timeout ?? 10 });
  writeJson(path, change, command === "" ? undefined : "{}\n");
}

// applyHooks registers every catalog row for this user. It does not trust a Codex hook.
export function applyHooks(home, dir = root) {
  for (const entry of loadCatalog(dir)) {
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
