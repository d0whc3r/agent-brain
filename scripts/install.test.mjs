import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ifMissing } from "../lib/io.mjs";

// These tests run install.sh and uninstall.sh in a copy of the repo, with an empty HOME and
// stub tools on PATH, so they never touch the real checkout or the real home directory.

const repo = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/u, "");
// The copy skips what is large or generated. node_modules comes back as a link.
const notCopied = new Set(["node_modules", ".git", ".agents/linked", "memory/sessions"]);
const installSteps = 13;
const uninstallSteps = 10;
const servers = ["brain-premises", "chrome-devtools"];

// A stub writes its name and arguments to STUB_LOG. It exits 1 when STUB_FAIL is its name and
// its second argument, such as "claude add-json".
const stub = `#!/bin/sh
echo "$(basename "$0") $*" >> "$STUB_LOG"
if [ "$STUB_FAIL" = "$(basename "$0") $2" ]; then
  exit 1
fi
`;

const oldNode = `#!/bin/sh
case "$1" in
  -p) echo 18 ;;
  --version) echo v18.0.0 ;;
esac
`;

async function sandbox(t, tools = ["node", "pnpm", "claude"]) {
  // realpath, because node resolves /var to /private/var on macOS, and the receipt compares paths.
  const base = await mkdtemp(join(await realpath(tmpdir()), "brain-install-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, "repo");
  await cp(repo, root, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (src) => !notCopied.has(relative(repo, src)),
  });
  await symlink(join(repo, "node_modules"), join(root, "node_modules"));
  const box = { base, root, home: join(base, "home"), stubs: join(base, "stubs"), log: join(base, "stubs.log") };
  await mkdir(box.home);
  await mkdir(box.stubs);
  for (const tool of tools) {
    await addTool(box, tool);
  }
  return box;
}

// addTool links the real node, or writes text, or the logging stub, as the tool.
async function addTool(box, tool, text) {
  if (tool === "node" && text === undefined) {
    await symlink(process.execPath, join(box.stubs, "node"));
    return;
  }
  await writeFile(join(box.stubs, tool), text ?? stub, { mode: 0o755 });
}

// run starts the script with /bin/bash, which is bash 3.2 on macOS, and a minimal environment.
function run(box, script, options = {}) {
  const result = spawnSync("/bin/bash", [options.arg ?? join(box.root, "scripts", script)], {
    cwd: options.cwd ?? box.root,
    encoding: "utf8",
    env: { HOME: box.home, PATH: `${box.stubs}:/usr/bin:/bin`, STUB_LOG: box.log, ...options.env },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, out: result.stdout + result.stderr };
}

function installOk(box, options) {
  const result = run(box, "install.sh", options);
  assert.equal(result.code, 0, result.out);
  return result;
}

const paths = (box) => ({
  skills: [join(box.home, ".claude", "skills"), join(box.home, ".agents", "skills")],
  agents: join(box.home, ".claude", "agents"),
  bin: join(box.home, ".local", "bin", "brain"),
  settings: join(box.home, ".claude", "settings.json"),
  codexConfig: join(box.home, ".codex", "config.toml"),
  codexHooks: join(box.home, ".codex", "hooks.json"),
  codexAgents: join(box.home, ".codex", "AGENTS.md"),
  receipt: join(box.home, ".local", "share", "agent-brain", "installed.txt"),
  profile: join(box.home, ".local", "share", "agent-brain", "chrome-profile"),
  opencode: join(box.home, ".config", "opencode"),
  plugin: join(box.home, ".config", "opencode", "plugins", "brain-session-premises.js"),
});

const exists = async (path) => Boolean(await ifMissing(lstat(path), null));
const readText = (path) => ifMissing(readFile(path, "utf8"), "");
const lines = (text, pattern) => text.split("\n").filter((line) => pattern.test(line));

async function skillDirs(dir) {
  const names = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && (await exists(join(dir, entry.name, "SKILL.md")))) {
      names.push(entry.name);
    }
  }
  return names;
}

async function agentNames(root) {
  return (await readdir(join(root, "agents"))).filter((n) => n.endsWith(".md")).map((n) => n.slice(0, -3));
}

// expectedSkills lists each skill link that the install makes in one folder.
async function expectedSkills(root) {
  const names = new Set([
    ...(await skillDirs(join(root, "skills", "active"))),
    ...(await skillDirs(join(root, ".agents", "skills"))).map((n) => `brain-tp-${n}`),
    ...(await agentNames(root)),
  ]);
  return [...names].toSorted();
}

