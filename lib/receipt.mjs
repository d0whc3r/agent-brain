import { lstat, mkdir, readFile, readdir, readlink, rm, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { ifMissing } from "./io.mjs";

// The receipt lists what install put on disk, so a later install or uninstall can name an
// item that the new version dropped, even when its link is already gone.
// Each line: type, name, then a path or a tool, split by one tab. The first line is root.
export function receiptPath(home = homedir()) {
  return join(home, ".local", "share", "qdrant-review-brain", "installed.txt");
}

export function parseReceipt(text) {
  const lines = text.split("\n").filter((line) => line !== "");
  const [kind, root = ""] = (lines[0] ?? "").split("\t");
  if (kind !== "root") {
    return { root: "", items: [] };
  }
  const items = lines.slice(1).map((line) => {
    const [type, name, where] = line.split("\t");
    return { type, name, where };
  });
  return { root, items };
}

export function formatReceipt(root, items) {
  return [`root\t${root}`, ...items.map((i) => `${i.type}\t${i.name}\t${i.where}`)].join("\n") + "\n";
}

export async function readReceipt(path = receiptPath()) {
  const text = await ifMissing(readFile(path, "utf8"), null);
  return text === null ? null : parseReceipt(text);
}

async function linkInto(path, dir) {
  const info = await ifMissing(lstat(path), null);
  return Boolean(info?.isSymbolicLink()) && (await readlink(path)).startsWith(`${dir}/`);
}

async function links(dir, into) {
  const out = [];
  for (const name of (await ifMissing(readdir(dir), [])).sort()) {
    // A broken link is not installed: the new version dropped what it pointed at.
    if ((await linkInto(join(dir, name), into)) && (await stat(join(dir, name)).catch(() => null))) {
      out.push(name);
    }
  }
  return out;
}

// collectInstalled reads what belongs to root on disk now.
// opts: home, binDir, targets (skill link dirs), claude (MCP servers registered in Claude Code).
export async function collectInstalled(root, opts) {
  root = root.replace(/\/$/, "");
  const home = opts.home ?? homedir();
  const items = [];
  for (const target of opts.targets) {
    for (const name of await links(target, root)) {
      items.push({ type: "skills", name, where: join(target, name) });
    }
  }
  const agentDirs = [
    [join(home, ".claude", "agents"), join(root, "agents")],
    [join(home, ".config", "opencode", "agents"), join(root, ".agents", "linked", "opencode-agents")],
  ];
  for (const [dir, into] of agentDirs) {
    for (const name of await links(dir, into)) {
      items.push({ type: "agents", name: name.replace(/\.md$/, ""), where: join(dir, name) });
    }
  }
  const bin = join(opts.binDir, "brain");
  if (await linkInto(bin, join(root, "bin"))) {
    items.push({ type: "bin", name: "brain", where: bin });
  }
  const tools = opts.claude ? ["claude", "codex"] : ["codex"];
  for (const tool of tools) {
    for (const name of ["brain-premises", "chrome-devtools"]) {
      items.push({ type: "mcp", name, where: tool });
    }
  }
  const settings = join(home, ".claude", "settings.json");
  const text = await ifMissing(readFile(settings, "utf8"), "");
  if (text.includes("session-premises.mjs")) {
    items.push({ type: "hook", name: "session-premises", where: settings });
  }
  if (text.includes("Bash(git commit:*)")) {
    items.push({ type: "guard", name: "git-confirm", where: settings });
  }
  const codex = join(home, ".codex", "AGENTS.md");
  if ((await readFile(codex, "utf8").catch(() => "")).includes("<!-- brain:start -->")) {
    items.push({ type: "instructions", name: "brain", where: codex });
  }
  return items;
}

const key = (i) => `${i.type}\t${i.name}\t${i.where}`;
const linkTypes = new Set(["skills", "agents", "bin"]);

// writeReceipt compares the old receipt with what is on disk now. It removes each old link
// that the new version dropped when the link still points into root, prints it as removed,
// and writes the new receipt.
export async function writeReceipt(root, opts, out) {
  root = root.replace(/\/$/, "");
  const path = opts.path ?? receiptPath(opts.home);
  const now = await collectInstalled(root, opts);
  const old = await readReceipt(path);
  if (old && old.root !== root) {
    out.write(`replaced receipt\t${old.root}\n`);
  } else if (old) {
    const keep = new Set(now.map(key));
    for (const item of old.items.filter((i) => !keep.has(key(i)))) {
      if (linkTypes.has(item.type) && (await linkInto(item.where, root))) {
        await unlink(item.where);
      }
      out.write(`removed\t${key(item)}\n`);
    }
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, formatReceipt(root, now), { mode: 0o600 });
  return now;
}

// removeReceipt removes each link in the receipt that points into root, prints every item as
// removed, and deletes the receipt. A receipt of another checkout stays.
export async function removeReceipt(root, opts, out) {
  root = root.replace(/\/$/, "");
  const path = opts.path ?? receiptPath(opts.home);
  const old = await readReceipt(path);
  if (!old) {
    out.write("no receipt\n");
    return;
  }
  if (old.root !== root) {
    out.write(`receipt belongs to ${old.root}. Skipped.\n`);
    return;
  }
  for (const item of old.items) {
    if (linkTypes.has(item.type) && (await linkInto(item.where, root))) {
      await unlink(item.where);
    }
    out.write(`removed\t${key(item)}\n`);
  }
  await rm(path, { force: true });
}
