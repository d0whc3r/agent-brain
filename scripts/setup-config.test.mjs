import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { dropTables, guardRules, setCodexHook, setGuards, setHook, tomlTable } from "./setup-config.mjs";

test("TestSetHookReplacesOnlyBrainHook", () => {
  const other = { type: "command", command: "other-hook" };
  const settings = {
    model: "opus",
    hooks: {
      SessionStart: [
        { matcher: "startup", hooks: [other] },
        { hooks: [{ type: "command", command: "node /old/bin/session-premises.mjs" }] },
      ],
    },
  };

  const added = setHook(settings, "node /new/bin/session-premises.mjs");
  assert.equal(added.model, "opus");
  assert.equal(added.hooks.SessionStart.length, 2);
  assert.deepEqual(added.hooks.SessionStart[0].hooks, [other]);
  assert.equal(added.hooks.SessionStart[1].hooks[0].command, "node /new/bin/session-premises.mjs");
  assert.deepEqual(setHook(added, "node /new/bin/session-premises.mjs"), added);

  const removed = setHook(added, "");
  assert.deepEqual(removed.hooks.SessionStart, [{ matcher: "startup", hooks: [other] }]);
});

test("TestSetCodexHookKeepsOtherHooks", () => {
  const other = { type: "command", command: "herdr-state", timeout: 10 };
  const config = { hooks: { SessionStart: [{ hooks: [other] }] } };
  const command = "node /brain/bin/session-premises.mjs 2>/dev/null || true";

  const added = setCodexHook(config, command);
  assert.equal(added.hooks.SessionStart.length, 2);
  assert.deepEqual(added.hooks.SessionStart[0].hooks, [other]);
  assert.equal(added.hooks.SessionStart[1].hooks[0].command, command);
  assert.equal(added.hooks.SessionStart[1].hooks[0].timeout, 10);
  assert.deepEqual(setCodexHook(added, command), added);

  const removed = setCodexHook(added, "");
  assert.deepEqual(removed.hooks.SessionStart, [{ hooks: [other] }]);
});

test("TestCodexTables", () => {
  const text = [
    "[mcp_servers.keep]",
    'command = "a"',
    "",
    "[mcp_servers.brain-premises]",
    'command = "old"',
    "",
    "[mcp_servers.brain-premises.env]",
    'BRAIN_ROOT = "/old"',
    "",
    "[features]",
    "x = true",
    "",
  ].join("\n");

  const out = dropTables(text, ["brain-premises"]);
  assert.equal(out.includes("brain-premises"), false);
  assert.equal(out.includes("[mcp_servers.keep]"), true);
  assert.equal(out.includes("[features]"), true);

  const table = tomlTable("demo", { command: "cmd", args: ["-y", "x"], env: { K: "v" } });
  assert.equal(
    table,
    '[mcp_servers.demo]\ntype = "stdio"\ncommand = "cmd"\nargs = ["-y", "x"]\n\n[mcp_servers.demo.env]\nK = "v"',
  );
});

test("TestDropKeepsOtherTomlTables", () => {
  const removed = '[mcp_servers.brain-premises] # old server\ncommand = "old"\n';
  const kept = '[features] # user settings\nx = true\n\n[[agents]]\nname = "kept"\n';
  assert.equal(dropTables(removed + kept, ["brain-premises"]), kept);
  assert.equal(
    dropTables(removed.replace(" # old server", "") + kept.slice(kept.indexOf("[[agents]]")), ["brain-premises"]),
    '[[agents]]\nname = "kept"\n',
  );
});

