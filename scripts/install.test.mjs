import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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
  rename,
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
import { setBlock } from "./setup-config.mjs";

// These tests run install.sh and uninstall.sh in a copy of the repo, with an empty HOME and
// stub tools on PATH, so they never touch the real checkout or the real home directory.

const repo = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/u, "");
// The copy skips what is large or generated. node_modules comes back as a link.
const notCopied = new Set(["node_modules", ".git", ".agents/linked", "memory/sessions"]);
const installSteps = 16;
const uninstallSteps = 9;
const servers = ["brain-premises", "chrome-devtools"];

// A stub writes its name and arguments to STUB_LOG. It exits 1 when STUB_FAIL is its name and
// its second argument, such as "claude add-json".
const stub = `#!/bin/sh
echo "$(basename "$0") $*" >> "$STUB_LOG"
if [ "$STUB_FAIL" = "$(basename "$0") $2" ]; then
  exit 1
fi
`;

// The claude stub also keeps the user MCP servers in ~/.claude.json, as Claude Code does, so a
// second install sees them. remove fails for a server that is not there.
const claudeStub = `${stub}exec node -e '
const fs = require("node:fs");
const path = process.env.HOME + "/.claude.json";
const [, sub, , , name, json] = process.argv.slice(1);
const config = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : {};
config.mcpServers ??= {};
if (sub === "add-json") { config.mcpServers[name] = JSON.parse(json); }
if (sub === "remove") { if (!config.mcpServers[name]) { process.exit(1); } delete config.mcpServers[name]; }
fs.writeFileSync(path, JSON.stringify(config));
' "$@"
`;

const oldNode = `#!/bin/sh
case "$1" in
  -p) echo 18 ;;
  --version) echo v18.0.0 ;;
esac
`;

async function sandbox(t, tools = ["node", "pnpm", "claude", "gopls", "buf", "typescript-language-server", "ty"]) {
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
  // Codex counts as installed. TestInstallSkipsCodexWhenMissing removes the folder.
  await mkdir(join(box.home, ".codex"));
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
  await writeFile(join(box.stubs, tool), text ?? (tool === "claude" ? claudeStub : stub), { mode: 0o755 });
}

