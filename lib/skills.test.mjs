import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, readlink, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
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

  await assert.rejects(acceptSkill(root, "brain-demo"), (err) => err.code === "ENOENT");
  await assert.rejects(stat(join(root, "skills", "active", "brain-demo")), (err) => err.code === "ENOENT");
});

test("TestAcceptRejectsExisting", async (t) => {
  const { root } = await tempRoot(t);
  const draft = join(root, "skills", "drafts", "brain-demo");
  const active = join(root, "skills", "active", "brain-demo");
  await mkdir(draft, { recursive: true });
  await writeFile(join(draft, "SKILL.md"), "draft\n");
  await mkdir(active, { recursive: true });
  await writeFile(join(active, "SKILL.md"), "active\n");

  await assert.rejects(acceptSkill(root, "brain-demo"));
  await stat(join(draft, "SKILL.md"));
});

test("TestAcceptMovesDraft", async (t) => {
  const { root } = await tempRoot(t);
  await initRepo(root);
  const draft = join(root, "skills", "drafts", "brain-demo");
  await mkdir(draft, { recursive: true });
  await writeFile(join(draft, "SKILL.md"), "name: brain-demo\n");
  await writeFile(join(root, "other.txt"), "leave me\n");

  await acceptSkill(root, "brain-demo");

  await assert.rejects(stat(draft), (err) => err.code === "ENOENT");
  await stat(join(root, "skills", "active", "brain-demo", "SKILL.md"));
  const log = await git(root, ["log", "-1", "--format=%s"]);
  assert.equal(log.stdout.trim(), "skill: accept brain-demo");
  const remotes = await git(root, ["remote"]);
  assert.equal(remotes.stdout, "");
  const shown = await git(root, ["show", "--name-only", "--format=", "HEAD"]);
  assert.equal(shown.stdout.includes("other.txt"), false);
  assert.equal(shown.stdout.includes("skills/active/brain-demo/SKILL.md"), true);
});

test("TestAcceptCommitsTrackedMove", async (t) => {
  const { root } = await tempRoot(t);
  await initRepo(root);
  const draft = join(root, "skills", "drafts", "brain-demo");
  await mkdir(draft, { recursive: true });
  await writeFile(join(draft, "SKILL.md"), "name: brain-demo\n");
  await writeFile(join(root, "other.txt"), "keep\n");
  await git(root, ["add", "--", "skills/drafts/brain-demo", "other.txt"]);
  await git(root, ["commit", "-m", "seed"]);

  await acceptSkill(root, "brain-demo");

  await assert.rejects(stat(draft), (err) => err.code === "ENOENT");
  await stat(join(root, "skills", "active", "brain-demo", "SKILL.md"));
  const log = await git(root, ["log", "-1", "--format=%s"]);
  assert.equal(log.stdout.trim(), "skill: accept brain-demo");
  const shown = await git(root, ["show", "--name-status", "--format=", "HEAD"]);
  assert.equal(shown.stdout.includes("skills/drafts/brain-demo/SKILL.md"), true);
  assert.equal(shown.stdout.includes("skills/active/brain-demo/SKILL.md"), true);
  assert.equal(shown.stdout.includes("other.txt"), false);
  const status = await git(root, ["status", "--porcelain"]);
  assert.equal(status.stdout, "");
});

test("TestAcceptRefreshesLinks", async (t) => {
  const { parent, root } = await tempRoot(t);
  await initRepo(root);
  const name = "brain-demo";
  const draft = join(root, "skills", "drafts", name);
  await mkdir(draft, { recursive: true });
  await writeFile(join(draft, "SKILL.md"), "name: brain-demo\n");
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
  await writeFile(join(root, "skills", "active", activeName, "SKILL.md"), `name: ${activeName}\n`);
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
  const draft = join(root, "skills", "drafts", "brain-demo");
  await mkdir(draft, { recursive: true });
  await writeFile(join(draft, "SKILL.md"), "name: brain-demo\n");
  await mkdir(join(root, "skills", "active", "demo-skill"), { recursive: true });
  await writeFile(join(root, "skills", "active", "demo-skill", "SKILL.md"), "name: demo-skill\n");
  await mkdir(join(root, "skills", "drafts", "example-draft"), { recursive: true });
  useRoot(t, root);

  let result = await invoke(["accept-skill", "../x"]);
  assert.notEqual(result.code, 0);
  await assert.rejects(stat(join(parent, "x")), (err) => err.code === "ENOENT");

  result = await invoke(["accept-skill", "missing-draft"]);
  assert.equal(result.code, 1, result.stderr);

  result = await invoke(["accept-skill", "brain-demo"]);
  assert.equal(result.code, 0, result.stderr);
  const log = await git(root, ["log", "-1", "--format=%s"]);
  assert.equal(log.stdout.trim(), "skill: accept brain-demo");

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
  const accepted = await lstat(join(target, "brain-demo"));
  assert.equal(accepted.isSymbolicLink(), true);
  assert.equal(await readlink(join(target, "brain-demo")), join(root, "skills", "active", "brain-demo"));
  await assert.rejects(lstat(join(target, "example-draft")), (err) => err.code === "ENOENT");
});

