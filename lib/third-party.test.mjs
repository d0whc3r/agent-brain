import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { run } from "../bin/brain.mjs";

const agents = ["claude-code", "opencode", "codex"];

function invoke(args) {
  let stdout = "";
  let stderr = "";
  return run(
    args,
    {
      write(chunk) {
        stdout += chunk;
      },
    },
    {
      write(chunk) {
        stderr += chunk;
      },
    },
  ).then((code) => ({ code, stdout, stderr }));
}

function useEnv(t, values) {
  const prev = {};
  for (const key of Object.keys(values)) {
    prev[key] = process.env[key];
    if (values[key] === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = values[key];
  }
  t.after(() => {
    for (const key of Object.keys(prev)) {
      if (prev[key] === undefined) {
        delete process.env[key];
        continue;
      }
      process.env[key] = prev[key];
    }
  });
}

async function tempRoot(t) {
  const root = await mkdtemp(join(tmpdir(), "brain-skills-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeCatalog(root, skills) {
  const dir = join(root, "skills");
  await mkdir(dir, { recursive: true });
  const catalog = { agents, skills };
  const text = `${JSON.stringify(catalog, null, 2)}\n`;
  await writeFile(join(dir, "third-party.json"), text);
  return text;
}

async function writeSkill(root, name) {
  const dir = join(root, ".agents", "skills", name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: test\n---\n`);
}

function fakeScript(log, kind, listJson) {
  return `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(log)}, ${JSON.stringify(kind)} + " " + JSON.stringify(process.argv.slice(2)) + "\\n");
if (${JSON.stringify(kind)} === "skills" && process.argv[2] === "list") {
  process.stdout.write(${JSON.stringify(listJson)});
}
if (${JSON.stringify(kind)} === "npx") {
  process.exit(9);
}
`;
}

async function installFakes(t, root, listJson) {
  const binDir = join(root, "fake-bin");
  await mkdir(binDir);
  const log = join(root, "skills-log.txt");
  await writeFile(log, "");
  const skillsBin = join(binDir, "skills-bin");
  const npxBin = join(binDir, "npx");
  await writeFile(skillsBin, fakeScript(log, "skills", listJson));
  await writeFile(npxBin, fakeScript(log, "npx", listJson));
  await chmod(skillsBin, 0o755);
  await chmod(npxBin, 0o755);
  useEnv(t, { BRAIN_ROOT: root, BRAIN_SKILLS_BIN: skillsBin, PATH: `${binDir}:${process.env.PATH}` });
  return log;
}

async function readLog(log) {
  const text = await readFile(log, "utf8");
  return text;
}

test("third-party", { concurrency: 1 }, async (suite) => {
  await suite.test("TestSkillsListMarksInstalled", async (t) => {
    const root = await tempRoot(t);
    await writeCatalog(root, [
      { name: "alpha-skill", source: "example/skills-a", kinds: ["review"] },
      { name: "beta-skill", source: "example/skills-a", kinds: ["proto", "review"] },
    ]);
    await writeSkill(root, "beta-skill");
    const log = await installFakes(t, root, "[]");

    const result = await invoke(["skills", "list"]);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(
      result.stdout,
      "alpha-skill\texample/skills-a\treview\tmissing\nbeta-skill\texample/skills-a\tproto,review\tinstalled\n",
    );
    const calls = await readLog(log);
    assert.equal(calls, "");
  });

  await suite.test("TestSkillsCheckMissing", async (t) => {
    const root = await tempRoot(t);
    const before = await writeCatalog(root, [
      { name: "alpha-skill", source: "example/skills-a", kinds: ["review"] },
      { name: "beta-skill", source: "example/skills-a", kinds: ["proto", "review"] },
    ]);
    await writeSkill(root, "alpha-skill");
    const log = await installFakes(t, root, "[]");

    const result = await invoke(["skills", "check"]);

    assert.equal(result.code, 1, result.stderr);
    assert.equal(result.stdout, "beta-skill\n");
    const after = await readFile(join(root, "skills", "third-party.json"), "utf8");
    assert.equal(after, before);
    const calls = await readLog(log);
    assert.equal(calls, "");
  });

  await suite.test("TestSkillsCheckNoneMissing", async (t) => {
    const root = await tempRoot(t);
    await writeCatalog(root, [{ name: "gamma-skill", source: "example/skills-b", kinds: ["review"] }]);
    await writeSkill(root, "gamma-skill");
    await installFakes(t, root, "[]");

    const result = await invoke(["skills", "check"]);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "");
  });

  await suite.test("TestSkillsAddWithoutApply", async (t) => {
    const root = await tempRoot(t);
    await writeCatalog(root, [{ name: "alpha-skill", source: "example/skills-a", kinds: ["review"] }]);
    const log = await installFakes(t, root, "[]");

    const result = await invoke([
      "skills",
      "add",
      "owner/repo",
      "--skill",
      "demo-skill",
      "--kind",
      "go",
      "--kind",
      "proto",
    ]);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "npx skills add owner/repo --skill demo-skill -a codex --copy -y\n");
    const catalog = JSON.parse(await readFile(join(root, "skills", "third-party.json"), "utf8"));
    assert.deepEqual(catalog.agents, agents);
    assert.equal(catalog.skills.length, 2);
    assert.deepEqual(catalog.skills[1], { name: "demo-skill", source: "owner/repo", kinds: ["go", "proto"] });
    const calls = await readLog(log);
    assert.equal(calls, "");
  });

  await suite.test("TestSkillsAddApplyRunsBin", async (t) => {
    const root = await tempRoot(t);
    await writeCatalog(root, []);
    const log = await installFakes(t, root, "[]");

    const result = await invoke([
      "skills",
      "add",
      "owner/repo",
      "--skill",
      "demo-skill",
      "--kind",
      "review",
      "--apply",
    ]);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "npx skills add owner/repo --skill demo-skill -a codex --copy -y\n");
    const calls = await readLog(log);
    assert.equal(
      calls,
      `skills ${JSON.stringify(["add", "owner/repo", "--skill", "demo-skill", "-a", "codex", "--copy", "-y"])}\n`,
    );
  });

  await suite.test("TestSkillsAddApplyFailureKeepsCatalog", async (t) => {
    const root = await tempRoot(t);
    const before = await writeCatalog(root, [{ name: "alpha-skill", source: "example/skills-a", kinds: ["review"] }]);
    const binDir = join(root, "fake-bin");
    await mkdir(binDir);
    const log = join(root, "skills-log.txt");
    await writeFile(log, "");
    const skillsBin = join(binDir, "skills-bin");
    await writeFile(
      skillsBin,
      `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(log)}, "skills " + JSON.stringify(process.argv.slice(2)) + "\\n");
process.stderr.write("install failed\\n");
process.exit(3);
`,
    );
    await chmod(skillsBin, 0o755);
    useEnv(t, { BRAIN_ROOT: root, BRAIN_SKILLS_BIN: skillsBin });

    const result = await invoke([
      "skills",
      "add",
      "owner/repo",
      "--skill",
      "demo-skill",
      "--kind",
      "review",
      "--apply",
    ]);

    assert.equal(result.code, 3, result.stderr);
    const after = await readFile(join(root, "skills", "third-party.json"), "utf8");
    assert.equal(after, before);
    const calls = await readLog(log);
    assert.equal(calls.includes('"add"'), true);
  });

  await suite.test("TestSkillsUpdatePrintsCommand", async (t) => {
    const root = await tempRoot(t);
    const log = await installFakes(t, root, "[]");

    const result = await invoke(["skills", "update"]);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "npx skills update -p -y\n");
    const calls = await readLog(log);
    assert.equal(calls, "");
  });

  await suite.test("TestSkillsUpdateApplyRunsBin", async (t) => {
    const root = await tempRoot(t);
    const log = await installFakes(t, root, "[]");

    const result = await invoke(["skills", "update", "--apply"]);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "");
    const calls = await readLog(log);
    assert.equal(calls, `skills ${JSON.stringify(["update", "-p", "-y"])}\n`);
    assert.equal(calls.includes("npx "), false);
  });

  await suite.test("TestSkillsRemoveDropsRow", async (t) => {
    const root = await tempRoot(t);
    await writeCatalog(root, [
      { name: "alpha-skill", source: "example/skills-a", kinds: ["review"] },
      { name: "gamma-skill", source: "example/skills-b", kinds: ["review"] },
    ]);
    const log = await installFakes(t, root, "[]");

    const result = await invoke(["skills", "remove", "alpha-skill"]);

    assert.equal(result.code, 0, result.stderr);
    const catalog = JSON.parse(await readFile(join(root, "skills", "third-party.json"), "utf8"));
    assert.deepEqual(catalog.skills, [{ name: "gamma-skill", source: "example/skills-b", kinds: ["review"] }]);
    const calls = await readLog(log);
    assert.equal(calls, "");
  });

  await suite.test("TestSkillsRemoveMissingWritesStderr", async (t) => {
    const root = await tempRoot(t);
    await writeCatalog(root, [{ name: "gamma-skill", source: "example/skills-b", kinds: ["review"] }]);
    await installFakes(t, root, "[]");

    const result = await invoke(["skills", "remove", "not-there"]);

    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, 'skill "not-there" not found\n');
  });

  await suite.test("TestSkillsRemoveApplyRunsBin", async (t) => {
    const root = await tempRoot(t);
    await writeCatalog(root, [{ name: "gamma-skill", source: "example/skills-b", kinds: ["review"] }]);
    const log = await installFakes(t, root, "[]");

    const result = await invoke(["skills", "remove", "gamma-skill", "--apply"]);

    assert.equal(result.code, 0, result.stderr);
    const catalog = JSON.parse(await readFile(join(root, "skills", "third-party.json"), "utf8"));
    assert.deepEqual(catalog.skills, []);
    const calls = await readLog(log);
    assert.equal(calls, `skills ${JSON.stringify(["remove", "gamma-skill", "-p", "-y"])}\n`);
  });
});