// run starts the script with /bin/bash, which is bash 3.2 on macOS, and a minimal environment.
function run(box, script, options = {}) {
  const args = [options.arg ?? join(box.root, "scripts", script), ...(options.flags ?? [])];
  const result = spawnSync("/bin/bash", args, {
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
  lsp: join(box.home, ".claude", "skills", "brain-lsp"),
  settings: join(box.home, ".claude", "settings.json"),
  codexConfig: join(box.home, ".codex", "config.toml"),
  codexHooks: join(box.home, ".codex", "hooks.json"),
  codexAgents: join(box.home, ".codex", "AGENTS.md"),
  receipt: join(box.home, ".local", "share", "agent-brain", "installed.txt"),
  profile: join(box.home, ".local", "share", "agent-brain", "chrome-profiles"),
  opencode: join(box.home, ".config", "opencode"),
  plugin: join(box.home, ".config", "opencode", "plugins", "brain-session-premises.js"),
});

// A project that Codex trusts and that is not a brain checkout. It does not exist.
const otherProject = "/nowhere/other-app";

// addTrust appends the Codex trust of each dir and of each hook key, in the form Codex writes.
async function addTrust(path, dirs, hooks = []) {
  const tables = [
    ...dirs.map((dir) => `[projects."${dir}"]\ntrust_level = "trusted"\n`),
    ...hooks.map((key) => `[hooks.state."${key}"]\ntrusted_hash = "sha256:x"\n`),
  ];
  await writeFile(path, `${await readFile(path, "utf8")}\n${tables.join("\n")}`);
}

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
  const [claudeSkills, agentSkills] = p.skills;
  assert.deepEqual((await readdir(claudeSkills)).toSorted(), [...skills, "brain-lsp"].toSorted());
  assert.deepEqual((await readdir(agentSkills)).toSorted(), skills);
  for (const dir of p.skills) {
    for (const name of skills) {
      await stat(join(dir, name, "SKILL.md"));
    }
  }
  assert.match(
    stdout,
    new RegExp(`✓ added ${skills.length * 2} skill links in ~/.claude/skills and ~/.agents/skills\n`, "u"),
  );
  assert.equal(await readlink(p.lsp), join(box.root, "plugins", "brain-lsp"));
  assert.match(stdout, /✓ added ~\/.claude\/skills\/brain-lsp\n/u);
  assert.doesNotMatch(out, /not found, so/u, "no language server warning when gopls and buf are present");
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
    assert.match(stdout, new RegExp(`✓ added MCP server ${name} to Claude Code\n`, "u"));
  }

  const receipt = await readFile(p.receipt, "utf8");
  assert.match(receipt.split("\n")[0], new RegExp(`^root\t${box.root}\t\\d+\\.\\d+\\.\\d+$`, "u"));
  assert.match(receipt, /^mcp\tbrain-premises\tclaude$/mu);
  const summary = `agents ${agents.length}, bin 1, guard 1, hook 2, instructions 1, mcp 4, skills ${skills.length * 2 + 1}`;
  assert.match(stdout, new RegExp(`✓ Installed: ${summary}\n`, "u"));
  assert.match(
    stdout,
    new RegExp(
      `  This run: added ${summary.replace("guard 1, ", "guard 1, home 1, ").replace("mcp 4, ", "mcp 4, profile 1, ")}\n`,
      "u",
    ),
  );
  assert.match(stdout, /^\[1\/16\] Check tools: node v\d+/mu);
  assert.match(stdout, /^ {2}1\. Review the starter premises with brain premise list --status candidate/mu);
  assert.match(stdout, /^ {2}3\. Start a new Claude Code, Codex, or OpenCode session/mu);
  assert.match(stdout, /^ {2}4\. In Codex, trust the new hook once in \/hooks\.$/mu);
  assert.doesNotMatch(stdout, /OpenCode config|opencode\/AGENTS\.md/u, "no OpenCode step without OpenCode");
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
  assert.doesNotMatch(stdout, /✓ (added|updated|removed)/u);
  for (const name of [
    "Link the code intelligence plugin",
    "Link brain and third-party skills",
    "Create the Chrome profile directory",
    "Register MCP servers in Claude Code",
    "Ask before git commit, push, and destructive git commands",
    "Register MCP servers in Codex",
    "Remove the Codex trust of a moved checkout",
    "Add the brain instructions to Codex",
  ]) {
    assert.match(stdout, new RegExp(`\\] ${name}: no change\n`, "u"), name);
  }
  assert.match(stdout, /^ {2}This run: no change$/mu);
  assert.doesNotMatch(stdout, /Next:/u, "nothing to do after a run with no change");
  assert.doesNotMatch(await readText(box.log), /add-json[^]*add-json[^]*add-json/u, "no second add-json");
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
  assert.match(stdout, /✓ removed 1 skill link in ~\/.claude\/skills and ~\/.agents\/skills\n/u);
  assert.ok(!(await exists(join(p.agents, "brain-old.md"))));
  assert.match(stdout, /✓ removed ~\/.claude\/agents\/brain-old.md\n/u);
  assert.doesNotMatch(stdout, /brain-dropped/u, "a receipt item with no link is not a change");
  assert.equal(await readFile(join(claudeSkills, "brain-next", "SKILL.md"), "utf8"), "mine");
  assert.match(stdout, /- skipped ~\/.claude\/skills\/brain-next \(not a brain link\)\n/u);
  assert.equal(await readlink(join(claudeSkills, "other-tool")), "/elsewhere/skill");
  assert.equal(await readFile(join(p.agents, "mine.md"), "utf8"), "mine");
  const skills = await expectedSkills(box.root);
  assert.match(stdout, new RegExp(`✓ added ${skills.length * 2 - 1} skill links in`, "u"));
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
  assert.match(stdout, /✓ added ~\/.config\/opencode\/plugins\/brain-session-premises.js\n/u);
  assert.doesNotMatch(stdout, /OpenCode is not installed/u);
  assert.match(stdout, /\. Add brain-premises and chrome-devtools from mcp\/snippets\/ to the OpenCode config/u);
  assert.match(stdout, /\. Paste templates\/agent-instructions.md into ~\/.config\/opencode\/AGENTS.md/u);
  assert.match(stdout, /\. Add the lsp block from docs\/integrations.md to the OpenCode config in your dotfiles\.$/mu);
  assert.match(stdout, new RegExp(`✓ Installed: agents ${agents.length * 2}, bin 1, guard 1, hook 3,`, "u"));
});

test("TestInstallWithoutClaudeWarns", async (t) => {
  const box = await sandbox(t, ["node", "pnpm", "typescript-language-server"]);

  const { stdout, out } = installOk(box);

  assert.equal(lines(out, /claude not found/u).length, 2, "the summary repeats the warning");
  assert.doesNotMatch(await readFile(paths(box).receipt, "utf8"), /\tclaude$/mu);
  assert.match(stdout, /, mcp 2, /u);
});

