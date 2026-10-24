import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("TestLayoutKeepsScreenshots", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "brain-layout-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const shots = join(root, "memory", "sessions", "screenshots");
  await mkdir(shots, { recursive: true });
  await mkdir(join(root, "scripts"));
  const script = join(root, "scripts", "check-layout.sh");
  await copyFile(fileURLToPath(new URL("./check-layout.sh", import.meta.url)), script);
  await writeFile(join(root, "AGENTS.md"), "Premises are rules. Skills are workflows. Engram is the session log.\n");
  await writeFile(join(root, ".gitignore"), "memory/sessions/screenshots/*\n");
  await writeFile(join(shots, "shot.png"), "existing screenshot");
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
  git("init", "-q");
  git("remote", "add", "origin", "https://example.invalid/personal/brain.git");

  execFileSync("bash", [script], { stdio: "pipe" });

  assert.equal(await readFile(join(shots, "shot.png"), "utf8"), "existing screenshot");
  assert.deepEqual(await readdir(shots), ["shot.png"]);
});

test("TestGitKeepsRulesAndSkipsCaptures", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "brain-memory-git-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await copyFile(fileURLToPath(new URL("../.gitignore", import.meta.url)), join(root, ".gitignore"));
  const shared = [
    "memory/premises/global-rule.md",
    "memory/premises/personal-rule.md",
    "memory/premises/work-rule.md",
    "memory/premises/candidate.md",
    "memory/premises/.gitkeep",
    "memory/decisions/.gitkeep",
    "memory/dropped/.gitkeep",
    "memory/patterns/.gitkeep",
    "memory/sessions/.gitkeep",
    "memory/sessions/screenshots/.gitkeep",
  ];
  const local = [
    "memory/decisions/capture.md",
    "memory/dropped/old-rule.md",
    "memory/patterns/draft.md",
    "memory/sessions/review.md",
    "memory/sessions/screenshots/shot.png",
    "memory/sessions/screenshots/nested/shot.png",
    "memory/workspace/audit.md",
    "memory/splits/plan.md",
    "memory/future/nested/note.md",
    "memory/note.md",
  ];
  for (const path of [...shared, ...local]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), path);
  }
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git("init", "-q");
  git("add", "memory");

  assert.deepEqual(git("ls-files", "-z", "memory").split("\0").filter(Boolean).sort(), shared.sort());
  for (const path of local) {
    assert.equal(await readFile(join(root, path), "utf8"), path);
  }
});
