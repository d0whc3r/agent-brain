import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readlink, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { run } from "../bin/brain.mjs";
import { acceptSkill, linkSkills } from "./skills.mjs";

const execFileAsync = promisify(execFile);

async function tempRoot(t) {
  const parent = await mkdtemp(join(tmpdir(), "brain-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, "repo");
  await mkdir(root);
  return { parent, root };
}

function git(root, args) {
  return execFileAsync("git", args, { cwd: root });
}

async function initRepo(root) {
  await git(root, ["init", "-b", "main"]);
  await git(root, ["config", "user.email", "brain-test@example.com"]);
  await git(root, ["config", "user.name", "brain-test"]);
}

test("TestAcceptRejectsDotDot", async (t) => {
  const { parent, root } = await tempRoot(t);
  const before = (await readdir(parent)).sort();

  await assert.rejects(acceptSkill(root, "../x"));

  const after = (await readdir(parent)).sort();
  assert.deepEqual(after, before);
  await assert.rejects(stat(join(parent, "x")), (err) => err.code === "ENOENT");
});

test("TestAcceptRejectsMissing", async (t) => {
  const { root } = await tempRoot(t);

  await assert.rejects(acceptSkill(root, "demo"), (err) => err.code === "ENOENT");
  await assert.rejects(stat(join(root, "skills", "active", "demo")), (err) => err.code === "ENOENT");
});

test("TestAcceptRejectsExisting", async (t) => {
  const { root } = await tempRoot(t);
  const draft = join(root, "skills", "drafts", "demo");
  const active = join(root, "skills", "active", "demo");
  await mkdir(draft, { recursive: true });
  await writeFile(join(draft, "SKILL.md"), "draft\n");
  await mkdir(active, { recursive: true });
  await writeFile(join(active, "SKILL.md"), "active\n");

  await assert.rejects(acceptSkill(root, "demo"));
  await stat(join(draft, "SKILL.md"));
});

test("TestAcceptMovesDraft", async (t) => {
  const { root } = await tempRoot(t);
  await initRepo(root);
  const draft = join(root, "skills", "drafts", "demo");
  await mkdir(draft, { recursive: true });
  await writeFile(join(draft, "SKILL.md"), "name: demo\n");
  await writeFile(join(root, "other.txt"), "leave me\n");

  await acceptSkill(root, "demo");

  await assert.rejects(stat(draft), (err) => err.code === "ENOENT");
  await stat(join(root, "skills", "active", "demo", "SKILL.md"));
  const log = await git(root, ["log", "-1", "--format=%s"]);
  assert.equal(log.stdout.trim(), "skill: accept demo");
  const remotes = await git(root, ["remote"]);
  assert.equal(remotes.stdout, "");
  const shown = await git(root, ["show", "--name-only", "--format=", "HEAD"]);
  assert.equal(shown.stdout.includes("other.txt"), false);
  assert.equal(shown.stdout.includes("skills/active/demo/SKILL.md"), true);
});

test("TestAcceptCommitsTrackedMove", async (t) => {
  const { root } = await tempRoot(t);
  await initRepo(root);
  const draft = join(root, "skills", "drafts", "demo");
  await mkdir(draft, { recursive: true });
  await writeFile(join(draft, "SKILL.md"), "name: demo\n");
  await writeFile(join(root, "other.txt"), "keep\n");
  await git(root, ["add", "--", "skills/drafts/demo", "other.txt"]);
  await git(root, ["commit", "-m", "seed"]);

  await acceptSkill(root, "demo");

  await assert.rejects(stat(draft), (err) => err.code === "ENOENT");
  await stat(join(root, "skills", "active", "demo", "SKILL.md"));
  const log = await git(root, ["log", "-1", "--format=%s"]);
  assert.equal(log.stdout.trim(), "skill: accept demo");
  const shown = await git(root, ["show", "--name-status", "--format=", "HEAD"]);
  assert.equal(shown.stdout.includes("skills/drafts/demo/SKILL.md"), true);
  assert.equal(shown.stdout.includes("skills/active/demo/SKILL.md"), true);
  assert.equal(shown.stdout.includes("other.txt"), false);
  const status = await git(root, ["status", "--porcelain"]);
  assert.equal(status.stdout, "");
});

test("TestAcceptRefreshesLinks", async (t) => {
  const { parent, root } = await tempRoot(t);
  await initRepo(root);
  const name = "demo";
  const draft = join(root, "skills", "drafts", name);
  await mkdir(draft, { recursive: true });
  await writeFile(join(draft, "SKILL.md"), "name: demo\n");
  await mkdir(join(root, "skills", "drafts", "example-draft"), { recursive: true });
  await writeFile(join(root, "skills", "drafts", "example-draft", "SKILL.md"), "draft\n");
  const target = join(parent, "linked");
  await mkdir(join(root, "mcp"), { recursive: true });
  await writeFile(join(root, "mcp", "link-targets.txt"), `${target}\n`);

  await acceptSkill(root, name);

  const dest = join(target, name);
  const info = await lstat(dest);
  assert.equal(info.isSymbolicLink(), true);
  assert.equal(await readlink(dest), join(root, "skills", "active", name));
  await assert.rejects(lstat(join(target, "example-draft")), (err) => err.code === "ENOENT");
});

test("TestLinkSkipsDrafts", async (t) => {
  const { root } = await tempRoot(t);
  const activeName = "demo-skill";
  await mkdir(join(root, "skills", "active", activeName), { recursive: true });
  await writeFile(join(root, "skills", "active", activeName, "SKILL.md"), "active\n");
  await mkdir(join(root, "skills", "drafts", "example-draft"), { recursive: true });
  await writeFile(join(root, "skills", "drafts", "example-draft", "SKILL.md"), "draft\n");
  const target = join(root, "linked");

  const lines = await linkSkills(root, [target], false);

  const text = lines.join("\n");
  assert.equal(text.includes(activeName), true);
  assert.equal(text.includes("example-draft"), false);
  assert.equal(lines.some((line) => line.startsWith("ln -sfn ")), true);
  await assert.rejects(stat(target), (err) => err.code === "ENOENT");
  await assert.rejects(lstat(join(target, activeName)), (err) => err.code === "ENOENT");
});

function invoke(args) {
  let stdout = "";
  let stderr = "";
  return run(args, {
    write(chunk) {
      stdout += chunk;
    },
  }, {
    write(chunk) {
      stderr += chunk;
    },
  }).then((code) => ({ code, stdout, stderr }));
}

function useRoot(t, root) {
  const previous = process.env.BRAIN_ROOT;
  process.env.BRAIN_ROOT = root;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.BRAIN_ROOT;
      return;
    }
    process.env.BRAIN_ROOT = previous;
  });
}