test("TestInstallWithoutLanguageServers", async (t) => {
  const box = await sandbox(t, ["node", "pnpm", "claude", "npm", "uv"]);

  const { stdout, out } = installOk(box);

  assert.equal(lines(out, /gopls not found, so Go files get no language server/u).length, 2, "the summary repeats it");
  assert.equal(lines(out, /buf not found, so \.proto files get no language server/u).length, 2);
  assert.ok(await exists(paths(box).lsp), "the plugin link does not need the servers");
  const npmGlobal = "npm install -g --no-audit --no-fund --loglevel=error typescript-language-server typescript@6";
  assert.match(await readText(box.log), new RegExp(`^${npmGlobal}$`, "mu"));
  assert.match(stdout, /✓ added typescript-language-server and typescript@6 with npm install -g\n/u);
  assert.match(await readText(box.log), /^uv tool install --quiet ty$/mu);
  assert.match(stdout, /✓ added ty with uv tool install\n/u);
  const logBefore = await readText(box.log);
  assert.equal(run(box, "uninstall.sh").code, 0);
  assert.doesNotMatch(
    (await readText(box.log)).slice(logBefore.length),
    /^(npm|uv) /mu,
    "the uninstall keeps the language servers",
  );
});

test("TestInstallWarnsWithoutUv", async (t) => {
  const box = await sandbox(t, ["node", "pnpm", "claude", "gopls", "buf", "typescript-language-server"]);

  const { out } = installOk(box);

  assert.equal(lines(out, /uv not found, so the install cannot add ty/u).length, 2, "the summary repeats it");
});

test("TestInstallFallsBackToNpm", async (t) => {
  const box = await sandbox(t, ["node", "npm", "claude"]);

  const { stdout } = installOk(box);

  assert.match(await readText(box.log), /^npm install --no-audit --no-fund --loglevel=error$/mu);
  assert.match(stdout, /\[2\/16\] Install dependencies: npm install\n/u);
});

test("TestInstallStopsWithoutNode", async (t) => {
  if (existsSync("/usr/bin/node") || existsSync("/bin/node")) {
    t.skip("node is in /usr/bin or /bin");
    return;
  }
  const box = await sandbox(t, ["pnpm", "claude"]);

  const { code, stderr } = run(box, "install.sh");

  assert.equal(code, 1);
  assert.match(stderr, /✗ node not found. Install node 24 or later.\n/u);
  assert.match(stderr, /✗ Step 1\/16 failed: Check tools\n/u);
  assert.match(stderr, new RegExp(`run ${join(box.root, "scripts", "install.sh")} again`, "u"));
  assert.deepEqual(await readdir(box.home), [".codex"]);
  assert.equal(await readText(box.log), "");
});

test("TestInstallStopsOnOldNode", async (t) => {
  const box = await sandbox(t, ["pnpm", "claude"]);
  await addTool(box, "node", oldNode);

  const { code, stderr } = run(box, "install.sh");

  assert.equal(code, 1);
  assert.match(stderr, /✗ node 24 or later is required. Found v18.0.0.\n/u);
  assert.deepEqual(await readdir(box.home), [".codex"]);
});

test("TestInstallNamesTheFailedStep", async (t) => {
  const box = await sandbox(t);

  const { code, stdout, stderr } = run(box, "install.sh", { env: { STUB_FAIL: "claude add-json" } });

  assert.equal(code, 1);
  assert.match(stderr, /✗ Step 9\/16 failed: Register MCP servers in Claude Code\n/u);
  assert.match(stderr, /Each step is safe to run again/u);
  assert.doesNotMatch(stdout, /\[10\/16\]/u);
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
  assert.match(stderr, /✗ Step 10\/16 failed: Add the session premises hooks\n/u);
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
  assert.match(stderr, /✗ Step 16\/16 failed: Verify\n/u);
});

