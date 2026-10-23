import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
