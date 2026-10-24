import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { open } from "./premise.mjs";
import { frontmatter, premiseStats } from "./stats.mjs";

test("TestFrontmatterLists", () => {
  const fields = frontmatter("---\ndate: 2026-10-01\napplied:\n  - a\n  - \"b\"\nrejected: []\n---\nbody\n");
  assert.deepEqual(fields, { date: "2026-10-01", applied: ["a", "b"], rejected: [] });
  assert.deepEqual(frontmatter("no frontmatter"), {});
  assert.deepEqual(frontmatter("---\nkinds: [go, \"proto\"]\n---\n"), { kinds: ["go", "proto"] });
});

test("TestPremiseStatsFlags", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "brain-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = await open(root);
  for (const id of ["fresh", "old", "noisy", "unused"]) {
    await store.add({ id, text: `Rule ${id}`, strength: "always", scope: "*", repos: ["*"] });
  }
  const sessions = join(root, "memory", "sessions");
  await mkdir(sessions, { recursive: true });
  await writeFile(join(sessions, "2026-01-01-repo-a.md"), "---\ndate: 2026-01-01\napplied:\n  - old\n  - gone\nrejected:\n  - noisy\n---\n");
  await writeFile(join(sessions, "2026-10-01-repo-a.md"), "---\ndate: 2026-10-01\napplied:\n  - fresh\nrejected:\n  - noisy\n---\n");

  const rows = await premiseStats(root, new Date("2026-10-23"));
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual(byId.fresh, { id: "fresh", status: "active", applied: 1, hits: 0, rejected: 0, last: "2026-10-01", flag: "" });
  assert.equal(byId.old.flag, "stale");
  assert.equal(byId.noisy.flag, "noisy");
  assert.equal(byId.unused.flag, "unused");
  assert.equal(byId.gone, undefined);
});

test("TestPremiseStatsHitsAndIdle", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "brain-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = await open(root);
  for (const id of ["useful", "idle"]) {
    await store.add({ id, text: `Rule ${id}`, strength: "always", scope: "*", repos: ["*"] });
  }
  const sessions = join(root, "memory", "sessions");
  await mkdir(sessions, { recursive: true });
  for (let i = 10; i < 20; i++) {
    const hits = i === 10 ? "hits:\n  - useful\n" : "";
    await writeFile(join(sessions, `2026-10-${i}-repo-a.md`), `---\ndate: 2026-10-${i}\napplied:\n  - useful\n  - idle\n${hits}rejected: []\n---\n`);
  }
  const byId = Object.fromEntries((await premiseStats(root, new Date("2026-10-23"))).map((r) => [r.id, r]));
  assert.equal(byId.useful.applied, 10);
  assert.equal(byId.useful.hits, 1);
  assert.equal(byId.useful.flag, "");
  assert.equal(byId.idle.hits, 0);
  assert.equal(byId.idle.flag, "idle");
});

test("TestCandidateStatsReadyAndExpired", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "brain-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = await open(root);
  const cases = {
    "two-days": ["2026-10-20 repo-a correction", "2026-10-22 repo-a correction"],
    "same-day": ["2026-10-22 repo-a correction", "2026-10-22 repo-b correction"],
    "two-defects": ["2026-10-20 repo-a defect", "2026-10-22 repo-a defect"],
    "three-defects": ["2026-10-20 repo-a defect", "2026-10-21 repo-a defect", "2026-10-22 repo-b defect"],
    "old": ["2026-09-01 repo-a correction"],
    // Two corrections on one day and a defect on another day reach no threshold.
    "mixed": ["2026-10-21 repo-a correction", "2026-10-21 repo-b correction", "2026-10-22 repo-a defect"],
  };
  for (const [id, seen] of Object.entries(cases)) {
    await store.add({ id, text: `Rule ${id}`, strength: "always", scope: "*", repos: ["*"], status: "candidate" });
    for (const entry of seen) {
      await store.see(id, entry);
    }
  }
  const byId = Object.fromEntries((await premiseStats(root, new Date("2026-10-23"))).map((r) => [r.id, r]));
  assert.equal(byId["two-days"].status, "candidate");
  assert.equal(byId["two-days"].seen, 2);
  assert.equal(byId["two-days"].last, "2026-10-22");
  assert.equal(byId["two-days"].flag, "ready");
  assert.equal(byId["same-day"].flag, "");
  assert.equal(byId["two-defects"].flag, "");
  assert.equal(byId["three-defects"].flag, "ready");
  assert.equal(byId.old.flag, "expired");
  assert.equal(byId.mixed.flag, "");
});