test("TestInstallStopsWithoutLinkTargets", async (t) => {
  const box = await sandbox(t);
  await rm(join(box.root, "mcp", "link-targets.txt"));

  const { code, stderr } = run(box, "install.sh");

  assert.equal(code, 1);
  assert.match(stderr, /✗ missing mcp\/link-targets.txt. It lists the skill folders/u);
  assert.match(stderr, /✗ Step 6\/16 failed: Link brain and third-party skills\n/u);
  assert.deepEqual(await readdir(join(box.home, ".claude", "skills")), ["brain-lsp"], "only the step before links");

  const removed = run(box, "uninstall.sh");

  assert.equal(removed.code, 1);
  assert.match(removed.stderr, /✗ Step 1\/9 failed: Remove links\n/u);
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
  assert.match(stdout, new RegExp(`✓ removed ${skills.length * 2 + 1} skill links\n`, "u"));
  assert.match(stdout, new RegExp(`✓ removed ${agents.length * 2} agent links\n`, "u"));
  assert.match(stdout, /✓ removed ~\/.local\/bin\/brain\n/u);
  assert.match(stdout, /✓ removed session premises hook from ~\/.claude\/settings.json\n/u);
  assert.match(stdout, /✓ removed git confirmation rules from ~\/.claude\/settings.json\n/u);
  assert.match(stdout, /✓ removed brain instructions from ~\/.codex\/AGENTS.md\n/u);
  assert.match(
    stdout,
    new RegExp(
      `✓ Removed: agents ${agents.length * 2}, bin 1, guard 1, hook 3, instructions 1, mcp 4, skills ${skills.length * 2 + 1}\n`,
      "u",
    ),
  );
  const log = (await readText(box.log)).slice(logBefore.length);
  for (const name of servers) {
    assert.match(log, new RegExp(`^claude mcp remove -s user ${name}$`, "mu"));
    assert.match(stdout, new RegExp(`✓ removed MCP server ${name} from Claude Code\n`, "u"));
    assert.match(stdout, new RegExp(`✓ removed MCP server ${name} from ~/.codex/config.toml\n`, "u"));
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
  assert.match(stdout, /\nKept:\n/u);
  assert.match(stdout, /~\/.local\/share\/agent-brain\/chrome-profiles \(Chrome test logins\)\n/u);
  assert.match(stdout, /~\/.claude\/settings.json.brain-bak \(config copy from before the last brain edit\)\n/u);
  assert.match(stdout, new RegExp(`rm -rf "${p.profile}"`, "u"));
  assert.match(stdout, /\[9\/9\] Remove the config backups: kept 4 backups\. Add --remove-backups to remove them\n/u);
  assert.match(stdout, /^ {2}scripts\/uninstall.sh --remove-backups$/mu);
});

test("TestUninstallOnCleanHomeChangesNothing", async (t) => {
  const box = await sandbox(t, ["node"]);
  const targets = join(box.root, "mcp", "link-targets.txt");
  await writeFile(targets, `\n${await readFile(targets, "utf8")}   \n\n`);

  const { code, stdout, out } = run(box, "uninstall.sh");

  assert.equal(code, 0, out);
  for (const line of [
    "[1/9] Remove links: no receipt",
    "[2/9] Remove MCP servers from Claude Code: claude not found. Skipped.",
    "[3/9] Remove the Codex trust: no change",
    "[4/9] Remove the session premises hooks: no change",
    "[8/9] Remove the generated copies: no change",
    "[9/9] Remove the config backups: no change",
    "✓ Nothing to remove.",
  ]) {
    assert.ok(stdout.includes(`${line}\n`), line);
  }
  assert.doesNotMatch(stdout, /✓ (removed|updated)|brain-bak|To remove them too/u);
  assert.deepEqual(await readdir(box.home), [".codex"], "uninstall creates no file");
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
  assert.match(stdout, new RegExp(`✓ removed ${skills.length * 2 + 1} skill links\n`, "u"));
  assert.match(stdout, new RegExp(`✓ removed ${(await agentNames(box.root)).length} agent links\n`, "u"));
  assert.match(stdout, /✓ removed ~\/.local\/bin\/brain\n/u);
  for (const dir of [...p.skills, p.agents]) {
    assert.deepEqual(await readdir(dir), [], dir);
  }
});

test("TestUninstallKeepsForeignEntries", async (t) => {
  const box = await sandbox(t, ["node"]);
  const p = paths(box);
  const other = join(box.base, "other");
  const [claudeSkills] = p.skills;
  const foreign = {
    [join(claudeSkills, "brain-next")]: `${other}/skills/active/brain-next`,
    [join(p.agents, "brain-reviewer.md")]: `${other}/agents/brain-reviewer.md`,
    [p.bin]: `${other}/bin/brain.mjs`,
  };
  for (const [link, target] of Object.entries(foreign)) {
    await mkdir(join(link, ".."), { recursive: true });
    await symlink(target, link);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, "");
  }
  await mkdir(join(claudeSkills, "mine"));
  await mkdir(join(p.receipt, ".."), { recursive: true });
  await writeFile(p.receipt, `root\t${other}\nbin\tbrain\t${p.bin}\n`);

  const { code, stdout, out } = run(box, "uninstall.sh");

  assert.equal(code, 0, out);
  assert.match(stdout, new RegExp(`\\[1/9\\] Remove links: receipt belongs to ${other}. Skipped.\n`, "u"));
  assert.ok(await exists(p.receipt));
  for (const [link, target] of Object.entries(foreign)) {
    assert.equal(await readlink(link), target);
  }
  assert.ok(await exists(join(claudeSkills, "mine")));
  assert.doesNotMatch(stdout, /✓ removed/u);
});

