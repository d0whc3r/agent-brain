import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { kindsOf, loadFlows, matchFlows, repoContext } from "./flows.mjs";

test("TestKindsOf", () => {
  assert.deepEqual(
    kindsOf(["a/b.go", "x_test.go", "api/v1/backup.proto", "src/App.tsx", "alembic/versions/1_add.py", "README.md"]),
    ["docs", "go", "migration", "proto", "python", "test", "ui"],
  );
});

test("TestMatchFlows", async (t) => {
  const brain = await mkdtemp(join(tmpdir(), "brain-flows-"));
  t.after(() => rm(brain, { recursive: true, force: true }));
  await mkdir(join(brain, "flows"));
  await writeFile(join(brain, "flows", "README.md"), "not a flow\n");
  await writeFile(join(brain, "flows", "proto-change.md"), "---\nname: proto-change\nkinds: [proto]\nbranch: feature\n---\nsteps\n");
  await writeFile(join(brain, "flows", "start-ticket.md"), "---\nbranch: main\ndirty: false\n---\nsteps\n");
  await writeFile(join(brain, "flows", "address-review.md"), "---\npr: [changes_requested]\n---\nsteps\n");
  await writeFile(join(brain, "flows", "ui-only.md"), "---\nrepos: [repo-ui]\nkinds: [ui]\n---\nsteps\n");
  await writeFile(join(brain, "flows", "hygiene.md"), "---\nname: hygiene\n---\nsteps\n");
  const flows = await loadFlows(brain);
  assert.equal(flows.length, 5);

  const ctx = { repo: "repo-api", onMain: false, dirty: true, behind: 0, kinds: ["proto"], pr: "changes_requested" };
  assert.deepEqual(matchFlows(flows, ctx).map((f) => [f.name, f.score]), [
    ["proto-change", 2],
    ["address-review", 1],
    ["hygiene", 0],
  ]);
  const main = { repo: "repo-ui", onMain: true, dirty: false, behind: 0, kinds: [], pr: "none" };
  assert.deepEqual(matchFlows(flows, main).map((f) => f.name), ["start-ticket", "hygiene"]);
});

test("TestRepoContextKeepsFirstStatusPath", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "brain-ctx-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
  git("init", "-q", "-b", "feat/CCL-12_thing");
  await writeFile(join(dir, "a.proto"), "x\n");
  git("add", "a.proto");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "seed");
  await writeFile(join(dir, "a.proto"), "y\n");

  const ctx = repoContext(dir, { pr: false });
  assert.deepEqual(ctx.changed, ["a.proto"]);
  assert.deepEqual(ctx.kinds, ["proto"]);
  assert.equal(ctx.ticket, "CCL-12");
  assert.equal(ctx.onMain, false);
  assert.equal(ctx.dirty, true);
});
