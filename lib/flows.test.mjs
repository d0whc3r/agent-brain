import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  const { dir } = await contextRepo(t);
  await writeFile(join(dir, "a.proto"), "y\n");

  const ctx = repoContext(dir, { pr: false });
  assert.deepEqual(ctx.changed, ["a.proto"]);
  assert.deepEqual(ctx.kinds, ["proto"]);
  assert.equal(ctx.ticket, "CCL-12");
  assert.equal(ctx.onMain, false);
  assert.equal(ctx.dirty, true);
});

test("TestContextFindsNewFiles", async (t) => {
  const { dir } = await contextRepo(t);
  await mkdir(join(dir, "src", "new"), { recursive: true });
  const files = ['src/new/Page -> "é".tsx', "src/new/api.proto"];
  for (const file of files) {
    await writeFile(join(dir, file), "new file\n");
  }
  const ctx = repoContext(dir, { pr: false });
  assert.deepEqual(ctx.changed, files);
  assert.deepEqual(ctx.kinds, ["proto", "ui"]);
  assert.equal(ctx.untracked, 2);
  assert.deepEqual(matchFlows([{ name: "ui-check", kinds: ["ui"] }], ctx).map((flow) => flow.name), ["ui-check"]);
});

test("TestContextReadsRenamePaths", async (t) => {
  const { dir, git } = await contextRepo(t);
  const renamed = 'renamed -> "é".proto';
  git("mv", "a.proto", renamed);
  assert.deepEqual(repoContext(dir, { pr: false }).changed, [renamed]);

  git("commit", "-qm", "rename");
  git("update-ref", "refs/remotes/origin/main", "HEAD~1");
  const ctx = repoContext(dir, { pr: false });
  assert.deepEqual(ctx.changed, [renamed]);
  assert.equal(ctx.dirty, false);
  assert.equal(ctx.ahead, 1);
});

test("TestContextReadsPRStates", async (t) => {
  const { dir } = await contextRepo(t);
  const bin = join(dir, "fake-bin");
  const fixture = join(dir, "pr.json");
  await mkdir(bin);
  const gh = join(bin, "gh");
  await writeFile(gh, `#!/usr/bin/env node\nprocess.stdout.write(require("node:fs").readFileSync(${JSON.stringify(fixture)}, "utf8"));\n`);
  await chmod(gh, 0o755);
  const previous = process.env.PATH;
  process.env.PATH = `${bin}:${previous}`;
  t.after(() => { process.env.PATH = previous; });
  const cases = [
    [{ state: "CLOSED" }, "none"],
    [{ state: "MERGED" }, "none"],
    [{ state: "OPEN", isDraft: true, reviewDecision: "CHANGES_REQUESTED" }, "draft"],
    [{ state: "OPEN", isDraft: false, reviewDecision: "CHANGES_REQUESTED" }, "changes_requested"],
    [{ state: "OPEN", isDraft: false, reviewDecision: "APPROVED" }, "approved"],
    [{ state: "OPEN", isDraft: false, reviewDecision: "REVIEW_REQUIRED" }, "open"],
  ];
  for (const [pr, expected] of cases) {
    await writeFile(fixture, JSON.stringify(pr));
    assert.equal(repoContext(dir).pr, expected, JSON.stringify(pr));
  }
});

async function contextRepo(t) {
  const dir = await mkdtemp(join(tmpdir(), "brain-ctx-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
  git("init", "-q", "-b", "feat/CCL-12_thing");
  git("config", "user.name", "t");
  git("config", "user.email", "t@t");
  await writeFile(join(dir, "a.proto"), "x\n");
  git("add", "a.proto");
  git("commit", "-qm", "seed");
  return { dir, git };
}