function assertSteps(stdout, total) {
  let last = -1;
  for (let i = 1; i <= total; i += 1) {
    const at = stdout.indexOf(`[${i}/${total}] `);
    assert.ok(at > last, `step ${i}/${total} is missing or out of order:\n${stdout}`);
    last = at;
  }
  assert.ok(!stdout.includes(`[${total + 1}/${total}]`));
}

test("TestInstallSetsUpEveryTool", async (t) => {
  const box = await sandbox(t);
  const p = paths(box);
  const { stdout, out } = installOk(box);

  assertSteps(stdout, installSteps);
  assert.doesNotMatch(out, /^ln -sfn/mu);
  assert.ok(!out.includes("\u001B["), "no colors without a terminal");
  const skills = await expectedSkills(box.root);
  for (const dir of p.skills) {
    assert.deepEqual((await readdir(dir)).toSorted(), skills);
    for (const name of skills) {
      await stat(join(dir, name, "SKILL.md"));
    }
  }
  assert.match(
    stdout,
    new RegExp(`✓ ${skills.length * 2} skill links in ~/.claude/skills and ~/.agents/skills\n`, "u"),
  );
  const agents = await agentNames(box.root);
  assert.deepEqual((await readdir(p.agents)).toSorted(), agents.map((n) => `${n}.md`).toSorted());
  assert.equal(await readlink(p.bin), join(box.root, "bin", "brain.mjs"));
  assert.ok(await exists(p.profile));

  const settings = JSON.parse(await readFile(p.settings, "utf8"));
  assert.match(JSON.stringify(settings.hooks.SessionStart), /session-premises\.mjs/u);
  assert.ok(settings.permissions.ask.includes("Bash(git commit:*)"));
  assert.match(await readFile(p.codexHooks, "utf8"), /session-premises\.mjs/u);
  for (const name of servers) {
    assert.match(await readFile(p.codexConfig, "utf8"), new RegExp(`^\\[mcp_servers\\.${name}\\]$`, "mu"));
  }
  assert.match(await readFile(p.codexAgents, "utf8"), /<!-- brain:start -->/u);

  const log = await readText(box.log);
  assert.match(log, /^pnpm install --frozen-lockfile --loglevel=error$/mu);
  for (const name of servers) {
    assert.match(log, new RegExp(`^claude mcp add-json -s user ${name} \\{`, "mu"));
    assert.match(stdout, new RegExp(`✓ ${name}\n`, "u"));
  }

  const receipt = await readFile(p.receipt, "utf8");
  assert.equal(receipt.split("\n")[0], `root\t${box.root}`);
  assert.match(receipt, /^mcp\tbrain-premises\tclaude$/mu);
  const summary = `agents ${agents.length}, bin 1, guard 1, hook 2, instructions 1, mcp 4, skills ${skills.length * 2}`;
  assert.match(stdout, new RegExp(`✓ Installed: ${summary}\n`, "u"));
  assert.equal(lines(out, /is not in PATH/u).length, 2, "the summary repeats the PATH warning");
  assert.match(out, new RegExp(`export PATH="${join(box.home, ".local", "bin")}:\\$PATH"`, "u"));
  assert.match(stdout, /- skipped OpenCode agents \(OpenCode is not installed\)/u);
  assert.match(
    stdout,
    /- skipped ~\/.config\/opencode\/plugins\/brain-session-premises.js \(OpenCode is not installed\)/u,
  );
});

test("TestInstallTwiceChangesNothing", async (t) => {
  const box = await sandbox(t);
  const p = paths(box);
  installOk(box);
  const files = [p.settings, p.codexConfig, p.codexHooks, p.codexAgents, p.receipt];
  const before = await Promise.all(files.map((file) => readText(file)));

  const { stdout } = installOk(box);

  assert.deepEqual(await Promise.all(files.map((file) => readText(file))), before);
  assert.doesNotMatch(stdout, /✓ (updated|removed)/u);
  assert.match(stdout, /- unchanged ~\/.claude\/settings.json/u);
  assert.match(stdout, /- unchanged ~\/.codex\/config.toml/u);
  assert.match(stdout, /- unchanged ~\/.codex\/AGENTS.md/u);
});

