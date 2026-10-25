import assert from "node:assert/strict";
import { once } from "node:events";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { callPremiseTool } from "./mcp.mjs";

test("TestMCPAddAndList", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "brain-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const previous = process.env.BRAIN_ROOT;
  process.env.BRAIN_ROOT = root;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.BRAIN_ROOT;
      return;
    }
    process.env.BRAIN_ROOT = previous;
  });

  await assert.rejects(
    callPremiseTool("premise_add", { text: "Rule without a repo", strength: "always", scope: "*" }),
    /repos/u,
  );

  const addRes = await callPremiseTool("premise_add", {
    text: "New RPC lands in service-a",
    strength: "always",
    scope: "*",
    repos: ["repo-a"],
  });
  assert.equal(addRes.isError, false, addRes.text);

  await assert.rejects(callPremiseTool("premise_update", { id: "new-rpc-lands-in-service-a", repos: [] }), /repos/u);

  const listRes = await callPremiseTool("premise_list", {});
  assert.equal(listRes.isError, false, listRes.text);

  const items = JSON.parse(listRes.text);
  assert.equal(items.length, 1);
  const got = items[0];
  assert.equal(got.id, "new-rpc-lands-in-service-a");
  assert.equal(got.text, "New RPC lands in service-a");
  assert.equal(got.strength, "always");
  assert.equal(got.status, "active");
  assert.deepEqual(got.repos, ["repo-a"]);
});

test("TestMCPCandidate", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "brain-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const previous = process.env.BRAIN_ROOT;
  process.env.BRAIN_ROOT = root;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.BRAIN_ROOT;
      return;
    }
    process.env.BRAIN_ROOT = previous;
  });

  await callPremiseTool("premise_add", {
    id: "maybe",
    text: "Maybe rule",
    strength: "never",
    scope: "*",
    repos: ["*"],
    status: "candidate",
  });
  assert.deepEqual(JSON.parse((await callPremiseTool("premise_list", {})).text), []);
  const seen = await callPremiseTool("premise_seen", {
    id: "maybe",
    repo: "repo-a",
    origin: "defect",
    date: "2026-10-24",
  });
  assert.equal(seen.isError, false, seen.text);
  const [got] = JSON.parse((await callPremiseTool("premise_list", { status: "candidate" })).text);
  assert.deepEqual(got.seen, ["2026-10-24 repo-a defect"]);
  await callPremiseTool("premise_update", { id: "maybe", status: "active" });
  assert.equal(JSON.parse((await callPremiseTool("premise_list", {})).text).length, 1);
});

test("TestMCPRejectsUnknownScope", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "brain-mcp-scope-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const previous = process.env.BRAIN_ROOT;
  process.env.BRAIN_ROOT = root;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.BRAIN_ROOT;
      return;
    }
    process.env.BRAIN_ROOT = previous;
  });
  await writeFile(join(root, "brain.config.json"), JSON.stringify({ scopes: { personal: {} } }));
  const rule = { id: "scoped", text: "Scoped rule", strength: "always", scope: "unknown", repos: ["repo-a"] };
  await assert.rejects(callPremiseTool("premise_add", rule), /scope/u);
  await callPremiseTool("premise_add", { ...rule, scope: "personal" });
  await assert.rejects(callPremiseTool("premise_update", { id: rule.id, scope: "unknown" }), /scope/u);
  const got = JSON.parse((await callPremiseTool("premise_get", { id: rule.id })).text);
  assert.equal(got.scope, "personal");
});

test("TestMCPChecksAdvertisedInputs", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "brain-mcp-inputs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const previous = process.env.BRAIN_ROOT;
  process.env.BRAIN_ROOT = root;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.BRAIN_ROOT;
      return;
    }
    process.env.BRAIN_ROOT = previous;
  });
  await assert.rejects(callPremiseTool("premise_list", { status: "dropped" }), /status/u);
  await assert.rejects(callPremiseTool("premise_list", { scop: "personal" }), /scop|additional/u);
  await callPremiseTool("premise_add", { id: "rule", text: "Rule", strength: "always", scope: "*", repos: ["*"] });
  await assert.rejects(callPremiseTool("premise_seen", { id: "rule", origin: "correction" }), /repo/u);
  const got = JSON.parse((await callPremiseTool("premise_get", { id: "rule" })).text);
  assert.deepEqual(got.seen, []);
});

test("TestMCPGetReturnsBody", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "brain-mcp-body-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const previous = process.env.BRAIN_ROOT;
  process.env.BRAIN_ROOT = root;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.BRAIN_ROOT;
      return;
    }
    process.env.BRAIN_ROOT = previous;
  });
  await callPremiseTool("premise_add", { id: "rule", text: "Rule", strength: "always", scope: "*", repos: ["*"] });
  await appendFile(join(root, "memory", "premises", "rule.md"), "\nWhy: a reason.\n\nSkip generated files.\n");
  const got = JSON.parse((await callPremiseTool("premise_get", { id: "rule" })).text);
  assert.equal(got.body, "Why: a reason.\n\nSkip generated files.");
  const [listed] = JSON.parse((await callPremiseTool("premise_list", {})).text);
  assert.equal(Object.hasOwn(listed, "body"), false);
});

test("TestMCPAddReportsModelFailure", async (t) => {
  const model = createServer((req, res) => {
    req.resume();
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "model not found" }));
  });
  model.listen(0, "127.0.0.1");
  await once(model, "listening");
  t.after(() => model.close());
  const root = await mkdtemp(join(tmpdir(), "brain-mcp-model-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const previous = process.env.BRAIN_ROOT;
  process.env.BRAIN_ROOT = root;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.BRAIN_ROOT;
      return;
    }
    process.env.BRAIN_ROOT = previous;
  });
  const url = `http://127.0.0.1:${model.address().port}/v1/systemone`;
  await writeFile(join(root, "brain.config.json"), JSON.stringify({ decide: { model: "test-model", url } }));
  const rule = { strength: "always", scope: "*", repos: ["*"] };
  await callPremiseTool("premise_add", { ...rule, id: "first", text: "First rule" });

  const res = await callPremiseTool("premise_add", { ...rule, id: "second", text: "Second rule" });
  assert.equal(res.isError, false, res.text);
  const got = JSON.parse(res.text);
  assert.equal(got.id, "second");
  assert.equal(got.repeat_error, "model not found");
  assert.equal(JSON.parse((await callPremiseTool("premise_list", {})).text).length, 2);
});
