import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { run } from "../bin/brain.mjs";
import { dodPath, lintDod, newDod, parseDod, runDod, treeFingerprint } from "./dod.mjs";

const brain = fileURLToPath(new URL("..", import.meta.url));
const vagueOutcome = "line 1: outcome is vague: name a subject and the behavior you can observe";

const good = `# DoD: backups

- [ ] Toggle off pauses the schedule
  - check: \`pnpm vitest run src/backups --run\`
  - pass: exit 0, "pauses schedule"
- [ ] The paused toggle is visible on the backups page
  - check: manual: chrome-devtools, open /backups as the test user
  - pass: toggle shows "Paused", console has 0 errors
`;

function one(outcome, check = "`npm test`", pass = "exit 0") {
  return `- [ ] ${outcome}\n  - check: ${check}\n  - pass: ${pass}\n`;
}

async function gitRepo(t) {
  const dir = await mkdtemp(join(tmpdir(), "brain-dod-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", ["-C", dir, "-c", "user.email=t@example.com", "-c", "user.name=t", ...args], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  await writeFile(join(dir, "a.txt"), "a\n");
  git("add", ".");
  git("commit", "-q", "-m", "init");
  return { dir, git };
}

test("TestLintAcceptsConcreteCriteria", () => {
  assert.deepEqual(lintDod(good), []);
  for (const outcome of ["All 3 backups show the status OK", "Deleting a cluster marks all its backups as done"]) {
    assert.deepEqual(lintDod(one(outcome, "`npm test`", "exit 0, all 12 tests ok")), [], outcome);
  }
});

test("TestLintRejectsVagueClaims", () => {
  const claims = [
    "Everything works fine",
    "Everything is done",
    "Everything is working",
    "Everything is finished",
    "Todo funciona",
    "Todo está terminado",
    "Que todo funcione",
    "Que todo esté hecho",
    "All tests pass",
    "The feature works as expected",
  ];
  for (const claim of claims) {
    assert.ok(lintDod(one(claim)).includes(vagueOutcome), claim);
  }
});

test("TestLintRejectsVagueCriteria", () => {
  const problems = lintDod(`- [ ] Todo funciona
  - pass: funciona bien
- [ ] The API answers the list call
  - check: run the tests
  - pass: exit 0
- [ ] The page shows the new toggle
  - check: manual: open the page and look
  - pass: it works
- [ ] The tests of the backups module pass
  - check: \`pnpm test\`
  - pass: "ok"
`);
  assert.deepEqual(problems, [
    "line 1: outcome is vague: name a subject and the behavior you can observe",
    "line 1: no check: add check: `<command>` or check: manual: <tool and target>",
    "line 1: pass condition is vague: name an exit code, a number, or quoted text",
    "line 3: check must be one command in backticks, or start with manual:",
    "line 6: manual check names no target: add the URL, page path, or endpoint",
    "line 6: pass condition is vague: name an exit code, a number, or quoted text",
    "line 9: a command check needs exit N in pass",
  ]);
  assert.deepEqual(lintDod("# DoD\n\nNothing yet.\n"), ["no criteria: add one line per outcome as - [ ] <outcome>"]);
});

test("TestLintRejectsChecksThatCannotFail", () => {
  for (const check of ["`true`", "`npm test || true`", "`echo ok`", "`exit 0`"]) {
    assert.ok(lintDod(one("The backup list shows 3 rows", check)).includes("line 1: check cannot fail: run the test or the tool that proves the outcome"), check);
  }
  assert.ok(lintDod(one("The backup list shows 3 rows", "`git commit -am wip && npm test`")).includes("line 1: a check must not commit, push, reset, clean, or delete a branch"));
  assert.ok(lintDod(one("The page shows the toggle", "manual: open the app and/or look", "toggle shows \"Paused\"")).includes("line 1: manual check names no target: add the URL, page path, or endpoint"));
});

test("TestParserKeepsEachCriterion", () => {
  const text = `- [ ] The list call returns the backups
  - check: \`npm test -- list\`
  - pass: exit 0
- [X] The delete call removes the backup
  - check: \`npm test -- delete\`
  - pass: exit 0
* [ ] The create call stores the backup
  - check: \`npm test -- create\`
  - pass: exit 0
`;
  const criteria = parseDod(text);
  assert.deepEqual(criteria.map((c) => [c.check, c.done]), [["`npm test -- list`", false], ["`npm test -- delete`", true], ["`npm test -- create`", false]]);

  const orphan = `${one("The list call returns the backups")}\nNotes for later.\n  - check: \`echo hi\`\n`;
  assert.equal(parseDod(orphan)[0].check, "`npm test`");
  assert.ok(lintDod(orphan).includes("line 6: check has no criterion: start the criterion with - [ ] <outcome>"));
  assert.ok(lintDod(`${one("The list call returns the backups")}  - check: \`npm run other\`\n`).includes("line 4: second check in one criterion"));
});

test("TestLintKeepsStandingCriteria", () => {
  const standing = parseDod("- [ ] The project check passes\n  - check: `npm run check`\n  - pass: exit 0\n");
  assert.deepEqual(lintDod(good, { standing }), ["standing criterion missing: The project check passes (`npm run check`)"]);
});

test("TestNewDodNeedsPlaceholdersFilled", async () => {
  const template = await readFile(join(brain, "templates", "dod.md"), "utf8");
  const standing = await readFile(join(brain, "dod", "qdrant-review-brain.md"), "utf8");
  const text = newDod(template, "SVL-1", standing);
  assert.match(text, /^# DoD: SVL-1\n/);
  assert.deepEqual(parseDod(text).map((c) => c.check).at(-1), "`npm run check`");
  assert.ok(lintDod(text).some((p) => p.includes("fill the placeholder")));
  assert.ok(lintDod(newDod(template, "x", "")).some((p) => p.startsWith("line 16: fill the placeholder")));
});

test("TestStandingFilesPassLint", async () => {
  for (const name of await readdir(join(brain, "dod"))) {
    const text = await readFile(join(brain, "dod", name), "utf8");
    assert.deepEqual(lintDod(text), [], name);
    assert.ok(parseDod(text).length > 0, name);
  }
});

test("TestRunWritesFreshEvidence", async (t) => {
  const { dir } = await gitRepo(t);
  const text = `# DoD: run

- [ ] The script prints the expected word
  - check: \`node -e "console.log('pauses schedule')"\`
  - pass: exit 0, "pauses schedule"
- [ ] The failing script reports an exit code
  - check: \`node -e "process.exit(3)"\`
  - pass: exit 0
  - evidence: old
- [ ] The script exits with the expected code
  - check: \`node -e "process.exit(3)"\`
  - pass: exit 3
- [ ] The page shows the toggle after the run
  - check: manual: chrome-devtools, open /backups
  - pass: toggle shows "Paused"
`;
  const result = runDod(text, dir, new Date("2026-10-24T10:00:00Z"));
  const tree = treeFingerprint(dir);
  assert.equal(result.stable, true);
  assert.equal(result.tree, tree);
  const [ok, failed, three, manual] = parseDod(result.text);
  assert.equal(ok.done, true);
  assert.match(ok.evidence, new RegExp(`^ran 2026-10-24T10:00:00.000Z tree ${tree} crit [0-9a-f]{8} exit 0; found "pauses schedule"$`));
  assert.equal(failed.done, false);
  assert.match(failed.evidence, / exit 3$/);
  assert.equal(three.done, true);
  assert.equal(manual.evidence, "");
  assert.deepEqual(lintDod(result.text, { done: true, tree }), [
    "line 7: not checked: the criterion has no passing evidence",
    "line 7: evidence shows a failed run",
    "line 15: not checked: the criterion has no passing evidence",
    "line 15: no evidence",
  ]);

  const seen = result.text.replace("- [ ] The page shows", "- [x] The page shows");
  const fresh = seen.replace(`  - pass: toggle shows "Paused"`, `  - pass: toggle shows "Paused"\n  - evidence: screenshot /tmp/shot.png shows "Paused", tree ${tree}`);
  assert.ok(!lintDod(fresh, { done: true, tree }).some((p) => p.startsWith("line 15")));
  const noTree = seen.replace(`  - pass: toggle shows "Paused"`, `  - pass: toggle shows "Paused"\n  - evidence: screenshot /tmp/shot.png shows "Paused"`);
  assert.ok(lintDod(noTree, { done: true, tree }).includes("line 15: manual evidence has no current tree: check again, and write the tree line of brain dod run"));
  const dated = seen.replace(`  - pass: toggle shows "Paused"`, "  - pass: toggle shows \"Paused\"\n  - evidence: done 2026-10-24");
  assert.ok(lintDod(dated, { done: true, tree }).includes("line 15: manual evidence is vague: name what you saw, with a path, a number, or quoted text"));

  const edited = result.text.replace("console.log('pauses schedule')", "console.log('pauses schedule again')");
  assert.ok(lintDod(edited, { done: true, tree }).includes("line 3: evidence is stale: the check or the pass condition changed after the run. Run brain dod run again"));
  await writeFile(join(dir, "a.txt"), "changed\n");
  assert.ok(lintDod(result.text, { done: true, tree: treeFingerprint(dir) }).includes("line 3: evidence is stale: the code changed after the run. Run brain dod run again"));
});

test("TestRunRefusesGuardedChecks", async (t) => {
  const { dir, git } = await gitRepo(t);
  const result = runDod(one("The commit check never runs", "`git commit -q --allow-empty -m x`"), dir);
  assert.equal(result.results[0].status, "refused");
  assert.equal(result.results[0].ok, false);
  assert.equal(git("rev-list", "--count", "HEAD").trim(), "1");
});

test("TestRunNeedsAStableTree", async (t) => {
  const { dir } = await gitRepo(t);
  const text = one("The formatter writes the file", "`node -e \"require('fs').writeFileSync('b.txt', '1')\"`");
  const first = runDod(text, dir);
  assert.equal(first.stable, false);
  assert.equal(parseDod(first.text)[0].done, false);
  assert.match(parseDod(first.text)[0].evidence, /the checks changed the tree$/);
  const second = runDod(first.text, dir);
  assert.equal(second.stable, true);
  assert.equal(parseDod(second.text)[0].done, true);
});

test("TestFingerprintIgnoresTheIndex", async (t) => {
  const { dir, git } = await gitRepo(t);
  await writeFile(join(dir, "new.txt"), "new\n");
  const before = treeFingerprint(dir);
  git("add", "-N", ".");
  assert.equal(treeFingerprint(dir), before);
  await writeFile(join(dir, "new.txt"), "edited\n");
  assert.notEqual(treeFingerprint(dir), before);
});

test("TestFingerprintSeesADeleteAfterARename", async (t) => {
  const { dir, git } = await gitRepo(t);
  await writeFile(join(dir, "b.txt"), "a\n");
  git("add", "b.txt");
  const before = treeFingerprint(dir);
  git("rm", "-q", "a.txt");
  assert.notEqual(treeFingerprint(dir), before);
});

test("TestDodPathFollowsTheBranch", async (t) => {
  const { dir, git } = await gitRepo(t);
  assert.match(dodPath(dir), /\.git\/brain-dod\/main\.md$/);
  git("checkout", "-q", "-b", "feat/josep/SVL-1_toggle");
  assert.match(dodPath(dir), /\.git\/brain-dod\/feat\/josep\/SVL-1_toggle\.md$/);
});

test("TestCLIDodInitLintRun", async (t) => {
  const { dir } = await gitRepo(t);
  const out = { text: "", write(chunk) { this.text += chunk; } };
  const err = { text: "", write(chunk) { this.text += chunk; } };
  assert.equal(await run(["dod", "init", "--cwd", dir, "--title", "SVL-1"], out, err), 0);
  assert.equal(await run(["dod", "init", "--cwd", dir], out, err), 1);
  assert.match(err.text, /a DoD exists/);
  assert.equal(await run(["dod", "init", "--cwd", dir, "--title", "SVL-2", "--replace"], out, err), 0);
  assert.match(await readFile(dodPath(dir), "utf8"), /^# DoD: SVL-2\n/);
  assert.equal(await run(["dod", "lint", "--cwd", dir, "other.md"], out, err), 1);
  out.text = "";
  assert.equal(await run(["dod", "lint", "--cwd", dir], out, err), 1);
  assert.match(out.text, /fill the placeholder/);

  await writeFile(dodPath(dir), `# DoD: SVL-2\n\n${one("The script prints the expected word", "`node -e \"console.log('hello')\"`", "exit 0, \"hello\"")}`);
  out.text = "";
  assert.equal(await run(["dod", "run", "--cwd", dir], out, err), 0);
  assert.match(out.text, /^tree [0-9a-f]{12}\npass\texit 0\tThe script prints the expected word\n$/);
  out.text = "";
  assert.equal(await run(["dod", "lint", "--cwd", dir, "--done"], out, err), 0);
  assert.equal(out.text, `ok: 1 criteria, each with evidence for tree ${treeFingerprint(dir)}\n`);
});
