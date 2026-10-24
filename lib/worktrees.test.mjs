import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { listWorktrees, parseWorktrees } from "./worktrees.mjs";

test("TestParseWorktrees", () => {
  const text =
    "worktree /r\nHEAD aaa\nbranch refs/heads/main\n\nworktree /r-a\nHEAD bbb\ndetached\nlocked\n\nworktree /gone\nHEAD ccc\nbranch refs/heads/x\nprunable gitdir file points to non-existent location\n";
  assert.deepEqual(
    parseWorktrees(text).map((w) => [w.path, w.branch, w.detached, w.locked, w.prunable]),
    [
      ["/r", "main", false, false, false],
      ["/r-a", "", true, true, false],
      ["/gone", "x", false, false, true],
    ],
  );
});

test("TestListWorktreesFindsStackAndState", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "brain-wt-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, "repo");
  const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { stdio: "ignore" });
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  git(dir, "config", "user.name", "t");
  git(dir, "config", "user.email", "t@t");
  await writeFile(join(dir, "a.txt"), "a\n");
  git(dir, "add", "a.txt");
  git(dir, "commit", "-qm", "seed");
  git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");

  const one = join(root, "repo-one");
  const two = join(root, "repo-two");
  const idle = join(root, "repo-idle");
  git(dir, "worktree", "add", "-q", "-b", "split/1-model", one, "origin/main");
  await writeFile(join(one, "b.txt"), "b\n");
  git(one, "add", "b.txt");
  git(one, "commit", "-qm", "model");
  git(dir, "worktree", "add", "-q", "-b", "split/2-api", two, "split/1-model");
  await writeFile(join(two, "c.txt"), "c\n");
  git(two, "add", "c.txt");
  git(two, "commit", "-qm", "api");
  await writeFile(join(two, "d.txt"), "d\n");
  git(dir, "worktree", "add", "-q", "-b", "split/3-idle", idle, "origin/main");

  const list = listWorktrees(two);
  const byBranch = Object.fromEntries(list.map((w) => [w.branch, w]));
  assert.equal(byBranch.main.state, "main");
  assert.equal(byBranch["split/1-model"].parent, "origin/main");
  assert.equal(byBranch["split/2-api"].parent, "split/1-model");
  assert.equal(byBranch["split/2-api"].ahead, 2);
  assert.equal(byBranch["split/2-api"].changed, 1);
  assert.equal(byBranch["split/2-api"].current, true);
  assert.equal(byBranch["split/1-model"].current, false);
  assert.equal(byBranch["split/3-idle"].state, "merged");
  assert.equal(listWorktrees(root), null);
});
