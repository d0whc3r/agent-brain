import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { run } from "../bin/brain.mjs";

const agents = ["claude-code", "opencode", "codex"];

const seedRows = [
  ["using-agent-skills", "addyosmani/agent-skills", "review"],
  ["api-and-interface-design", "addyosmani/agent-skills", "proto,review"],
  ["deprecation-and-migration", "addyosmani/agent-skills", "go,python"],
  ["observability-and-instrumentation", "addyosmani/agent-skills", "go"],
  ["doubt-driven-development", "addyosmani/agent-skills", "review"],
  ["golang-code-style", "samber/cc-skills-golang", "go"],
  ["golang-error-handling", "samber/cc-skills-golang", "go"],
  ["golang-testing", "samber/cc-skills-golang", "go"],
  ["golang-safety", "samber/cc-skills-golang", "go"],
  ["golang-grpc", "samber/cc-skills-golang", "go,proto"],
  ["golang-performance", "samber/cc-skills-golang", "go"],
  ["golang-observability", "samber/cc-skills-golang", "go"],
  ["vercel-react-best-practices", "vercel-labs/agent-skills", "ui"],
  ["vercel-composition-patterns", "vercel-labs/agent-skills", "ui"],
  ["retro", "mattpocock/skills", "review"],
  ["diagnosing-bugs", "mattpocock/skills", "review"],
  ["handoff", "mattpocock/skills", "review"],
];

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
  useEnv(t, {
    BRAIN_ROOT: root,
    BRAIN_SKILLS_BIN: skillsBin,
    PATH: `${binDir}:${process.env.PATH}`,
  });
  return log;
}

async function readLog(log) {
  const text = await readFile(log, "utf8");
  return text;
}

