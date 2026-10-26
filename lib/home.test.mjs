import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { run } from "../bin/brain.mjs";
import { loadFlows } from "./flows.mjs";
import { homeStarters, migrateHome } from "./home.mjs";
import { brainHome } from "./premise.mjs";
import { acceptSkill, linkSkills } from "./skills.mjs";

// oxlint-disable-next-line typescript/strict-void-return -- promisify drops the ChildProcess that execFile returns.
const execFileAsync = promisify(execFile);

function useEnv(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) {
        delete process.env[key];
        return;
      }
      process.env[key] = previous;
    });
  }
}

async function tempDir(t, name) {
  const dir = await mkdtemp(join(tmpdir(), `brain-${name}-`));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function invoke(args) {
  let stdout = "";
  let stderr = "";
  const code = await run(args, { write: (chunk) => (stdout += chunk) }, { write: (chunk) => (stderr += chunk) });
  return { code, stdout, stderr };
}

async function writeSkill(dir, name) {
  await mkdir(join(dir, name), { recursive: true });
  await writeFile(join(dir, name, "SKILL.md"), `---\nname: ${name}\ndescription: test\n---\n`);
}

test("TestBrainHomeReadsEnvOrDefault", (t) => {
  useEnv(t, { BRAIN_HOME: "/tmp/some-home" });
  assert.equal(brainHome(), "/tmp/some-home");
  delete process.env.BRAIN_HOME;
  assert.equal(brainHome(), join(homedir(), ".local", "share", "agent-brain", "home"));
});

test("TestCLIReadsPremisesAndConfigFromHome", async (t) => {
  const root = await tempDir(t, "root");
  const home = await tempDir(t, "home");
  useEnv(t, { BRAIN_ROOT: root, BRAIN_HOME: home });
  // A premise and a config in the root must not apply: data lives in the home.
  await mkdir(join(root, "memory", "premises"), { recursive: true });
  await writeFile(
    join(root, "memory", "premises", "root-rule.md"),
    '---\nid: root-rule\ntext: "Root rule."\nstrength: always\nscope: "*"\nrepos:\n  - "*"\nstatus: active\n---\n',
  );
  await writeFile(join(home, "brain.config.json"), JSON.stringify({ scopes: { work: { roots: [home] } } }));

  const added = await invoke(["premise", "add", "Home rule.", "--strength", "never", "--scope", "work", "--repo", "*"]);
  assert.equal(added.code, 0, added.stderr);
  assert.ok((await readFile(join(home, "memory", "premises", "home-rule.md"), "utf8")).includes("Home rule."));

  const listed = await invoke(["premise", "list"]);
  assert.match(listed.stdout, /^home-rule\twork\tnever\tHome rule\.$/mu);
  assert.doesNotMatch(listed.stdout, /root-rule/u);

  const printed = await invoke(["home"]);
  assert.equal(printed.stdout, `${home}\n`);
});

test("TestHomeFlowsAddToAndReplaceBrainFlows", async (t) => {
  const root = await tempDir(t, "root");
  const home = await tempDir(t, "home");
  await mkdir(join(root, "flows"));
  await mkdir(join(home, "flows"));
  await writeFile(join(root, "flows", "shared.md"), "---\nname: shared\ndescription: brain\n---\nsteps\n");
  await writeFile(join(root, "flows", "brain-only.md"), "---\nname: brain-only\n---\nsteps\n");
  await writeFile(join(home, "flows", "shared.md"), "---\nname: shared\ndescription: home\n---\nsteps\n");
  await writeFile(join(home, "flows", "home-only.md"), "---\nname: home-only\n---\nsteps\n");

  const flows = await loadFlows(root, home);

  assert.deepEqual(
    flows.map((flow) => [flow.name, flow.file]),
    [
      ["brain-only", join(root, "flows", "brain-only.md")],
      ["home-only", join(home, "flows", "home-only.md")],
      ["shared", join(home, "flows", "shared.md")],
    ],
  );
  assert.equal(flows.find((flow) => flow.name === "shared").description, "home");
});

test("TestLinkSkillsAddsHomeSkillsAndBrainWins", async (t) => {
  const root = await tempDir(t, "root");
  const home = await tempDir(t, "home");
  await writeSkill(join(root, "skills", "active"), "brain-shared");
  await writeSkill(join(home, "skills", "active"), "brain-shared");
  await writeSkill(join(home, "skills", "active"), "brain-mine");
  const target = join(root, "target");

  await linkSkills(root, [target], { apply: true, home });

  assert.equal(await readlink(join(target, "brain-mine")), join(home, "skills", "active", "brain-mine"));
  assert.equal(await readlink(join(target, "brain-shared")), join(root, "skills", "active", "brain-shared"));
});

test("TestAcceptSkillMovesAndCommitsInHome", async (t) => {
  const root = await tempDir(t, "root");
  const home = await tempDir(t, "home");
  await execFileAsync("git", ["init", "-q", "-b", "main"], { cwd: home });
  await execFileAsync("git", ["config", "user.email", "brain-test@example.com"], { cwd: home });
  await execFileAsync("git", ["config", "user.name", "brain-test"], { cwd: home });
  await writeSkill(join(home, "skills", "drafts"), "brain-new");
  const target = join(root, "target");
  await mkdir(join(root, "mcp"));
  await writeFile(join(root, "mcp", "link-targets.txt"), `${target}\n`);

  await acceptSkill(root, home, "brain-new");

  assert.ok((await lstat(join(home, "skills", "active", "brain-new", "SKILL.md"))).isFile());
  const { stdout } = await execFileAsync("git", ["log", "--format=%s"], { cwd: home });
  assert.equal(stdout, "skill: accept brain-new\n");
  assert.equal(await readlink(join(target, "brain-new")), join(home, "skills", "active", "brain-new"));
});

function premise(id, status = "active") {
  return `---\nid: ${id}\ntext: "Rule ${id}."\nstrength: always\nscope: "*"\nrepos:\n  - "*"\nstatus: ${status}\n---\n`;
}

async function put(base, files) {
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(join(base, rel, ".."), { recursive: true });
    await writeFile(join(base, rel), text);
  }
}

