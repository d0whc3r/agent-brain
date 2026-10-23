import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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

  await assert.rejects(callPremiseTool("premise_add", {
    text: "Rule without a repo",
    strength: "always", scope: "*",
  }), /repos/);

  const addRes = await callPremiseTool("premise_add", {
    text: "New RPC lands in service-a",
    strength: "always", scope: "*",
    repos: ["repo-a"],
  });
  assert.equal(addRes.isError, false, addRes.text);

  await assert.rejects(callPremiseTool("premise_update", {
    id: "new-rpc-lands-in-service-a",
    repos: [],
  }), /repos/);

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