test("third-party", { concurrency: 1 }, async (t) => {
  await t.test("TestSkillsListMarksInstalled", async (t) => {
    const root = await tempRoot(t);
    await writeCatalog(root, [
      { name: "using-agent-skills", source: "addyosmani/agent-skills", flows: ["review"] },
      { name: "api-and-interface-design", source: "addyosmani/agent-skills", flows: ["proto", "review"] },
    ]);
    const log = await installFakes(t, root, JSON.stringify([
      { name: "api-and-interface-design", source: "addyosmani/agent-skills" },
    ]));

    const result = await invoke(["skills", "list"]);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(
      result.stdout,
      "using-agent-skills\taddyosmani/agent-skills\treview\tmissing\n" +
        "api-and-interface-design\taddyosmani/agent-skills\tproto,review\tinstalled\n",
    );
    const calls = await readLog(log);
    assert.equal(calls, `skills ${JSON.stringify(["list", "-g", "--json"])}\n`);
  });

  await t.test("TestSkillsCheckMissing", async (t) => {
    const root = await tempRoot(t);
    const before = await writeCatalog(root, [
      { name: "using-agent-skills", source: "addyosmani/agent-skills", flows: ["review"] },
      { name: "api-and-interface-design", source: "addyosmani/agent-skills", flows: ["proto", "review"] },
    ]);
    const log = await installFakes(t, root, JSON.stringify([
      { name: "using-agent-skills", source: "addyosmani/agent-skills" },
    ]));

    const result = await invoke(["skills", "check"]);

    assert.equal(result.code, 1, result.stderr);
    assert.equal(result.stdout, "api-and-interface-design\n");
    const after = await readFile(join(root, "skills", "third-party.json"), "utf8");
    assert.equal(after, before);
    const calls = await readLog(log);
    assert.equal(calls, `skills ${JSON.stringify(["list", "-g", "--json"])}\n`);
  });

  await t.test("TestSkillsCheckNoneMissing", async (t) => {
    const root = await tempRoot(t);
    await writeCatalog(root, [
      { name: "retro", source: "mattpocock/skills", flows: ["review"] },
    ]);
    await installFakes(t, root, JSON.stringify([
      { name: "retro", source: "mattpocock/skills" },
    ]));

    const result = await invoke(["skills", "check"]);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "");
  });

  await t.test("TestSkillsAddWithoutApply", async (t) => {
    const root = await tempRoot(t);
    await writeCatalog(root, [
      { name: "using-agent-skills", source: "addyosmani/agent-skills", flows: ["review"] },
    ]);
    const log = await installFakes(t, root, "[]");

    const result = await invoke([
      "skills",
      "add",
      "owner/repo",
      "--skill",
      "demo-skill",
      "--flow",
      "go",
      "--flow",
      "proto",
    ]);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(
      result.stdout,
      "npx skills add owner/repo --skill demo-skill -g -y -a claude-code -a opencode -a codex\n",
    );
    const catalog = JSON.parse(await readFile(join(root, "skills", "third-party.json"), "utf8"));
    assert.deepEqual(catalog.agents, agents);
    assert.equal(catalog.skills.length, 2);
    assert.deepEqual(catalog.skills[1], {
      name: "demo-skill",
      source: "owner/repo",
      flows: ["go", "proto"],
    });
    const calls = await readLog(log);
    assert.equal(calls, "");
  });

  await t.test("TestSkillsAddApplyRunsBin", async (t) => {
    const root = await tempRoot(t);
    await writeCatalog(root, []);
    const log = await installFakes(t, root, "[]");

    const result = await invoke([
      "skills",
      "add",
      "owner/repo",
      "--skill",
      "demo-skill",
      "--flow",
      "review",
      "--apply",
    ]);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(
      result.stdout,
      "npx skills add owner/repo --skill demo-skill -g -y -a claude-code -a opencode -a codex\n",
    );
    const calls = await readLog(log);
    assert.equal(
      calls,
      `skills ${JSON.stringify(["add", "owner/repo", "--skill", "demo-skill", "-g", "-y", "-a", "claude-code", "-a", "opencode", "-a", "codex"])}\n`,
    );
  });

  await t.test("TestSkillsAddApplyFailureKeepsCatalog", async (t) => {
    const root = await tempRoot(t);
    const before = await writeCatalog(root, [
      { name: "using-agent-skills", source: "addyosmani/agent-skills", flows: ["review"] },
    ]);
    const binDir = join(root, "fake-bin");
    await mkdir(binDir);
    const log = join(root, "skills-log.txt");
    await writeFile(log, "");
    const skillsBin = join(binDir, "skills-bin");
    await writeFile(skillsBin, `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(log)}, "skills " + JSON.stringify(process.argv.slice(2)) + "\\n");
process.stderr.write("install failed\\n");
process.exit(3);
`);
    await chmod(skillsBin, 0o755);
    useEnv(t, {
      BRAIN_ROOT: root,
      BRAIN_SKILLS_BIN: skillsBin,
    });

    const result = await invoke([
      "skills",
      "add",
      "owner/repo",
      "--skill",
      "demo-skill",
      "--flow",
      "review",
      "--apply",
    ]);

    assert.equal(result.code, 3, result.stderr);
    const after = await readFile(join(root, "skills", "third-party.json"), "utf8");
    assert.equal(after, before);
    const calls = await readLog(log);
    assert.equal(calls.includes('"add"'), true);
  });

  await t.test("TestSkillsUpdatePrintsCommand", async (t) => {
    const root = await tempRoot(t);
    const log = await installFakes(t, root, "[]");

    const result = await invoke(["skills", "update"]);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "npx skills update -g -y\n");
    const calls = await readLog(log);
    assert.equal(calls, "");
  });

  await t.test("TestSkillsUpdateApplyRunsBin", async (t) => {
    const root = await tempRoot(t);
    const log = await installFakes(t, root, "[]");

    const result = await invoke(["skills", "update", "--apply"]);

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "");
    const calls = await readLog(log);
    assert.equal(calls, `skills ${JSON.stringify(["update", "-g", "-y"])}\n`);
    assert.equal(calls.includes("npx "), false);
  });

  await t.test("TestSkillsRemoveDropsRow", async (t) => {
    const root = await tempRoot(t);
    await writeCatalog(root, [
      { name: "using-agent-skills", source: "addyosmani/agent-skills", flows: ["review"] },
      { name: "retro", source: "mattpocock/skills", flows: ["review"] },
    ]);
    const log = await installFakes(t, root, "[]");

    const result = await invoke(["skills", "remove", "using-agent-skills"]);

    assert.equal(result.code, 0, result.stderr);
    const catalog = JSON.parse(await readFile(join(root, "skills", "third-party.json"), "utf8"));
    assert.deepEqual(catalog.skills, [
      { name: "retro", source: "mattpocock/skills", flows: ["review"] },
    ]);
    const calls = await readLog(log);
    assert.equal(calls, "");
  });

  await t.test("TestSkillsRemoveApplyRunsBin", async (t) => {
    const root = await tempRoot(t);
    await writeCatalog(root, [
      { name: "retro", source: "mattpocock/skills", flows: ["review"] },
    ]);
    const log = await installFakes(t, root, "[]");

    const result = await invoke(["skills", "remove", "retro", "--apply"]);

    assert.equal(result.code, 0, result.stderr);
    const catalog = JSON.parse(await readFile(join(root, "skills", "third-party.json"), "utf8"));
    assert.deepEqual(catalog.skills, []);
    const calls = await readLog(log);
    assert.equal(
      calls,
      `skills ${JSON.stringify(["remove", "retro", "-g", "-y", "-a", "claude-code", "-a", "opencode", "-a", "codex"])}\n`,
    );
  });

  await t.test("TestSkillsSeedListsRequiredNames", async (t) => {
    const repo = fileURLToPath(new URL("..", import.meta.url));
    const root = await tempRoot(t);
    const log = await installFakes(t, root, "[]");
    // The fake bin stays in the temp dir. The catalog is the repo file.
    useEnv(t, { BRAIN_ROOT: repo, BRAIN_SKILLS_BIN: process.env.BRAIN_SKILLS_BIN });

    const result = await invoke(["skills", "list"]);

    assert.equal(result.code, 0, result.stderr);
    const want = seedRows.map((row) => `${row[0]}\t${row[1]}\t${row[2]}\tmissing\n`).join("");
    assert.equal(result.stdout, want);
    const calls = await readLog(log);
    assert.equal(calls.includes("npx "), false);
  });
});