test("TestUninstallRemovesLinksOfMovedCheckout", async (t) => {
  const box = await sandbox(t, ["node"]);
  const p = paths(box);
  const gone = join(box.base, "gone");
  const [claudeSkills] = p.skills;
  const dead = {
    [join(claudeSkills, "brain-next")]: `${gone}/skills/active/brain-next`,
    [join(p.agents, "brain-reviewer.md")]: `${gone}/agents/brain-reviewer.md`,
    [p.bin]: `${gone}/bin/brain.mjs`,
    [p.plugin]: `${gone}/hooks/opencode/session-premises.js`,
  };
  const mine = join(claudeSkills, "mine");
  for (const [link, target] of Object.entries({ ...dead, [mine]: `${gone}/mine` })) {
    await mkdir(join(link, ".."), { recursive: true });
    await symlink(target, link);
  }

  const { code, stdout, out } = run(box, "uninstall.sh");

  assert.equal(code, 0, out);
  for (const link of Object.keys(dead)) {
    assert.ok(!(await exists(link)), link);
  }
  assert.ok(await exists(mine), "a dead link without the brain name stays");
  for (const link of Object.keys(dead)) {
    assert.match(stdout, new RegExp(`✓ removed ${link.replace(box.home, "~")}\n`, "u"));
  }
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
  assert.match(stderr, /✗ Step 4\/9 failed: Remove the session premises hooks\n/u);
  assert.equal(await readFile(p.settings, "utf8"), "{");
});

test("TestInstallDryRunChangesNothing", async (t) => {
  const box = await sandbox(t);

  const { code, stdout, out } = run(box, "install.sh", { flags: ["--dry-run"] });

  assert.equal(code, 0, out);
  assertSteps(stdout, installSteps);
  assert.match(stdout, /^Dry run: nothing changes\.$/mu);
  assert.match(stdout, /~ would add ~\/.local\/bin\/brain\n/u);
  assert.match(stdout, /~ would add MCP server brain-premises to Claude Code\n/u);
  assert.match(stdout, /\[15\/16\] Write the install receipt: skipped in a dry run\n/u);
  assert.match(
    stdout,
    /\nDry run: would add agents \d+, bin 1, guard 1, home 1, hook 2, instructions 1, mcp 4, profile 1, skills \d+\n/u,
  );
  assert.deepEqual(await readdir(box.home), [".codex"], "a dry run writes nothing");
  assert.equal(await readText(box.log), "", "a dry run runs no pnpm and no claude");
  assert.ok(!(await exists(join(box.root, ".agents", "linked"))));
});

test("TestUninstallDryRunRemovesNothing", async (t) => {
  const box = await sandbox(t);
  const p = paths(box);
  installOk(box);
  const logBefore = await readText(box.log);
  const settings = await readFile(p.settings, "utf8");
  await addTrust(p.codexConfig, [box.root]);
  const codex = await readFile(p.codexConfig, "utf8");

  const { code, stdout, out } = run(box, "uninstall.sh", { flags: ["--dry-run"] });

  assert.equal(code, 0, out);
  assertSteps(stdout, uninstallSteps);
  const skills = await expectedSkills(box.root);
  assert.match(stdout, new RegExp(`~ would remove ${skills.length * 2 + 1} skill links\n`, "u"));
  assert.match(stdout, /~ would remove MCP server brain-premises from Claude Code\n/u);
  assert.match(stdout, new RegExp(`~ would remove trusted project ${box.root} from ~/.codex/config.toml\n`, "u"));
  assert.match(
    stdout,
    /\nDry run: would remove agents \d+, bin 1, guard 1, hook 2, instructions 1, mcp 4, skills \d+, trust 1\n/u,
  );
  assert.equal(await readFile(p.settings, "utf8"), settings);
  assert.equal(await readFile(p.codexConfig, "utf8"), codex);
  assert.ok(await exists(p.receipt));
  assert.ok(await exists(p.bin));
  assert.equal(await readText(box.log), logBefore, "a dry run runs no claude command");
});

test("TestScriptsPrintHelp", async (t) => {
  const box = await sandbox(t, ["node"]);

  for (const script of ["install.sh", "uninstall.sh"]) {
    const help = run(box, script, { flags: ["--help"] });
    assert.equal(help.code, 0, script);
    const options =
      script === "uninstall.sh"
        ? "[--dry-run] [--remove-backups] [--help]"
        : "[--dry-run] [--home DIR] [--home-repo URL] [--no-git-guard] [--no-codex] [--no-lsp] [--help]";
    assert.ok(help.stdout.includes(`\nUsage: scripts/${script} ${options}\n`), help.stdout);
    assert.match(help.stdout, /^ {2}BRAIN_BIN_DIR /mu);
    const bad = run(box, script, { flags: ["--nope"] });
    assert.equal(bad.code, 2, script);
    assert.match(bad.stderr, /^unknown option: --nope\n/u);
    assert.doesNotMatch(bad.stderr, /failed/u);
  }
  assert.deepEqual(await readdir(box.home), [".codex"]);
});