test("TestMigrateHomeCopiesUserDataAndKeepsUserChanges", async (t) => {
  const root = await tempDir(t, "root");
  const from = await tempDir(t, "old");
  const home = await tempDir(t, "home");
  await put(root, {
    "templates/home/brain.config.json": '{ "scopes": {} }\n',
    "templates/home/memory/premises/starter.md": premise("starter", "candidate"),
    "flows/shipped.md": "---\nname: shipped\n---\n",
    "skills/active/brain-shipped/SKILL.md": "shipped",
  });
  await put(from, {
    "brain.config.json": '{ "scopes": { "work": {} } }\n',
    "memory/premises/mine.md": premise("mine"),
    "memory/premises/starter.md": premise("starter"),
    "memory/sessions/review.md": "local note",
    "dod/repo.md": "- [ ] lint",
    "flows/shipped.md": "old copy of a brain flow",
    "flows/mine.md": "---\nname: mine\n---\n",
    "skills/drafts/brain-draft/SKILL.md": "draft",
    "skills/drafts/example-draft/SKILL.md": "old fixture",
    "skills/active/brain-shipped/SKILL.md": "old copy",
    "skills/active/brain-mine/SKILL.md": "mine",
  });
  // The config is still the template copy. The user changed the starter premise.
  await put(home, {
    "brain.config.json": '{ "scopes": {} }\n',
    "memory/premises/starter.md": premise("starter", "candidate").replace("Rule starter.", "My starter."),
  });

  const plan = await migrateHome(root, home, { from, apply: false });

  assert.deepEqual(plan, [
    "updated brain.config.json",
    "added memory/premises/mine.md",
    "conflict memory/premises/starter.md",
    "added memory/sessions/review.md",
    "added dod/repo.md",
    "added flows/mine.md",
    "added skills/drafts/brain-draft/SKILL.md",
    "added skills/active/brain-mine/SKILL.md",
  ]);
  assert.equal(await readFile(join(home, "brain.config.json"), "utf8"), '{ "scopes": {} }\n');

  useEnv(t, { BRAIN_ROOT: root, BRAIN_HOME: home });
  const applied = await invoke(["home", "migrate", "--from", from, "--apply"]);

  assert.equal(applied.code, 1, "a conflict exits 1");
  assert.match(applied.stderr, /^1 conflicts: /mu);
  assert.match(applied.stdout, /^ok: 2 premises$/mu);
  assert.equal(await readFile(join(home, "brain.config.json"), "utf8"), '{ "scopes": { "work": {} } }\n');
  assert.match(await readFile(join(home, "memory", "premises", "starter.md"), "utf8"), /My starter\./u);
  assert.equal(await readFile(join(home, "flows", "mine.md"), "utf8"), "---\nname: mine\n---\n");
  await assert.rejects(lstat(join(home, "flows", "shipped.md")), { code: "ENOENT" });
  await assert.rejects(lstat(join(home, "skills", "drafts", "example-draft")), { code: "ENOENT" });
});