test("TestCLIAcceptAndLink", async (t) => {
  const { parent, root } = await tempRoot(t);
  await initRepo(root);
  const draft = join(root, "skills", "drafts", "demo");
  await mkdir(draft, { recursive: true });
  await writeFile(join(draft, "SKILL.md"), "name: demo\n");
  await mkdir(join(root, "skills", "active", "demo-skill"), { recursive: true });
  await mkdir(join(root, "skills", "drafts", "example-draft"), { recursive: true });
  useRoot(t, root);

  let result = await invoke(["accept-skill", "../x"]);
  assert.notEqual(result.code, 0);
  await assert.rejects(stat(join(parent, "x")), (err) => err.code === "ENOENT");

  result = await invoke(["accept-skill", "missing-draft"]);
  assert.equal(result.code, 1, result.stderr);

  result = await invoke(["accept-skill", "demo"]);
  assert.equal(result.code, 0, result.stderr);
  const log = await git(root, ["log", "-1", "--format=%s"]);
  assert.equal(log.stdout.trim(), "skill: accept demo");

  const target = join(root, "linked");
  result = await invoke(["link-skills", "--target", target]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.includes("demo-skill"), true);
  assert.equal(result.stdout.includes("example-draft"), false);
  await assert.rejects(stat(target), (err) => err.code === "ENOENT");

  result = await invoke(["link-skills", "--apply", "--target", target]);
  assert.equal(result.code, 0, result.stderr);
  const linked = await lstat(join(target, "demo-skill"));
  assert.equal(linked.isSymbolicLink(), true);
  assert.equal(await readlink(join(target, "demo-skill")), join(root, "skills", "active", "demo-skill"));
  const accepted = await lstat(join(target, "demo"));
  assert.equal(accepted.isSymbolicLink(), true);
  assert.equal(await readlink(join(target, "demo")), join(root, "skills", "active", "demo"));
  await assert.rejects(lstat(join(target, "example-draft")), (err) => err.code === "ENOENT");
});

test("TestLinkApplyCreatesSymlink", async (t) => {
  const { root } = await tempRoot(t);
  const activeName = "demo-skill";
  await mkdir(join(root, "skills", "active", activeName), { recursive: true });
  await mkdir(join(root, "skills", "drafts", "example-draft"), { recursive: true });
  const target = join(root, "linked");

  const lines = await linkSkills(root, [target], true);

  assert.equal(lines.join("\n").includes("example-draft"), false);
  const dest = join(target, activeName);
  const info = await lstat(dest);
  assert.equal(info.isSymbolicLink(), true);
  assert.equal(await readlink(dest), join(root, "skills", "active", activeName));
  await assert.rejects(lstat(join(target, "example-draft")), (err) => err.code === "ENOENT");
});