test("TestInstallAfterMoveReplacesLinks", async (t) => {
  const box = await sandbox(t);
  const p = paths(box);
  installOk(box);
  const moved = { ...box, root: join(box.base, "moved") };
  await rename(box.root, moved.root);
  await addTrust(p.codexConfig, [box.root, moved.root, otherProject]);

  const { stdout } = installOk(moved);

  assert.match(stdout, new RegExp(`^The checkout moved from ${box.root}\\. This install replaces its links\\.$`, "mu"));
  const skills = await expectedSkills(moved.root);
  assert.match(stdout, new RegExp(`✓ updated ${skills.length * 2} skill links in`, "u"));
  assert.match(stdout, new RegExp(`✓ removed trusted project ${box.root} from ~/.codex/config.toml\n`, "u"));
  const agents = await agentNames(moved.root);
  assert.match(
    stdout,
    new RegExp(`This run: updated agents ${agents.length}, bin 1, hook 2, mcp 2, skills \\d+; removed trust 1\n`, "u"),
  );
  const codex = await readFile(p.codexConfig, "utf8");
  assert.ok(!codex.includes(`"${box.root}"`), "the trust of the old place goes");
  for (const dir of [moved.root, otherProject]) {
    assert.ok(codex.includes(`[projects."${dir}"]`), dir);
  }
  assert.equal(await readlink(join(p.skills[0], "brain-next")), join(moved.root, "skills", "active", "brain-next"));
  assert.equal(await readlink(p.bin), join(moved.root, "bin", "brain.mjs"));
  assert.match(await readFile(p.receipt, "utf8"), new RegExp(`^root\t${moved.root}\t`, "u"));
});

test("TestUninstallRemovesOrphanReceipt", async (t) => {
  const box = await sandbox(t);
  const p = paths(box);
  installOk(box);
  const moved = { ...box, root: join(box.base, "moved") };
  await rename(box.root, moved.root);
  await addTrust(p.codexConfig, [box.root, moved.root, otherProject], [`${p.codexHooks}:session_start:0:0`]);

  const { code, stdout, out } = run(moved, "uninstall.sh");

  assert.equal(code, 0, out);
  assert.match(stdout, new RegExp(`- removed the receipt of ${box.root}, a checkout that is gone\n`, "u"));
  for (const label of [
    `trusted project ${moved.root}`,
    `trusted project ${box.root}`,
    "trust of the session premises hook",
  ]) {
    assert.match(stdout, new RegExp(`✓ removed ${label} from ~/.codex/config.toml\n`, "u"));
  }
  const codex = await readFile(p.codexConfig, "utf8");
  assert.doesNotMatch(codex, /hooks\.state\.|trust_level[^]*trust_level/u, "only the other project keeps its trust");
  assert.ok(codex.includes(`[projects."${otherProject}"]`));
  assert.ok(!(await exists(p.receipt)));
  for (const dir of p.skills) {
    assert.deepEqual(await readdir(dir), [], dir);
  }
  assert.ok(!(await exists(p.bin)));
});

test("TestInstallSkipsOpenCodeStepsWhenDone", async (t) => {
  const box = await sandbox(t);
  const p = paths(box);
  await mkdir(p.opencode, { recursive: true });
  await writeFile(
    join(p.opencode, "opencode.json"),
    '{ "mcp": { "brain-premises": {} }, "lsp": { "ts": { "command": ["/brain/plugins/brain-lsp/scripts/ts-lsp.sh"] } } }\n',
  );
  const template = await readFile(join(box.root, "templates", "agent-instructions.md"), "utf8");
  await writeFile(join(p.opencode, "AGENTS.md"), setBlock("# mine\n", template));

  const { stdout } = installOk(box);

  assert.doesNotMatch(stdout, /OpenCode config|opencode\/AGENTS\.md/u);
});

test("TestUninstallRemovesBackupsOnRequest", async (t) => {
  const box = await sandbox(t);
  const p = paths(box);
  installOk(box);
  const userCopy = `${p.settings}.bak`;
  await writeFile(userCopy, "mine");
  const backups = [p.settings, p.codexHooks, p.codexConfig, p.codexAgents].map((file) => `${file}.brain-bak`);
  run(box, "uninstall.sh");

  const dry = run(box, "uninstall.sh", { flags: ["--dry-run", "--remove-backups"] });

  assert.equal(dry.code, 0, dry.out);
  assert.match(dry.stdout, /~ would remove ~\/.claude\/settings.json.brain-bak\n/u);
  assert.match(dry.stdout, /\nDry run: would remove backups 4\n/u);
  for (const backup of backups) {
    assert.ok(await exists(backup), backup);
  }

  const { code, stdout, out } = run(box, "uninstall.sh", { flags: ["--remove-backups"] });

  assert.equal(code, 0, out);
  assertSteps(stdout, uninstallSteps);
  for (const backup of backups) {
    assert.ok(!(await exists(backup)), backup);
    assert.match(stdout, new RegExp(`✓ removed ${backup.replace(box.home, "~")}\n`, "u"));
  }
  assert.match(stdout, /✓ Removed: backups 4\n/u);
  assert.doesNotMatch(stdout, /config copy|--remove-backups$/mu);
  assert.equal(await readFile(userCopy, "utf8"), "mine", "a .bak file of the user stays");
});

