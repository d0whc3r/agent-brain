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
    await store.add({ id, text: `Rule ${id}`, strength: "always", repos: ["*"] });
  }
  const sessions = join(root, "memory", "sessions");
  await mkdir(sessions, { recursive: true });
  await writeFile(join(sessions, "2026-01-01-repo-a.md"), "---\ndate: 2026-01-01\napplied:\n  - old\n  - gone\nrejected:\n  - noisy\n---\n");
  await writeFile(join(sessions, "2026-10-01-repo-a.md"), "---\ndate: 2026-10-01\napplied:\n  - fresh\nrejected:\n  - noisy\n---\n");

  const rows = await premiseStats(root, new Date("2026-10-23"));
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual(byId.fresh, { id: "fresh", applied: 1, rejected: 0, last: "2026-10-01", flag: "" });
  assert.equal(byId.old.flag, "stale");
  assert.equal(byId.noisy.flag, "noisy");
  assert.equal(byId.unused.flag, "unused");
  assert.equal(byId.gone, undefined);
});