test("TestLinkApplyCreatesSymlink", async (t) => {
  const { root } = await tempRoot(t);
  const activeName = "demo-skill";
  await mkdir(join(root, "skills", "active", activeName), { recursive: true });
  await writeFile(join(root, "skills", "active", activeName, "SKILL.md"), `name: ${activeName}\n`);
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

test("TestAcceptFailedCommitRestoresDraft", async (t) => {
  const { root } = await tempRoot(t);
  await initRepo(root);
  const draft = join(root, "skills", "drafts", "brain-demo");
  await mkdir(draft, { recursive: true });
  await writeFile(join(draft, "SKILL.md"), "name: brain-demo\n");
  const hook = join(root, ".git", "hooks", "pre-commit");
  await writeFile(hook, "#!/bin/sh\nexit 1\n");
  await chmod(hook, 0o755);
  await git(root, ["config", "core.hooksPath", join(root, ".git", "hooks")]);

  await assert.rejects(acceptSkill(root, "brain-demo"), (err) => err.code === "GIT");

  await stat(join(draft, "SKILL.md"));
  await assert.rejects(stat(join(root, "skills", "active", "brain-demo")), (err) => err.code === "ENOENT");
  const status = await git(root, ["status", "--porcelain"]);
  assert.equal(status.stdout.includes("A "), false);
});

test("TestLinkPrunesStaleLinks", async (t) => {
  const { parent, root } = await tempRoot(t);
  const active = join(root, "skills", "active");
  await mkdir(join(active, "kept"), { recursive: true });
  await writeFile(join(active, "kept", "SKILL.md"), "name: kept\n");
  const target = join(parent, "target");
  await mkdir(target);
  await symlink(join(active, "gone"), join(target, "gone"));
  await symlink(join(parent, "elsewhere"), join(target, "other"));

  const dry = await linkSkills(root, [target], false);
  assert.deepEqual(dry, [`rm ${join(target, "gone")}`, `ln -sfn ${join(active, "kept")} ${join(target, "kept")}`]);
  await lstat(join(target, "gone"));

  await linkSkills(root, [target], true);
  await assert.rejects(lstat(join(target, "gone")), (err) => err.code === "ENOENT");
  assert.equal(await readlink(join(target, "other")), join(parent, "elsewhere"));
  assert.equal(await readlink(join(target, "kept")), join(active, "kept"));
});

test("TestLinkVendoredAndSkipForeign", async (t) => {
  const { parent, root } = await tempRoot(t);
  for (const [dir, name] of [["skills/active", "brain-own"], [".agents/skills", "vendor"], [".agents/skills", "extra"], [".agents/skills", "shared"]]) {
    await mkdir(join(root, dir, name), { recursive: true });
    await writeFile(join(root, dir, name, "SKILL.md"), `---\nname: ${name}\n---\nbody\n`);
  }
  await mkdir(join(root, ".agents", "skills", "not-a-skill"), { recursive: true });
  const target = join(parent, "target");
  await mkdir(join(target, "brain-tp-vendor"), { recursive: true });
  const other = join(parent, "other-install");
  await symlink(other, join(target, "brain-tp-shared"));
  // A link from an install before the prefix.
  await symlink(join(root, ".agents", "skills", "vendor"), join(target, "vendor"));

  const lines = await linkSkills(root, [target], true);
  const linked = join(root, ".agents", "linked");
  assert.deepEqual(lines, [
    `rm ${join(target, "vendor")}`,
    `ln -sfn ${join(root, "skills", "active", "brain-own")} ${join(target, "brain-own")}`,
    `ln -sfn ${join(linked, "brain-tp-extra")} ${join(target, "brain-tp-extra")}`,
    `skip ${join(target, "brain-tp-shared")} (not a brain link)`,
    `skip ${join(target, "brain-tp-vendor")} (not a brain link)`,
  ]);
  assert.equal(await readlink(join(target, "brain-tp-extra")), join(linked, "brain-tp-extra"));
  assert.equal(await readFile(join(linked, "brain-tp-extra", "SKILL.md"), "utf8"), "---\nname: brain-tp-extra\n---\nbody\n");
  assert.equal((await lstat(join(target, "brain-tp-vendor"))).isDirectory(), true);
  assert.equal(await readlink(join(target, "brain-tp-shared")), other);
});

test("TestLinkWritesAgentSkills", async (t) => {
  const { parent, root } = await tempRoot(t);
  await mkdir(join(root, "agents"), { recursive: true });
  await mkdir(join(root, "templates"), { recursive: true });
  await writeFile(join(root, "agents", "brain-x.md"), '---\nname: brain-x\ndescription: "Does x."\n---\nSteps\n');
  await writeFile(join(root, "templates", "agent-skill.md"), "---\nname: {{name}}\ndescription: {{description}}\n---\nRun {{name}}.\n");
  await mkdir(join(root, ".agents", "linked", "opencode-agents"), { recursive: true });
  const target = join(parent, "target");

  await linkSkills(root, [target], true);
  const linked = join(root, ".agents", "linked", "brain-x");
  assert.equal(await readlink(join(target, "brain-x")), linked);
  assert.equal(await readFile(join(linked, "SKILL.md"), "utf8"), '---\nname: brain-x\ndescription: "Does x."\n---\nRun brain-x.\n');
  // The OpenCode copies stay for the links that point at them.
  assert.equal((await lstat(join(root, ".agents", "linked", "opencode-agents"))).isDirectory(), true);
});

test("TestAcceptNeedsPrefix", async (t) => {
  const { root } = await tempRoot(t);
  await assert.rejects(acceptSkill(root, "demo"), (err) => err.code === "BAD_NAME");
  await assert.rejects(acceptSkill(root, "brain-tp-demo"), (err) => err.code === "BAD_NAME");
});
