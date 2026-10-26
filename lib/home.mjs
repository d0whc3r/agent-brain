import { copyFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

import { ifMissing } from "./io.mjs";
import { brainPrefix } from "./skills.mjs";

// The paths of an old checkout that held the data of the user before the brain home existed.
const dataPaths = ["brain.config.json", "premises.base", "memory", "dod", ".obsidian"];

// migrateHome copies the data of the user from an old checkout into the home. Each line starts
// with added, updated, unchanged, or conflict, then the path in the home. A home file that still
// equals its template copy is updated. A home file the user changed is a conflict and stays.
export async function migrateHome(root, home, { from, apply }) {
  const lines = [];
  for (const rel of await migrationFiles(root, from)) {
    const status = await copyStatus(join(from, rel), join(home, rel), join(root, "templates", "home", rel));
    lines.push(`${status} ${rel}`);
    if (apply && (status === "added" || status === "updated")) {
      await mkdir(dirname(join(home, rel)), { recursive: true });
      await copyFile(join(from, rel), join(home, rel));
    }
  }
  return lines;
}

// homeStarters lists each starter premise of the template that the home has neither as a
// premise nor as a dropped premise, so an update offers new starters and never brings back one
// that the user removed. apply copies each one into the home as a candidate.
export async function homeStarters(root, home, apply) {
  const dir = join(root, "templates", "home", "memory", "premises");
  const lines = [];
  for (const name of (await ifMissing(readdir(dir), [])).filter((n) => n.endsWith(".md")).toSorted()) {
    const known = await Promise.all(["premises", "dropped"].map((kind) => exists(join(home, "memory", kind, name))));
    if (known.includes(true)) {
      continue;
    }
    lines.push(`added memory/premises/${name}`);
    if (apply) {
      await mkdir(join(home, "memory", "premises"), { recursive: true });
      await copyFile(join(dir, name), join(home, "memory", "premises", name));
    }
  }
  return lines;
}

// migrationFiles lists the data paths, the flows that the brain does not ship, every brain-
// draft skill, and each active skill that the brain does not ship.
async function migrationFiles(root, from) {
  const files = [];
  for (const path of dataPaths) {
    files.push(...(await filesUnder(from, path)));
  }
  files.push(...(await userFlows(root, from)));
  for (const name of await names(join(from, "skills", "drafts"))) {
    if (name.startsWith(brainPrefix)) {
      files.push(...(await filesUnder(from, join("skills", "drafts", name))));
    }
  }
  const shipped = new Set(await names(join(root, "skills", "active")));
  for (const name of await names(join(from, "skills", "active"))) {
    if (!shipped.has(name)) {
      files.push(...(await filesUnder(from, join("skills", "active", name))));
    }
  }
  return files;
}

async function userFlows(root, from) {
  const shipped = new Set(await names(join(root, "flows")));
  return (await names(join(from, "flows")))
    .filter((name) => name.endsWith(".md") && !shipped.has(name))
    .map((name) => join("flows", name));
}

// filesUnder lists the files at rel inside base: rel itself when it is a file, or every file
// below it when it is a folder. A missing path lists nothing.
async function filesUnder(base, rel) {
  const info = await ifMissing(stat(join(base, rel)), null);
  if (!info) {
    return [];
  }
  if (!info.isDirectory()) {
    return [rel];
  }
  const entries = await readdir(join(base, rel), { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(base, join(entry.parentPath, entry.name)))
    .toSorted();
}

async function copyStatus(src, dest, template) {
  const [source, current, starter] = await Promise.all([src, dest, template].map((p) => ifMissing(readFile(p), null)));
  if (current === null) {
    return "added";
  }
  if (current.equals(source)) {
    return "unchanged";
  }
  // A home file that still equals its template copy holds no change of the user.
  if (starter !== null && current.equals(starter)) {
    return "updated";
  }
  return "conflict";
}

async function names(dir) {
  return (await ifMissing(readdir(dir), [])).toSorted();
}

async function exists(path) {
  return (await ifMissing(stat(path), null)) !== null;
}
