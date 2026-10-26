import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { syncHome } from "../lib/home.mjs";
import { formatContext, formatProblems, pullHome } from "./session-premises.mjs";

// oxlint-disable-next-line typescript/strict-void-return -- promisify drops the ChildProcess that execFile returns.
const execFileAsync = promisify(execFile);

test("TestFormatContext", () => {
  const premise = { id: "rule-a", text: "Rule A.", strength: "never", scope: "*" };
  const scoped = formatContext({ repo: "repo-a", scope: "work" }, [premise], [{ name: "review-diff" }]);
  assert.equal(
    scoped,
    "Brain: repo repo-a, scope work.\nApply every always and never premise. Quote each one you apply.\n- [never] Rule A. (rule-a, scope *)\nRun brain premise show ID or call premise_get for the reason and the exceptions of a premise.\nFlows that match this repo state: review-diff. The brain-next skill runs them.\n",
  );
  assert.equal(
    formatContext({ repo: "clone", scope: "" }, [], []),
    "Brain: repo clone, no scope, so only global premises apply.\n",
  );
});

test("TestFormatProblems", () => {
  assert.equal(formatProblems([]), "");
  assert.equal(
    formatProblems([
      { file: "a.md", reason: "bad status" },
      { file: "b.md", reason: "no repos" },
    ]),
    "Premise files not applied because they are invalid: a.md (bad status); b.md (no repos). Tell the user; brain premise check lists them.\n",
  );
});

// syncNote writes a note in the repo at dir and syncs it to origin as a machine of the user.
async function syncNote(dir, name) {
  await execFileAsync("git", ["config", "user.email", "brain-test@example.com"], { cwd: dir });
  await execFileAsync("git", ["config", "user.name", "brain-test"], { cwd: dir });
  await writeFile(join(dir, name), "note\n");
  syncHome(dir, () => {});
}

test("TestPullHomeFastForwardsTheHome", async (t) => {
  const base = await mkdtemp(join(tmpdir(), "brain-pull-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const [origin, home, other] = ["origin", "home", "other"].map((name) => join(base, name));
  await execFileAsync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  await execFileAsync("git", ["init", "-q", "-b", "main", home]);
  await execFileAsync("git", ["remote", "add", "origin", origin], { cwd: home });
  await syncNote(home, "first.md");
  await execFileAsync("git", ["clone", "-q", origin, other]);
  await syncNote(other, "second.md");

  const [code] = await once(pullHome(home), "exit");

  assert.equal(code, 0);
  assert.equal(await readFile(join(home, "second.md"), "utf8"), "note\n");
});
