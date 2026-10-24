import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse } from "yaml";

import { ifMissing } from "./io.mjs";
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
    for (const key of ["applied", "hits", "rejected"]) {
      for (const row of note[key].map((id) => rows.get(id)).filter(Boolean)) {
        row[key] += 1;
        if (key === "applied" && note.date > row.last) {
          row.last = note.date;
        }
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
  const notes = [];
  for (const name of (await ifMissing(readdir(dir), [])).filter((n) => n.endsWith(".md")).sort()) {
    const fields = await readFields(join(dir, name));
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

// frontmatter returns the YAML fields between the first two --- lines of a note.
// A note without frontmatter gives no fields. Invalid YAML throws.
export function frontmatter(text) {
  const match = text.replaceAll("\r\n", "\n").match(/^---[ \t]*\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/);
  const fields = match ? parse(match[1] ?? "") : null;
  return fields !== null && typeof fields === "object" ? fields : {};
}

// readFields reads the frontmatter of a note. A note with invalid YAML gives no fields and a
// warning, so one bad note does not hide every other note.
export async function readFields(path) {
  try {
    return frontmatter(await readFile(path, "utf8"));
  } catch (err) {
    process.stderr.write(`skip ${path}: ${err.message.split("\n")[0]}\n`);
    return {};
  }
}