test("TestInstallAndUninstallKeepUserConfig", async (t) => {
  const box = await sandbox(t);
  const p = paths(box);
  const userSettings = {
    model: "opus",
    permissions: { ask: ["Bash(rm:*)"] },
    hooks: { SessionStart: [{ hooks: [{ type: "command", command: "my-hook" }] }] },
  };
  const userToml = '[mcp_servers.mine]\ncommand = "mine"\n';
  const userAgents = "# My rules\n";
  await mkdir(join(box.home, ".claude"));
  await mkdir(join(box.home, ".codex"));
  await writeFile(p.settings, `${JSON.stringify(userSettings, null, 2)}\n`);
  await writeFile(p.codexConfig, userToml);
  await writeFile(p.codexAgents, userAgents);

  installOk(box);

  const settings = JSON.parse(await readFile(p.settings, "utf8"));
  assert.equal(settings.model, "opus");
  assert.ok(settings.permissions.ask.includes("Bash(rm:*)"));
  assert.match(JSON.stringify(settings.hooks.SessionStart), /my-hook.*session-premises\.mjs/u);
  assert.ok(await exists(`${p.settings}.brain-bak`));
  assert.ok((await readFile(p.codexConfig, "utf8")).startsWith(userToml));
  assert.ok((await readFile(p.codexAgents, "utf8")).startsWith(userAgents));

  const removed = run(box, "uninstall.sh");

  assert.equal(removed.code, 0, removed.out);
  assert.deepEqual(JSON.parse(await readFile(p.settings, "utf8")), userSettings);
  assert.equal(await readFile(p.codexConfig, "utf8"), userToml);
  assert.equal(await readFile(p.codexAgents, "utf8"), userAgents);
});

test("TestInstallRemovesStaleLinksAndKeepsForeignEntries", async (t) => {
  const box = await sandbox(t);
  const p = paths(box);
  const [claudeSkills] = p.skills;
  await mkdir(claudeSkills, { recursive: true });
  await mkdir(p.agents, { recursive: true });
  await mkdir(join(box.home, ".local", "share", "agent-brain"), { recursive: true });
  // Left by an older version: a skill and an agent that this checkout no longer has.
  await symlink(join(box.root, "skills", "active", "brain-gone"), join(claudeSkills, "brain-gone"));
  await symlink(join(box.root, "agents", "brain-old.md"), join(p.agents, "brain-old.md"));
  await writeFile(p.receipt, `root\t${box.root}\nagents\tbrain-dropped\t${join(p.agents, "brain-dropped.md")}\n`);
  // Owned by the user or by another install.
  await mkdir(join(claudeSkills, "brain-next"));
  await writeFile(join(claudeSkills, "brain-next", "SKILL.md"), "mine");
  await symlink("/elsewhere/skill", join(claudeSkills, "other-tool"));
  await writeFile(join(p.agents, "mine.md"), "mine");

  const { stdout } = installOk(box);

  assert.ok(!(await exists(join(claudeSkills, "brain-gone"))));
  assert.match(stdout, /✓ removed ~\/.claude\/skills\/brain-gone\n/u);
  assert.ok(!(await exists(join(p.agents, "brain-old.md"))));
  assert.match(stdout, /✓ removed ~\/.claude\/agents\/brain-old.md\n/u);
  assert.match(stdout, /✓ removed agents brain-dropped ~\/.claude\/agents\/brain-dropped.md\n/u);
  assert.equal(await readFile(join(claudeSkills, "brain-next", "SKILL.md"), "utf8"), "mine");
  assert.match(stdout, /- skip ~\/.claude\/skills\/brain-next \(not a brain link\)\n/u);
  assert.equal(await readlink(join(claudeSkills, "other-tool")), "/elsewhere/skill");
  assert.equal(await readFile(join(p.agents, "mine.md"), "utf8"), "mine");
  const skills = await expectedSkills(box.root);
  assert.match(stdout, new RegExp(`✓ ${skills.length * 2 - 1} skill links in`, "u"));
});

