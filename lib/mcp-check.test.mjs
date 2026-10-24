import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { checkMCP } from "./mcp-check.mjs";
import { premiseTools } from "./mcp.mjs";

const repo = fileURLToPath(new URL("..", import.meta.url));

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "brain-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(join(repo, "lib"), join(root, "lib"), { recursive: true });
  await cp(join(repo, "bin"), join(root, "bin"), { recursive: true });
  await cp(join(repo, "package.json"), join(root, "package.json"));
  await cp(join(repo, "pnpm-lock.yaml"), join(root, "pnpm-lock.yaml"));
  await symlink(join(repo, "node_modules"), join(root, "node_modules"), "dir");
  return root;
}

test("TestCheckMCPUsesRealTransport", async (t) => {
  const root = await fixture(t);
  const got = await checkMCP({ env: { ...process.env, BRAIN_ROOT: root } });
  assert.match(got.version, /^0\.1\.0\+[a-f0-9]{12}$/);
  assert.ok(got.tools.includes("premise_seen"));
  assert.equal(got.tools.length, 7);
});

test("TestCheckRejectsDifferentBuild", async (t) => {
  const root = await fixture(t);
  const path = join(root, "lib", "scope.mjs");
  await writeFile(path, `${await readFile(path, "utf8")}\n// Another build.\n`);
  await assert.rejects(checkMCP({ args: [join(root, "bin", "brain.mjs"), "mcp"], env: { ...process.env, BRAIN_ROOT: root } }), /version|build|drift/i);
});

test("TestCheckRejectsWrongToolList", async (t) => {
  const root = await fixture(t);
  const code = `
    import { Server } from '@modelcontextprotocol/sdk/server/index.js';
    import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
    import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
    import { premiseTools, serverInfo } from ${JSON.stringify(pathToFileURL(join(repo, "lib", "mcp.mjs")).href)};
    const server = new Server(serverInfo, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: premiseTools.slice(1) }));
    await server.connect(new StdioServerTransport());
  `;
  await assert.rejects(checkMCP({ args: ["--input-type=module", "-e", code], env: { ...process.env, BRAIN_ROOT: root } }), /contract drift/i);
});

test("TestRunningMCPRejectsOldCode", async (t) => {
  const root = await fixture(t);
  const client = new Client({ name: "drift-test", version: "1" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(root, "bin", "brain.mjs"), "mcp"], env: { ...process.env, BRAIN_ROOT: root }, stderr: "pipe" });
  await client.connect(transport);
  t.after(() => client.close());
  const before = await client.callTool({ name: "premise_list", arguments: {} });
  assert.notEqual(before.isError, true);
  const path = join(root, "lib", "scope.mjs");
  await writeFile(path, `${await readFile(path, "utf8")}\n// Code changed after startup.\n`);
  const after = await client.callTool({ name: "premise_list", arguments: {} });
  assert.equal(after.isError, true);
  assert.match(after.content[0].text, /reconnect/i);
});

test("TestCLIAndMCPShareScopedRules", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, "brain.config.json"), JSON.stringify({ scopes: { personal: {}, work: {} } }));
  const script = join(repo, "bin", "brain.mjs");
  const env = { ...process.env, BRAIN_ROOT: root };
  const cli = (...args) => spawnSync(process.execPath, [script, "premise", ...args], { env, encoding: "utf8", timeout: 5000 });
  for (const [id, scope, status] of [["personal-rule", "personal", "active"], ["work-rule", "work", "active"], ["global-rule", "*", "active"], ["maybe-rule", "personal", "candidate"]]) {
    const target = id === "global-rule" ? "*" : "same-name";
    const added = cli("add", id, "--id", id, "--strength", "always", "--scope", scope, "--repo", target, "--status", status);
    assert.equal(added.status, 0, added.stderr);
  }
  const client = new Client({ name: "parity-test", version: "1" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [script, "mcp"], env, stderr: "pipe" }));
  t.after(() => client.close());
  for (const scope of ["personal", "work", ""]) {
    for (const status of ["active", "candidate"]) {
      const listed = cli("list", "--repo", "same-name", "--scope", scope, "--status", status);
      assert.equal(listed.status, 0, listed.stderr);
      const response = await client.callTool({ name: "premise_list", arguments: { repo: "same-name", scope, status } });
      const items = JSON.parse(response.content[0].text);
      const expected = status === "candidate"
        ? (scope === "personal" ? ["maybe-rule"] : [])
        : ["global-rule", ...(scope ? [`${scope}-rule`] : [])];
      assert.deepEqual(items.map((p) => p.id), expected);
      const lines = items.map((p) => `${p.id}\t${p.scope}\t${p.strength}\t${p.text}\n`).join("");
      assert.equal(lines, listed.stdout);
    }
  }
  const invalid = cli("add", "Invalid", "--strength", "always", "--scope", "unknown", "--repo", "same-name");
  assert.equal(invalid.status, 1);
  await assert.rejects(client.callTool({ name: "premise_add", arguments: { text: "Invalid", strength: "always", scope: "unknown", repos: ["same-name"] } }), /scope/);
  await client.callTool({ name: "premise_seen", arguments: { id: "maybe-rule", repo: "same-name", origin: "correction", date: "2026-10-24" } });
  const promoted = cli("promote", "maybe-rule");
  assert.equal(promoted.status, 0, promoted.stderr);
  const got = JSON.parse((await client.callTool({ name: "premise_get", arguments: { id: "maybe-rule" } })).content[0].text);
  assert.equal(got.status, "active");
  assert.deepEqual(got.seen, ["2026-10-24 same-name correction"]);
  await client.callTool({ name: "premise_delete", arguments: { id: "maybe-rule" } });
  assert.equal(cli("show", "maybe-rule").status, 1);
  assert.match(await readFile(join(root, "memory", "dropped", "maybe-rule.md"), "utf8"), /status: dropped/);
  await checkMCP({ env });
});

test("TestCatalogListsEveryMCPTool", async () => {
  const catalog = await readFile(join(repo, "docs", "catalog.md"), "utf8");
  const row = catalog.split("\n").find((line) => line.startsWith("| `brain-premises` |"));
  const names = row.split("|")[2].match(/`([^`]+)`/g).map((name) => name.slice(1, -1));
  assert.deepEqual(names.sort(), premiseTools.map((tool) => tool.name).sort());
});