test("TestInstallCreatesHomeOnceAndUninstallKeepsIt", async (t) => {
  const box = await sandbox(t);
  const home = join(box.home, ".local", "share", "agent-brain", "home");

  installOk(box);

  assert.deepEqual(JSON.parse(await readFile(join(home, "brain.config.json"), "utf8")), { scopes: {} });
  assert.match(await readFile(join(home, ".gitignore"), "utf8"), /^memory\/\*\*$/mu);
  assert.ok((await stat(join(home, ".git"))).isDirectory());
  const starters = (await readdir(join(home, "memory", "premises"))).filter((name) => name.endsWith(".md"));
  assert.ok(starters.length >= 10, starters.join(" "));
  for (const name of starters) {
    assert.match(await readFile(join(home, "memory", "premises", name), "utf8"), /^status: candidate$/mu, name);
  }

  // A second install keeps the home as the user left it.
  await writeFile(join(home, "brain.config.json"), '{ "scopes": { "mine": { "roots": ["~/code"] } } }\n');
  const again = installOk(box);
  assert.doesNotMatch(again.stdout, /starter premise/u);
  assert.match(await readFile(join(home, "brain.config.json"), "utf8"), /"mine"/u);

  const removed = run(box, "uninstall.sh");
  assert.equal(removed.code, 0, removed.out);
  assert.ok((await stat(join(home, "brain.config.json"))).isFile());
  assert.match(removed.stdout, /home\/? \(brain home: your config, premises, notes, and skills\)/u);
});

test("TestInstallLinksHomeToFolder", async (t) => {
  const box = await sandbox(t);
  const mine = join(box.base, "my-home");

  installOk(box, { flags: ["--home", mine] });

  const link = join(box.home, ".local", "share", "agent-brain", "home");
  assert.equal(await readlink(link), mine);
  assert.ok((await stat(join(mine, "brain.config.json"))).isFile());
});

test("TestInstallWarnsWhenNpmGlobalFails", async (t) => {
  const box = await sandbox(t, ["node", "pnpm", "claude", "npm", "uv", "gopls", "buf"]);

  const { stdout } = installOk(box, { env: { STUB_FAIL: "npm -g" } });

  assert.match(stdout, /! npm install -g failed, so TypeScript files get no language server\./u);
});

test("TestInstallSkipsOptionalParts", async (t) => {
  const box = await sandbox(t);
  const p = paths(box);

  const { stdout } = installOk(box, { flags: ["--no-git-guard", "--no-codex", "--no-lsp"] });

  assert.match(stdout, /Ask before git commit, push, and destructive git commands: skipped \(--no-git-guard\)\n/u);
  assert.match(stdout, /Register MCP servers in Codex: skipped \(--no-codex\)\n/u);
  assert.match(stdout, /Link the code intelligence plugin: skipped \(--no-lsp\)\n/u);
  assert.doesNotMatch(await ifMissing(readFile(p.settings, "utf8"), ""), /git push/u);
  assert.equal(existsSync(p.codexConfig), false);
  assert.equal(existsSync(p.codexHooks), false);
  assert.equal(existsSync(p.lsp), false);
});

test("TestInstallSkipsCodexWhenMissing", async (t) => {
  const box = await sandbox(t);
  await rm(join(box.home, ".codex"), { recursive: true });

  const { stdout } = installOk(box);

  assert.match(stdout, /Register MCP servers in Codex: skipped \(Codex is not installed\)\n/u);
  assert.equal(existsSync(join(box.home, ".codex")), false);
});

test("TestInstallUpdateAddsTemplateFoldersAndOffersStarters", async (t) => {
  const box = await sandbox(t);
  const home = join(box.home, ".local", "share", "agent-brain", "home");
  installOk(box);
  await rm(join(home, "flows"), { recursive: true });
  const starter = (await readdir(join(home, "memory", "premises"))).find((name) => name.endsWith(".md"));
  await rm(join(home, "memory", "premises", starter));

  const { stdout } = installOk(box);

  assert.match(stdout, /✓ added ~\/\.local\/share\/agent-brain\/home\/flows\/\.gitkeep\n/u);
  assert.ok((await stat(join(home, "flows", ".gitkeep"))).isFile());
  assert.match(stdout, /Run brain home starters to list 1 new starter premise, and add --apply/u);
});

test("TestInstallAddsMissingChromeDevtoolsHomeConfig", async (t) => {
  const box = await sandbox(t);
  const config = join(box.home, ".local", "share", "agent-brain", "home", "mcp", "chrome-devtools.json");
  const template = await readFile(join(box.root, "templates", "home", "mcp", "chrome-devtools.json"), "utf8");
  installOk(box);
  assert.equal(await readFile(config, "utf8"), template, "a new home gets the config");
  await rm(config);

  const { stdout } = installOk(box);

  assert.match(stdout, /✓ added ~\/\.local\/share\/agent-brain\/home\/mcp\/chrome-devtools\.json\n/u);
  assert.equal(await readFile(config, "utf8"), template);
});

