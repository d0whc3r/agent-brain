import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { open } from "./premise.mjs";

// A premise with no use in this window is stale.
const staleDays = 90;
// A premise checked this many times with no finding is idle.
const idleChecks = 10;
// A candidate is ready for the user after this many repeats on at least readyDays distinct days.
const readyCorrections = 2;
const readyDefects = 3;
const readyDays = 2;
// A candidate with no repeat in this window expires.
const candidateDays = 30;
const dayMs = 24 * 60 * 60 * 1000;

// premiseStats counts, for each active premise, the reviews that applied it, the findings
// it produced (hits), and the findings the user rejected, from memory/sessions notes.
// It also measures each candidate from its seen list.
export async function premiseStats(root, now = new Date()) {
  const store = await open(root);
  const rows = new Map();
  for (const premise of await store.list("")) {
    rows.set(premise.id, { id: premise.id, status: "active", applied: 0, hits: 0, rejected: 0, last: "" });
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
    for (const id of note.hits) {
      const row = rows.get(id);
      if (row) {
        row.hits += 1;
      }
    }
    for (const id of note.rejected) {
      const row = rows.get(id);
      if (row) {
        row.rejected += 1;
      }
    }
  }
  const active = [...rows.values()].map((row) => ({ ...row, flag: flagFor(row, now) }));
  const candidates = (await store.list("", null, "candidate")).map((premise) => candidateRow(premise, now));
  return [...active, ...candidates];
}

function candidateRow(premise, now) {
  const entries = premise.seen.map((entry) => entry.split(" "));
  const days = new Set(entries.map(([date]) => date));
  const last = [...days].sort().pop() ?? "";
  const corrections = entries.filter(([, , origin]) => origin === "correction");
  const defects = entries.filter(([, , origin]) => origin === "defect");
  let flag = "";
  if (last === "" || now - Date.parse(last) > candidateDays * dayMs) {
    flag = "expired";
  } else if (reached(corrections, readyCorrections) || reached(defects, readyDefects)) {
    flag = "ready";
  }
  return { id: premise.id, status: "candidate", seen: entries.length, last, flag };
}

// reached tells whether the entries of one origin meet the count on readyDays distinct days.
function reached(entries, count) {
  return entries.length >= count && new Set(entries.map(([date]) => date)).size >= readyDays;
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
  if (row.applied >= idleChecks && row.hits === 0) {
    return "idle";
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
      hits: list(fields.hits),
      rejected: list(fields.rejected),
    });
  }
  return notes;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

// frontmatter reads scalar keys, block lists, and inline lists such as [a, b].
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
    const inline = pair[2].match(/^\[(.*)\]$/);
    if (inline) {
      fields[pair[1]] = inline[1].split(",").map((v) => v.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
      continue;
    }
    fields[pair[1]] = pair[2].replace(/^["']|["']$/g, "");
  }
  return fields;
}