test("TestInstallLinksOpenCodeWhenInstalled", async (t) => {
  const box = await sandbox(t);
  const p = paths(box);
  await mkdir(p.opencode, { recursive: true });

  const { stdout } = installOk(box);

  const agents = await agentNames(box.root);
  const dir = join(p.opencode, "agents");
  assert.deepEqual((await readdir(dir)).toSorted(), agents.map((n) => `${n}.md`).toSorted());
  for (const name of agents) {
    assert.match(await readFile(join(dir, `${name}.md`), "utf8"), /^mode: subagent$/mu);
  }
  assert.equal(await readlink(p.plugin), join(box.root, "hooks", "opencode", "session-premises.js"));
  assert.match(stdout, /✓ updated ~\/.config\/opencode\/plugins\/brain-session-premises.js\n/u);
  assert.doesNotMatch(stdout, /OpenCode is not installed/u);
  assert.match(stdout, new RegExp(`✓ Installed: agents ${agents.length * 2}, bin 1, guard 1, hook 3,`, "u"));
});

test("TestInstallWithoutClaudeWarns", async (t) => {
  const box = await sandbox(t, ["node", "pnpm"]);

  const { stdout, out } = installOk(box);

  assert.equal(lines(out, /claude not found/u).length, 2, "the summary repeats the warning");
  assert.doesNotMatch(await readFile(paths(box).receipt, "utf8"), /\tclaude$/mu);
  assert.match(stdout, /, mcp 2, /u);
});

test("TestInstallFallsBackToNpm", async (t) => {
  const box = await sandbox(t, ["node", "npm", "claude"]);

  const { stdout } = installOk(box);

  assert.match(await readText(box.log), /^npm install --no-audit --no-fund --loglevel=error$/mu);
  assert.match(stdout, /✓ npm install\n/u);
});

test("TestInstallStopsWithoutNode", async (t) => {
  if (existsSync("/usr/bin/node") || existsSync("/bin/node")) {
    t.skip("node is in /usr/bin or /bin");
    return;
  }
  const box = await sandbox(t, ["pnpm", "claude"]);

  const { code, stderr } = run(box, "install.sh");

  assert.equal(code, 1);
  assert.match(stderr, /✗ node not found. Install node 20 or later.\n/u);
  assert.match(stderr, /✗ Step 1\/13 failed: Check tools\n/u);
  assert.match(stderr, new RegExp(`run ${join(box.root, "scripts", "install.sh")} again`, "u"));
  assert.deepEqual(await readdir(box.home), []);
  assert.equal(await readText(box.log), "");
});

test("TestInstallStopsOnOldNode", async (t) => {
  const box = await sandbox(t, ["pnpm", "claude"]);
  await addTool(box, "node", oldNode);

  const { code, stderr } = run(box, "install.sh");

  assert.equal(code, 1);
  assert.match(stderr, /✗ node 20 or later is required. Found v18.0.0.\n/u);
  assert.deepEqual(await readdir(box.home), []);
});

test("TestInstallNamesTheFailedStep", async (t) => {
  const box = await sandbox(t);

  const { code, stdout, stderr } = run(box, "install.sh", { env: { STUB_FAIL: "claude add-json" } });

  assert.equal(code, 1);
  assert.match(stderr, /✗ Step 7\/13 failed: Register MCP servers in Claude Code\n/u);
  assert.match(stderr, /Each step is safe to run again/u);
  assert.doesNotMatch(stdout, /\[8\/13\]/u);
  assert.ok(!(await exists(paths(box).receipt)));
});

test("TestInstallNamesBrokenSettings", async (t) => {
  const box = await sandbox(t);
  const p = paths(box);
  await mkdir(join(box.home, ".claude"));
  await writeFile(p.settings, "{");

  const { code, stderr } = run(box, "install.sh");

  assert.equal(code, 1);
  assert.match(stderr, new RegExp(`${p.settings} is not valid JSON`, "u"));
  assert.doesNotMatch(stderr, /^\s+at /mu, "no stack trace");
  assert.match(stderr, /✗ Step 8\/13 failed: Add the session premises hooks\n/u);
  assert.equal(await readFile(p.settings, "utf8"), "{");
});

test("TestInstallStopsOnMissingSkill", async (t) => {
  const box = await sandbox(t);
  const catalog = JSON.parse(await readFile(join(box.root, "skills", "third-party.json"), "utf8"));
  const [{ name }] = catalog.skills;
  await rm(join(box.root, ".agents", "skills", name), { recursive: true });

  const { code, stderr } = run(box, "install.sh");

  assert.equal(code, 1);
  assert.match(stderr, new RegExp(`✗ missing third-party skills: ${name}. Run: pnpm skills:update\n`, "u"));
  assert.match(stderr, /✗ Step 13\/13 failed: Verify\n/u);
});