test("TestInstallCreatesConfig", async (t) => {
  const { home, invoke } = await configHome(t);
  const settings = join(home, ".claude", "settings.json");
  const codex = join(home, ".codex", "config.toml");
  invoke("hook-add", "node /brain/bin/session-premises.mjs");
  invoke("codex-add");
  const hookText = await readFile(settings, "utf8");
  const codexText = await readFile(codex, "utf8");
  assert.equal(JSON.parse(hookText).hooks.SessionStart[0].hooks[0].command, "node /brain/bin/session-premises.mjs");
  assert.match(codexText, /\[mcp_servers\.brain-premises\]/u);
  assert.match(codexText, /\[mcp_servers\.chrome-devtools\]/u);

  invoke("hook-add", "node /brain/bin/session-premises.mjs");
  invoke("codex-add");
  assert.equal(await readFile(settings, "utf8"), hookText);
  assert.equal(await readFile(codex, "utf8"), codexText);
  assert.deepEqual(await readdir(join(home, ".claude")), ["settings.json"]);
  assert.deepEqual(await readdir(join(home, ".codex")), ["config.toml"]);
});

test("TestHooksApplyWritesThreeTools", async (t) => {
  const { home, invoke } = await configHome(t);
  const plugins = join(home, ".config", "opencode", "plugins");
  await mkdir(plugins, { recursive: true });
  const codexHooks = join(home, ".codex", "hooks.json");
  await mkdir(join(home, ".codex"), { recursive: true });
  await writeFile(
    codexHooks,
    `${JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "herdr-state", timeout: 10 }] }] } }, null, 2)}\n`,
  );

  const first = invoke("hooks-apply");
  const settings = JSON.parse(await readFile(join(home, ".claude", "settings.json"), "utf8"));
  const codex = JSON.parse(await readFile(codexHooks, "utf8"));
  const link = join(plugins, "brain-session-premises.js");
  const command = settings.hooks.SessionStart[0].hooks[0].command;
  assert.match(command, /session-premises\.mjs 2>\/dev\/null \|\| true$/u);
  assert.equal(codex.hooks.SessionStart[0].hooks[0].command, "herdr-state");
  assert.equal(codex.hooks.SessionStart[1].hooks[0].command, command);
  assert.equal(await readlink(link), fileURLToPath(new URL("../hooks/opencode/session-premises.js", import.meta.url)));
  assert.match(first, new RegExp(`^added session premises hook to ${join(home, ".claude", "settings.json")}$`, "mu"));
  assert.match(first, new RegExp(`^added session premises hook to ${codexHooks}$`, "mu"));
  assert.match(first, new RegExp(`^added ${link}$`, "mu"));

  const claudeText = await readFile(join(home, ".claude", "settings.json"), "utf8");
  const codexText = await readFile(codexHooks, "utf8");
  const second = invoke("hooks-apply");
  assert.match(second, /unchanged/u);
  assert.equal(await readFile(join(home, ".claude", "settings.json"), "utf8"), claudeText);
  assert.equal(await readFile(codexHooks, "utf8"), codexText);

  const removed = invoke("hooks-remove");
  assert.match(removed, new RegExp(`^removed session premises hook from ${codexHooks}$`, "mu"));
  assert.match(removed, new RegExp(`^removed ${link}$`, "mu"));
  const after = JSON.parse(await readFile(codexHooks, "utf8"));
  assert.deepEqual(after.hooks.SessionStart, [{ hooks: [{ type: "command", command: "herdr-state", timeout: 10 }] }]);
  assert.equal(
    JSON.parse(await readFile(join(home, ".claude", "settings.json"), "utf8")).hooks?.SessionStart,
    undefined,
  );
  await assert.rejects(readlink(link));
});

test("TestRemoveSkipsMissingConfig", async (t) => {
  const { home, invoke } = await configHome(t);
  invoke("hook-remove");
  invoke("codex-remove");
  assert.deepEqual(await readdir(home), []);
});

