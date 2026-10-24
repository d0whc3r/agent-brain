import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { brainSkills, conflicts, scanScopes, scanWorkspace } from "./workspace.mjs";

async function put(path, text) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, text);
}

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), "brain-ws-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const ws = join(base, "ws");
  const brain = join(base, "brain");
  await put(join(ws, "AGENTS.md"), "workspace rules\n");
  await put(join(ws, "repo-a", "AGENTS.md"), "repo a rules\n");
  await put(join(ws, "repo-a", ".agents", "skills", "shared-skill", "SKILL.md"), "repo version\n");
  await mkdir(join(ws, "repo-a", ".claude", "skills"), { recursive: true });
  await symlink(
    join(ws, "repo-a", ".agents", "skills", "shared-skill"),
    join(ws, "repo-a", ".claude", "skills", "shared-skill"),
  );
  await put(join(ws, "repo-a", ".claude", "skills", "learn", "SKILL.md"), "repo learn\n");
  await put(join(ws, "repo-a", ".claude", "agents", "helper.md"), "agent\n");
  await symlink(join(ws, "repo-a", ".agents", "skills", "missing"), join(ws, "repo-a", ".claude", "skills", "missing"));
  await put(
    join(ws, "repo-a", "skills-lock.json"),
    JSON.stringify({ skills: { "shared-skill": { source: "org/skills" } } }),
  );
  await put(join(ws, "repo-a-copy", "AGENTS.md"), "copy rules\n");
  await put(join(ws, "repo-b", "README.md"), "no agent config\n");
  await put(join(brain, "skills", "active", "learn", "SKILL.md"), "brain learn\n");
  await put(join(brain, ".agents", "skills", "shared-skill", "SKILL.md"), "brain version\n");
  const origins = { "repo-a": "repo-a", "repo-a-copy": "repo-a", "repo-b": "repo-b" };
  const origin = (path) => origins[path.split("/").pop()] ?? "";
  return { ws, brain, origin };
}

test("TestScanWorkspace", async (t) => {
  const { ws, origin } = await fixture(t);
  const inv = await scanWorkspace(ws, origin);
  assert.deepEqual(
    inv.repos.map((r) => r.dir),
    [".", "repo-a"],
  );
  assert.deepEqual(inv.copies, ["repo-a-copy (copy of repo-a)"]);
  const repo = inv.repos[1];
  assert.deepEqual(
    repo.files.map((f) => f.path),
    ["AGENTS.md"],
  );
  assert.deepEqual(
    repo.skills.map((s) => [s.name, s.source]),
    [
      ["learn", ""],
      ["missing", ""],
      ["shared-skill", "org/skills"],
    ],
  );
  assert.deepEqual(
    repo.agents.map((a) => a.name),
    ["helper.md"],
  );
});

test("TestConflicts", async (t) => {
  const { ws, brain, origin } = await fixture(t);
  const before = await scanWorkspace(ws, origin);
  const found = conflicts(before, await brainSkills(brain));
  assert.equal(found.length, 3);
  assert.match(found[0], /^collision\trepo-a\/.claude\/skills\/learn\t/u);
  assert.match(found[1], /^broken\trepo-a\/.claude\/skills\/missing\t/u);
  assert.match(found[2], /^version\trepo-a\/.claude\/skills\/shared-skill\t/u);
});

const scopeOf = (path) => ({ scope: path.endsWith("/clone") ? "" : "work" });

test("TestScanScopes", async (t) => {
  const { ws, origin } = await fixture(t);
  await put(join(ws, "clone", "AGENTS.md"), "third-party rules\n");
  const config = { scopes: { work: { owners: [], roots: [ws, join(ws, "missing")] } } };
  const inv = await scanScopes(config, (path) => (path.endsWith("/clone") ? "clone" : origin(path)), scopeOf);
  assert.deepEqual(
    inv.repos.map((r) => r.dir),
    ["work/.", "work/repo-a"],
  );
  assert.deepEqual(inv.copies, ["work/clone (not in scope work)", "work/repo-a-copy (copy of repo-a)"]);
  assert.equal(inv.roots.length, 1);
});