test("TestInstallStopsWithoutLinkTargets", async (t) => {
  const box = await sandbox(t);
  await rm(join(box.root, "mcp", "link-targets.txt"));

  const { code, stderr } = run(box, "install.sh");

  assert.equal(code, 1);
  assert.match(stderr, /✗ missing mcp\/link-targets.txt. It lists the skill folders/u);
  assert.match(stderr, /✗ Step 4\/13 failed: Link brain and third-party skills\n/u);
  assert.ok(!(await exists(join(box.home, ".claude", "skills"))));

  const removed = run(box, "uninstall.sh");

  assert.equal(removed.code, 1);
  assert.match(removed.stderr, /✗ Step 2\/10 failed: Remove skill links\n/u);
});

test("TestInstallFromAnotherFolderWithBinDirOnPath", async (t) => {
  const box = await sandbox(t);
  const bin = join(box.base, "bin");
  const targets = join(box.root, "mcp", "link-targets.txt");
  await writeFile(targets, `\n${await readFile(targets, "utf8")}   \n\n`);

  const { stdout, out } = installOk(box, {
    cwd: box.base,
    arg: join("repo", "scripts", "install.sh"),
    env: { BRAIN_BIN_DIR: bin, PATH: `${bin}:${box.stubs}:/usr/bin:/bin` },
  });

  assertSteps(stdout, installSteps);
  assert.equal(await readlink(join(bin, "brain")), join(box.root, "bin", "brain.mjs"));
  assert.ok(!(await exists(paths(box).bin)));
  assert.doesNotMatch(out, /is not in PATH/u);
  assert.match(await readFile(paths(box).receipt, "utf8"), new RegExp(`^bin\tbrain\t${join(bin, "brain")}$`, "mu"));
  assert.match(stdout, /skill links in ~\/.claude\/skills and ~\/.agents\/skills\n/u);
  assert.deepEqual((await readdir(box.base)).toSorted(), ["bin", "home", "repo", "stubs", "stubs.log"]);
  assert.ok(!(await readdir(box.root)).some((name) => name.trim() === ""), "a blank target line makes no folder");
});

test("TestUninstallRemovesWhatInstallAdded", async (t) => {
  const box = await sandbox(t);
  const p = paths(box);
  await mkdir(p.opencode, { recursive: true });
  installOk(box);
  const logBefore = await readText(box.log);

  const { code, stdout, out } = run(box, "uninstall.sh");

  assert.equal(code, 0, out);
  assertSteps(stdout, uninstallSteps);
  const skills = await expectedSkills(box.root);
  const agents = await agentNames(box.root);
  assert.match(
    stdout,
    new RegExp(`✓ removed links: agents ${agents.length * 2}, bin 1, skills ${skills.length * 2}\n`, "u"),
  );
  const log = (await readText(box.log)).slice(logBefore.length);
  for (const name of servers) {
    assert.match(log, new RegExp(`^claude mcp remove -s user ${name}$`, "mu"));
    assert.match(stdout, new RegExp(`✓ removed ${name}\n`, "u"));
  }
  for (const dir of [...p.skills, p.agents, join(p.opencode, "agents")]) {
    assert.deepEqual(await readdir(dir), [], dir);
  }
  for (const gone of [p.bin, p.plugin, p.receipt, join(box.root, ".agents", "linked")]) {
    assert.ok(!(await exists(gone)), gone);
  }
  const settings = await readFile(p.settings, "utf8");
  assert.doesNotMatch(settings, /session-premises|git commit/u);
  assert.doesNotMatch(await readFile(p.codexHooks, "utf8"), /session-premises/u);
  assert.doesNotMatch(await readFile(p.codexConfig, "utf8"), /mcp_servers\.brain-premises/u);
  assert.doesNotMatch(await readFile(p.codexAgents, "utf8"), /brain:start/u);
  assert.ok(await exists(p.profile), "the Chrome profile stays");
  assert.ok(await exists(join(box.root, "skills", "active")), "the repo stays");
  assert.match(stdout, /✓ Removed the brain setup. Kept:\n/u);
  assert.match(stdout, new RegExp(`rm -rf "${p.profile}"`, "u"));
});