test("TestInstallKeepsConfigSymlink", async (t) => {
  const { home, invoke } = await configHome(t);
  await mkdir(join(home, ".codex"));
  const target = join(home, "shared.toml");
  const path = join(home, ".codex", "config.toml");
  const original = "[features] # keep this\nx = true\n";
  await writeFile(target, original);
  await symlink(target, path);

  invoke("codex-add");
  assert.equal(await readlink(path), target);
  assert.match(await readFile(target, "utf8"), /\[features\] # keep this\nx = true/u);
  assert.equal(await readFile(`${path}.brain-bak`, "utf8"), original);
  invoke("codex-remove");
  assert.equal(await readFile(target, "utf8"), original);
});

async function configHome(t) {
  const home = await mkdtemp(join(tmpdir(), "brain-config-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const script = fileURLToPath(new URL("./setup-config.mjs", import.meta.url));
  const call = (env, args) =>
    execFileSync(process.execPath, [script, ...args], {
      env: { ...process.env, HOME: home, ...env },
      encoding: "utf8",
    });
  const invoke = (...args) => call({}, args);
  const dryRun = (...args) => call({ BRAIN_DRY_RUN: "1" }, args);
  return { home, invoke, dryRun };
}

test("TestConfigLinesNameTheEntry", async (t) => {
  const { home, invoke } = await configHome(t);
  const settings = join(home, ".claude", "settings.json");
  const agents = join(home, ".codex", "AGENTS.md");

  assert.equal(invoke("guard-add"), `added git confirmation rules to ${settings}\n`);
  assert.equal(invoke("guard-add"), `unchanged git confirmation rules in ${settings}\n`);
  assert.equal(invoke("guard-remove"), `removed git confirmation rules from ${settings}\n`);
  assert.equal(invoke("guard-remove"), `unchanged git confirmation rules in ${settings}\n`);
  await mkdir(dirname(agents));
  await writeFile(agents, "# mine\n");
  assert.equal(invoke("instructions-add", agents), `added brain instructions to ${agents}\n`);
  await writeFile(agents, (await readFile(agents, "utf8")).replace("<!-- brain:end -->", "old\n<!-- brain:end -->"));
  assert.equal(invoke("instructions-add", agents), `updated brain instructions in ${agents}\n`);
  assert.equal(invoke("instructions-remove", agents), `removed brain instructions from ${agents}\n`);
  assert.equal(await readFile(agents, "utf8"), "# mine\n");
});

test("TestCodexLinesNameEachServer", async (t) => {
  const { home, invoke } = await configHome(t);
  const codex = join(home, ".codex", "config.toml");
  const each = (status, prep) =>
    ["brain-premises", "chrome-devtools"].map((name) => `${status} MCP server ${name} ${prep} ${codex}\n`).join("");

  assert.equal(invoke("codex-add"), each("added", "to"));
  assert.equal(invoke("codex-add"), each("unchanged", "in"));
  await writeFile(codex, (await readFile(codex, "utf8")).replace("chrome-devtools-mcp@", "chrome-devtools-mcp-old@"));
  assert.equal(
    invoke("codex-add"),
    `unchanged MCP server brain-premises in ${codex}\nupdated MCP server chrome-devtools in ${codex}\n`,
  );
  assert.equal(invoke("codex-remove"), each("removed", "from"));
  assert.equal(invoke("codex-remove"), each("unchanged", "in"));
});

test("TestDryRunWritesNothing", async (t) => {
  const { home, dryRun } = await configHome(t);
  const plugins = join(home, ".config", "opencode", "plugins");
  await mkdir(plugins, { recursive: true });

  assert.match(dryRun("hooks-apply"), /^added session premises hook to /mu);
  assert.match(dryRun("guard-add"), /^added git confirmation rules to /u);
  assert.match(dryRun("codex-add"), /^added MCP server brain-premises to /u);
  assert.deepEqual(await readdir(home), [".config"]);
  assert.deepEqual(await readdir(plugins), []);
});

test("TestClaudeMcpState", async (t) => {
  const { home, invoke } = await configHome(t);
  const config = join(home, ".claude.json");

  assert.equal(invoke("claude-mcp-state", "brain-premises"), "missing\n");
  const server = JSON.parse(invoke("claude-json", "brain-premises"));
  await writeFile(config, JSON.stringify({ mcpServers: { "brain-premises": server } }));
  assert.equal(invoke("claude-mcp-state", "brain-premises"), "same\n");
  await writeFile(config, JSON.stringify({ mcpServers: { "brain-premises": { ...server, args: [] } } }));
  assert.equal(invoke("claude-mcp-state", "brain-premises"), "different\n");
});

test("TestSetGuardsKeepsOtherRules", () => {
  const settings = { model: "opus", permissions: { allow: ["Read"], ask: ["Bash(rm:*)", "Bash(git push:*)"] } };
  const added = setGuards(settings, true);
  assert.deepEqual(added.permissions.ask, ["Bash(rm:*)", ...guardRules]);
  assert.deepEqual(added.permissions.allow, ["Read"]);
  assert.deepEqual(setGuards(added, true), added);
  assert.deepEqual(setGuards(added, false).permissions, { allow: ["Read"], ask: ["Bash(rm:*)"] });
  assert.equal(setGuards({}, false).permissions.ask, undefined);
});

test("TestSetBlockKeepsUserText", async () => {
  const { setBlock } = await import("./setup-config.mjs");
  const added = setBlock("# mine\n", "rules");
  assert.equal(added, "# mine\n\n<!-- brain:start -->\nrules\n<!-- brain:end -->\n");
  assert.equal(setBlock(added, "rules"), added);
  assert.equal(setBlock(added, ""), "# mine\n");
  assert.equal(setBlock("", ""), "");
});

test("TestOpencodeAgentTurnsOffMissingTools", async () => {
  const { opencodeAgent } = await import("./setup-config.mjs");
  const out = opencodeAgent('---\nname: brain-x\ndescription: "Reads."\ntools: Read, Bash, Write\n---\nBody\n');
  assert.equal(out, '---\ndescription: "Reads."\nmode: subagent\ntools:\n  edit: false\n  write: true\n---\nBody\n');
});

function runConfig(home, ...args) {
  const script = fileURLToPath(new URL("./setup-config.mjs", import.meta.url));
  return spawnSync(process.execPath, [script, ...args], { env: { ...process.env, HOME: home }, encoding: "utf8" });
}

test("TestHooksSayWhyTheySkip", async (t) => {
  const { home, invoke } = await configHome(t);
  const plugin = join(home, ".config", "opencode", "plugins", "brain-session-premises.js");
  const other = join(home, "other", "session-premises.js");
  await mkdir(dirname(other), { recursive: true });
  await writeFile(other, "");

  assert.ok(invoke("hooks-apply").includes(`skipped ${plugin} (OpenCode is not installed)\n`));
  await mkdir(dirname(plugin), { recursive: true });
  await writeFile(plugin, "mine");
  assert.ok(invoke("hooks-apply").includes(`skipped ${plugin} (a file, not a link)\n`));
  assert.ok(invoke("hooks-remove").includes(`skipped ${plugin} (a file, not a link)\n`));
  assert.equal(await readFile(plugin, "utf8"), "mine");
  await rm(plugin);
  await symlink(other, plugin);
  assert.ok(invoke("hooks-remove").includes(`skipped ${plugin} (links to another checkout)\n`));
  assert.equal(await readlink(plugin), other);
});

test("TestSetupConfigNamesBrokenJson", async (t) => {
  const { home } = await configHome(t);
  const settings = join(home, ".claude", "settings.json");
  await mkdir(dirname(settings));
  await writeFile(settings, "{");

  for (const command of ["guard-add", "guard-remove", "hooks-apply", "hooks-remove"]) {
    const result = runConfig(home, command);
    assert.equal(result.status, 1, command);
    assert.ok(result.stderr.startsWith(`${settings} is not valid JSON: `), result.stderr);
    assert.doesNotMatch(result.stderr, /^\s+at /mu, "no stack trace");
  }
  assert.equal(await readFile(settings, "utf8"), "{");
});

test("TestSetupConfigPrintsUsage", async (t) => {
  const { home } = await configHome(t);

  for (const args of [[], ["nope"]]) {
    const result = runConfig(home, ...args);
    assert.equal(result.status, 1);
    assert.ok(result.stderr.startsWith("usage: setup-config.mjs "), result.stderr);
  }
  assert.deepEqual(await readdir(home), []);
});
