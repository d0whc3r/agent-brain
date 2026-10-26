import { lstat, mkdir, readFile, readdir, readlink, rm, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { ifMissing } from "./io.mjs";

// The receipt lists what install put on disk, so a later install or uninstall can name an
// item that the new version dropped, even when its link is already gone.
// Each line: type, name, then a path or a tool, split by one tab. The first line is root, the
// checkout, and the version of the brain that wrote the receipt.
export function receiptPath(home = homedir()) {
  return join(home, ".local", "share", "agent-brain", "installed.txt");
}

export function parseReceipt(text) {
  const lines = text.split("\n").filter((line) => line !== "");
  const [kind, root = "", version = ""] = (lines[0] ?? "").split("\t");
  if (kind !== "root") {
    return { root: "", version: "", items: [] };
  }
  const items = lines.slice(1).map((line) => {
    const [type, name, where] = line.split("\t");
    return { type, name, where };
  });
  return { root, version, items };
}

export function formatReceipt(root, items, version) {
  const lines = [`root\t${root}\t${version}`, ...items.map((i) => `${i.type}\t${i.name}\t${i.where}`)];
  return `${lines.join("\n")}\n`;
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
  for (const name of (await ifMissing(readdir(dir), [])).toSorted()) {
    // A broken link is not installed: the new version dropped what it pointed at.
    if ((await linkInto(join(dir, name), into)) && (await stat(join(dir, name)).catch(() => null))) {
      out.push(name);
    }
  }
  return out;
}

// collectInstalled reads what belongs to root on disk now.
// opts: home, binDir, targets (skill link dirs), claude (MCP servers registered in Claude Code).
export async function collectInstalled(rawRoot, opts) {
  const root = rawRoot.replace(/\/$/u, "");
  const home = opts.home ?? homedir();
  const items = await linkItems(root, home, opts);
  const tools = opts.claude ? ["claude", "codex"] : ["codex"];
  for (const tool of tools) {
    for (const name of ["brain-premises", "chrome-devtools"]) {
      items.push({ type: "mcp", name, where: tool });
    }
  }
  items.push(...(await configItems(home, root)));
  return items;
}

// linkItems lists the skill, agent, and bin links that point into root.
async function linkItems(root, home, opts) {
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
      items.push({ type: "agents", name: name.replace(/\.md$/u, ""), where: join(dir, name) });
    }
  }
  const bin = join(opts.binDir, "brain");
  if (await linkInto(bin, join(root, "bin"))) {
    items.push({ type: "bin", name: "brain", where: bin });
  }
  return items;
}

// premiseHooks lists each tool file that holds the session premises hook.
async function premiseHooks(home, root) {
  const where = [];
  const settings = join(home, ".claude", "settings.json");
  const codexHooks = join(home, ".codex", "hooks.json");
  const plugin = join(home, ".config", "opencode", "plugins", "brain-session-premises.js");
  if ((await ifMissing(readFile(settings, "utf8"), "")).includes("session-premises.mjs")) {
    where.push(settings);
  }
  if ((await readFile(codexHooks, "utf8").catch(() => "")).includes("session-premises.mjs")) {
    where.push(codexHooks);
  }
  if (await linkInto(plugin, join(root, "hooks", "opencode"))) {
    where.push(plugin);
  }
  return where;
}

// configItems lists the hook, the guard, and the Codex instructions that install wrote.
async function configItems(home, root) {
  const items = [];
  const settings = join(home, ".claude", "settings.json");
  const text = await ifMissing(readFile(settings, "utf8"), "");
  for (const where of await premiseHooks(home, root)) {
    items.push({ type: "hook", name: "session-premises", where });
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
const isGone = async (path) => !(await ifMissing(stat(path), null));

// removeLinks removes each link item that still points into root, and prints
// "removed TYPE PATH" for it. A dry run prints the lines and removes nothing.
async function removeLinks(items, { root, dryRun = false }, out) {
  for (const item of items) {
    if (linkTypes.has(item.type) && (await linkInto(item.where, root))) {
      if (!dryRun) {
        await unlink(item.where);
      }
      out.write(`removed\t${item.type}\t${item.where}\n`);
    }
  }
}

// writeReceipt compares the old receipt with what is on disk now, and writes the new receipt.
// It removes each old link that the new version dropped when the link still points into root.
// When the old checkout is gone, because it moved, it removes the dead links of that checkout.
export async function writeReceipt(rawRoot, opts, out) {
  const root = rawRoot.replace(/\/$/u, "");
  const path = opts.path ?? receiptPath(opts.home);
  const now = await collectInstalled(root, opts);
  const old = await readReceipt(path);
  if (old?.root === root) {
    const keep = new Set(now.map((item) => key(item)));
    await removeLinks(
      old.items.filter((i) => !keep.has(key(i))),
      { root },
      out,
    );
  } else if (old && (await isGone(old.root))) {
    await removeLinks(old.items, { root: old.root }, out);
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, formatReceipt(root, now, opts.version ?? ""), { mode: 0o600 });
  return now;
}

// removeReceipt removes each link in the receipt that points into root, and deletes the
// receipt. A receipt of another checkout stays. A receipt whose checkout is gone goes with
// its dead links. Other lines start with "note".
export async function removeReceipt(rawRoot, opts, out) {
  const root = rawRoot.replace(/\/$/u, "");
  const path = opts.path ?? receiptPath(opts.home);
  const old = await readReceipt(path);
  if (!old) {
    out.write("note\tno receipt\n");
    return;
  }
  const orphan = old.root !== root && (await isGone(old.root));
  if (old.root !== root && !orphan) {
    out.write(`note\treceipt belongs to ${old.root}. Skipped.\n`);
    return;
  }
  await removeLinks(old.items, { root: old.root, dryRun: opts.dryRun }, out);
  if (orphan) {
    out.write(`note\tremoved the receipt of ${old.root}, a checkout that is gone\n`);
  }
  if (!opts.dryRun) {
    await rm(path, { force: true });
  }
}