test("TestUninstallOnCleanHomeChangesNothing", async (t) => {
  const box = await sandbox(t, ["node"]);
  const targets = join(box.root, "mcp", "link-targets.txt");
  await writeFile(targets, `\n${await readFile(targets, "utf8")}   \n\n`);

  const { code, stdout, out } = run(box, "uninstall.sh");

  assert.equal(code, 0, out);
  assert.equal(lines(stdout, /no brain links in/u).length, 2, "a blank target line is not a folder");
  for (const line of [
    "- no receipt",
    "- no brain links in ~/.claude/skills",
    "- no brain links in ~/.agents/skills",
    "- no brain agent links",
    "- no brain command in ~/.local/bin",
    "- claude not found. Skipped.",
    "- no generated copies",
  ]) {
    assert.ok(stdout.includes(`  ${line}\n`), line);
  }
  assert.doesNotMatch(stdout, /✓ (removed|updated)/u);
  assert.deepEqual(await readdir(box.home), [], "uninstall creates no file");
});

test("TestUninstallWithoutReceiptFindsLinks", async (t) => {
  const box = await sandbox(t);
  const p = paths(box);
  installOk(box);
  await rm(p.receipt);

  const { code, stdout, out } = run(box, "uninstall.sh");

  assert.equal(code, 0, out);
  const skills = await expectedSkills(box.root);
  assert.match(stdout, /- no receipt\n/u);
  assert.match(stdout, new RegExp(`✓ removed ${skills.length} links from ~/.claude/skills\n`, "u"));
  assert.match(stdout, new RegExp(`✓ removed ${skills.length} links from ~/.agents/skills\n`, "u"));
  assert.match(stdout, /✓ removed ~\/.claude\/agents\/brain-reviewer.md\n/u);
  assert.match(stdout, /✓ removed ~\/.local\/bin\/brain\n/u);
  for (const dir of [...p.skills, p.agents]) {
    assert.deepEqual(await readdir(dir), [], dir);
  }
});

test("TestUninstallKeepsForeignEntries", async (t) => {
  const box = await sandbox(t, ["node"]);
  const p = paths(box);
  const other = "/other/checkout";
  const [claudeSkills] = p.skills;
  const foreign = {
    [join(claudeSkills, "brain-next")]: `${other}/skills/active/brain-next`,
    [join(p.agents, "brain-reviewer.md")]: `${other}/agents/brain-reviewer.md`,
    [p.bin]: `${other}/bin/brain.mjs`,
  };
  for (const [link, target] of Object.entries(foreign)) {
    await mkdir(join(link, ".."), { recursive: true });
    await symlink(target, link);
  }
  await mkdir(join(claudeSkills, "mine"));
  await mkdir(join(p.receipt, ".."), { recursive: true });
  await writeFile(p.receipt, `root\t${other}\nbin\tbrain\t${p.bin}\n`);

  const { code, stdout, out } = run(box, "uninstall.sh");

  assert.equal(code, 0, out);
  assert.match(stdout, new RegExp(`- receipt belongs to ${other}. Skipped.\n`, "u"));
  assert.ok(await exists(p.receipt));
  for (const [link, target] of Object.entries(foreign)) {
    assert.equal(await readlink(link), target);
  }
  assert.ok(await exists(join(claudeSkills, "mine")));
  assert.match(stdout, /- no brain links in ~\/.claude\/skills\n/u);
  assert.match(stdout, /- no brain agent links\n/u);
  assert.match(stdout, /- no brain command in ~\/.local\/bin\n/u);
});

test("TestUninstallReportsUnregisteredServers", async (t) => {
  const box = await sandbox(t, ["node", "claude"]);

  const { code, stdout } = run(box, "uninstall.sh", { env: { STUB_FAIL: "claude remove" } });

  assert.equal(code, 0);
  for (const name of servers) {
    assert.match(stdout, new RegExp(`- ${name} was not registered\n`, "u"));
  }
});

test("TestUninstallNamesBrokenSettings", async (t) => {
  const box = await sandbox(t, ["node"]);
  const p = paths(box);
  await mkdir(join(box.home, ".claude"));
  await writeFile(p.settings, "{");

  const { code, stderr } = run(box, "uninstall.sh");

  assert.equal(code, 1);
  assert.match(stderr, new RegExp(`${p.settings} is not valid JSON`, "u"));
  assert.match(stderr, /✗ Step 6\/10 failed: Remove the session premises hooks\n/u);
  assert.equal(await readFile(p.settings, "utf8"), "{");
});