test("TestInstallKeepsChromeDevtoolsHomeConfig", async (t) => {
  const box = await sandbox(t);
  const config = join(box.home, ".local", "share", "agent-brain", "home", "mcp", "chrome-devtools.json");
  installOk(box);
  const mine = '{ "command": "npx", "args": ["mine"] }\n';
  await writeFile(config, mine);

  const { stdout } = installOk(box);

  assert.doesNotMatch(stdout, /chrome-devtools\.json/u);
  assert.equal(await readFile(config, "utf8"), mine);
});

test("TestInstallPrintsTheChangesSinceTheLastVersion", async (t) => {
  const box = await sandbox(t);
  installOk(box);
  const p = paths(box);
  const receipt = await readFile(p.receipt, "utf8");
  await writeFile(p.receipt, receipt.replace(/^(root\t[^\t\n]*)\t[^\n]*/u, "$1\t0.0.1"));
  const version = JSON.parse(await readFile(join(box.root, "package.json"), "utf8")).version;

  const { stdout } = installOk(box);

  assert.match(stdout, new RegExp(`\\nUpdated the brain from 0\\.0\\.1 to ${version.replaceAll(".", "\\.")}:\\n`, "u"));
  assert.match(stdout, /^ {2}\* serve brain-premises with MCP SDK v2$/mu);
  assert.match(await readFile(p.receipt, "utf8"), new RegExp(`^root\\t${box.root}\\t${version}\\n`, "u"));
});

function gitAs(cwd, ...args) {
  return execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.invalid", ...args], {
    cwd,
    stdio: "pipe",
  });
}

// homeRepo makes a bare git repo in the sandbox, with files in its first commit when given.
async function homeRepo(box, files) {
  const bare = join(box.base, "home-repo.git");
  gitAs(box.base, "init", "-q", "--bare", "-b", "main", bare);
  if (!files) {
    return bare;
  }
  const work = join(box.base, "home-work");
  gitAs(box.base, "clone", "-q", bare, work);
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(join(work, rel, ".."), { recursive: true });
    await writeFile(join(work, rel), text);
  }
  gitAs(work, "add", "-A");
  gitAs(work, "commit", "-q", "-m", "home");
  gitAs(work, "push", "-q", "origin", "HEAD:main");
  return bare;
}

const myRule =
  '---\nid: my-rule\ntext: "My rule."\nstrength: always\nscope: "*"\nrepos:\n  - "*"\nstatus: active\n---\n';

test("TestInstallClonesHomeRepo", async (t) => {
  const box = await sandbox(t);
  const url = await homeRepo(box, {
    "brain.config.json": '{ "scopes": { "mine": { "roots": ["~/code"] } } }\n',
    "memory/premises/my-rule.md": myRule,
  });
  const home = join(box.home, ".local", "share", "agent-brain", "home");

  const { stdout } = installOk(box, { flags: ["--home-repo", url] });

  assert.match(stdout, /✓ added ~\/\.local\/share\/agent-brain\/home, cloned from /u);
  assert.doesNotMatch(stdout, /with \d+ starter premises as candidates/u);
  assert.match(await readFile(join(home, "brain.config.json"), "utf8"), /"mine"/u);
  assert.equal(await readFile(join(home, "memory", "premises", "my-rule.md"), "utf8"), myRule);
  assert.equal(execFileSync("git", ["-C", home, "remote", "get-url", "origin"], { encoding: "utf8" }).trim(), url);

  const again = installOk(box, { flags: ["--home-repo", url] });
  assert.doesNotMatch(again.stdout, /cloned from/u);
});

test("TestInstallFillsAnEmptyHomeRepo", async (t) => {
  const box = await sandbox(t);
  const url = await homeRepo(box);
  const home = join(box.home, ".local", "share", "agent-brain", "home");

  const { stdout } = installOk(box, { flags: ["--home-repo", url] });

  assert.match(stdout, /starter premises as candidates/u);
  assert.deepEqual(JSON.parse(await readFile(join(home, "brain.config.json"), "utf8")), { scopes: {} });
  assert.equal(execFileSync("git", ["-C", home, "remote", "get-url", "origin"], { encoding: "utf8" }).trim(), url);
});

test("TestInstallStopsOnHomeWithAnotherOrigin", async (t) => {
  const box = await sandbox(t);
  installOk(box);
  const url = await homeRepo(box);

  const { code, stderr } = run(box, "install.sh", { flags: ["--home-repo", url] });

  assert.equal(code, 1);
  assert.match(stderr, /its origin is not set, not .*home-repo\.git\. Move the folder, or run without --home-repo\./u);
});