test("TestHomeStartersSkipsKnownAndDroppedPremises", async (t) => {
  const root = await tempDir(t, "root");
  const home = await tempDir(t, "home");
  const starters = "templates/home/memory/premises";
  await put(root, {
    [`${starters}/kept.md`]: premise("kept", "candidate"),
    [`${starters}/removed.md`]: premise("removed", "candidate"),
    [`${starters}/new.md`]: premise("new", "candidate"),
  });
  await put(home, { "memory/premises/kept.md": premise("kept"), "memory/dropped/removed.md": premise("removed") });

  assert.deepEqual(await homeStarters(root, home, false), ["added memory/premises/new.md"]);
  await assert.rejects(lstat(join(home, "memory", "premises", "new.md")), { code: "ENOENT" });

  await homeStarters(root, home, true);

  assert.equal(await readFile(join(home, "memory", "premises", "new.md"), "utf8"), premise("new", "candidate"));
  assert.equal(await readFile(join(home, "memory", "premises", "kept.md"), "utf8"), premise("kept"));
});

// syncRepos makes a bare origin and a home that pushes to it. clone adds a second machine.
async function syncRepos(t) {
  const origin = await tempDir(t, "origin");
  await execFileAsync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  const home = await tempDir(t, "home");
  await execFileAsync("git", ["init", "-q", "-b", "main"], { cwd: home });
  await execFileAsync("git", ["remote", "add", "origin", origin], { cwd: home });
  await gitUser(home);
  const clone = async () => {
    const dir = await tempDir(t, "clone");
    await execFileAsync("git", ["clone", "-q", origin, dir]);
    await gitUser(dir);
    return dir;
  };
  return { home, clone };
}

async function gitUser(dir) {
  await execFileAsync("git", ["config", "user.email", "brain-test@example.com"], { cwd: dir });
  await execFileAsync("git", ["config", "user.name", "brain-test"], { cwd: dir });
}

async function syncAt(t, home) {
  useEnv(t, { BRAIN_HOME: home });
  return invoke(["home", "sync"]);
}

test("TestHomeSyncPushesAChangeThatASecondClonePulls", async (t) => {
  const { home, clone } = await syncRepos(t);
  await put(home, { "memory/premises/first.md": premise("first") });

  const first = await syncAt(t, home);

  assert.equal(first.code, 0, first.stderr);
  assert.match(first.stdout, /^committed brain: sync from .+\npushed 1 commits to origin\/main\nok: 1 premises\n$/u);
  const other = await clone();
  await put(other, { "memory/premises/second.md": premise("second") });
  assert.equal((await syncAt(t, other)).code, 0);

  const pulled = await syncAt(t, home);

  assert.equal(pulled.code, 0, pulled.stderr);
  assert.equal(pulled.stdout, "pulled 1 commits from origin/main\nup to date with origin/main\nok: 2 premises\n");
  assert.equal(await readFile(join(home, "memory", "premises", "second.md"), "utf8"), premise("second"));
});

test("TestHomeSyncStopsOnAHomeWithNoOrigin", async (t) => {
  const home = await tempDir(t, "home");
  await execFileAsync("git", ["init", "-q", "-b", "main"], { cwd: home });

  const result = await syncAt(t, home);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /the home has no origin\..*\n {2}git -C .+ remote add origin URL\n/u);
});

test("TestHomeSyncStopsOnARebaseConflict", async (t) => {
  const { home, clone } = await syncRepos(t);
  await put(home, { "notes/shared.md": "one\n" });
  await syncAt(t, home);
  const other = await clone();
  await put(other, { "notes/shared.md": "two\n" });
  await syncAt(t, other);
  await put(home, { "notes/shared.md": "three\n" });

  const result = await syncAt(t, home);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /^conflict notes\/shared\.md\n/u);
  assert.match(result.stderr, /git add notes\/shared\.md\n {2}git rebase --continue\n {2}brain home sync\n$/u);
  const again = await syncAt(t, home);
  assert.equal(again.code, 1);
  assert.match(again.stderr, /^conflict notes\/shared\.md\nA rebase of the home is in progress\./u);
});
