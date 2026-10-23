import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { open } from "./premise.mjs";

// A premise with no use in this window is stale.
const staleDays = 90;
const dayMs = 24 * 60 * 60 * 1000;

// premiseStats counts how often each active premise was applied and rejected,
// from the applied and rejected lists in memory/sessions notes.
export async function premiseStats(root, now = new Date()) {
  const store = await open(root);
  const rows = new Map();
  for (const premise of await store.list("")) {
    rows.set(premise.id, { id: premise.id, applied: 0, rejected: 0, last: "" });
  }
  for (const note of await sessionNotes(root)) {
    for (const id of note.applied) {
      const row = rows.get(id);
      if (!row) {
        continue;
      }
      row.applied += 1;
      if (note.date > row.last) {
        row.last = note.date;
      }
    }
    for (const id of note.rejected) {
      const row = rows.get(id);
      if (row) {
        row.rejected += 1;
      }
    }
  }
  return [...rows.values()].map((row) => ({ ...row, flag: flagFor(row, now) }));
}

function flagFor(row, now) {
  if (row.rejected >= 2 && row.rejected >= row.applied) {
    return "noisy";
  }
  if (row.last === "") {
    return "unused";
  }
  if (now - Date.parse(row.last) > staleDays * dayMs) {
    return "stale";
  }
  return "";
}

async function sessionNotes(root) {
  const dir = join(root, "memory", "sessions");
  let names;
  try {
    names = await readdir(dir);
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const notes = [];
  for (const name of names.filter((n) => n.endsWith(".md")).sort()) {
    const fields = frontmatter(await readFile(join(dir, name), "utf8"));
    notes.push({
      date: String(fields.date ?? ""),
      applied: list(fields.applied),
      rejected: list(fields.rejected),
    });
  }
  return notes;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

// frontmatter reads scalar keys, block lists, and empty inline lists.
// A note without frontmatter gives no fields.
export function frontmatter(text) {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const fields = {};
  if (lines[0]?.trim() !== "---") {
    return fields;
  }
  let key = "";
  for (const line of lines.slice(1)) {
    if (line.trim() === "---") {
      break;
    }
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && key !== "") {
      fields[key].push(item[1].trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    const pair = line.match(/^([\w-]+):\s*(.*)$/);
    if (!pair) {
      continue;
    }
    key = "";
    if (pair[2] === "" || pair[2] === "[]") {
      key = pair[1];
      fields[key] = [];
      continue;
    }
    fields[pair[1]] = pair[2].replace(/^["']|["']$/g, "");
  }
  return fields;
}
