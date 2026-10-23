import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { readdir } from "node:fs/promises";
import test from "node:test";

import { open } from "./premise.mjs";

async function openStore(t) {
  const root = await mkdtemp(join(tmpdir(), "brain-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = await open(root);
  return { store, root };
}

async function countFiles(root) {
  let n = 0;
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      n += 1;
    }
  }
  await walk(root);
  return n;
}

async function filesOutsideMemory(root) {
  const out = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      const rel = relative(root, path);
      if (rel === "memory" || rel.startsWith(`memory${sep}`)) {
        continue;
      }
      out.push(rel);
    }
  }
  await walk(root);
  return out;
}

test("TestAddAndList", async (t) => {
  const { store, root } = await openStore(t);
  const added = await store.add({
    text: "New RPC lands in service-a",
    strength: "always",
    repos: ["repo-a"],
    status: "active",
  });
  assert.equal(added.id, "new-rpc-lands-in-service-a");
  await writeFile(join(root, "memory", "premises", ".gitkeep"), "");

  const got = await store.list("");
  assert.equal(got.length, 1);
  assert.equal(got[0].text, "New RPC lands in service-a");
});

test("TestDeleteMovesAndHides", async (t) => {
  const { store, root } = await openStore(t);
  const added = await store.add({
    text: "New RPC lands in service-a",
    strength: "always",
    repos: ["repo-a"],
    status: "active",
  });
  await store.delete(added.id);

  const got = await store.list("");
  assert.equal(got.length, 0);

  const dropped = await readFile(join(root, "memory", "dropped", `${added.id}.md`), "utf8");
  assert.ok(dropped.includes("\nstatus: dropped\n"));
  await assert.rejects(stat(join(root, "memory", "premises", `${added.id}.md`)), { code: "ENOENT" });
});

test("TestListRepoFilter", async (t) => {
  const { store } = await openStore(t);
  await store.add({
    id: "all-repos",
    text: "Applies to every repo",
    strength: "always",
    repos: ["*"],
    status: "active",
  });
  await store.add({
    id: "cluster-only",
    text: "New RPC lands in service-a",
    strength: "always",
    repos: ["repo-a"],
    status: "active",
  });

  const got = await store.list("repo-b");
  assert.equal(got.length, 1);
  assert.equal(got[0].id, "all-repos");
  assert.deepEqual(got[0].repos, ["*"]);
});

test("TestRejectPathID", async (t) => {
  const { store, root } = await openStore(t);
  await assert.rejects(store.add({
    id: "../dropped",
    text: "Path escape",
    strength: "never",
    repos: ["*"],
    status: "active",
  }));
  await assert.rejects(store.add({
    id: "foo/bar",
    text: "Path escape",
    strength: "never",
    repos: ["*"],
    status: "active",
  }));
  assert.deepEqual(await filesOutsideMemory(root), []);
  assert.equal(await countFiles(root), 0);
});

test("TestRejectSecretText", async (t) => {
  const { store, root } = await openStore(t);
  await assert.rejects(store.add({
    text: "api_key=abcdefghij123456",
    strength: "never",
    repos: ["*"],
    status: "active",
  }));
  assert.equal(await countFiles(root), 0);

  await assert.rejects(store.add({
    text: "-----BEGIN PRIVATE KEY-----",
    strength: "never",
    repos: ["*"],
    status: "active",
  }));
  assert.equal(await countFiles(root), 0);
});

test("TestSearch", async (t) => {
  const { store } = await openStore(t);
  await store.add({
    text: "New RPC lands in Service-A",
    strength: "always",
    repos: ["repo-a"],
    status: "active",
  });
  await store.add({
    text: "Keep handlers small",
    strength: "prefer",
    repos: ["*"],
    status: "active",
  });

  const got = await store.search("service-a");
  assert.equal(got.length, 1);
  assert.equal(got[0].text, "New RPC lands in Service-A");
});

test("TestAddCollision", async (t) => {
  const { store } = await openStore(t);
  const first = {
    text: "New RPC lands in service-a",
    strength: "always",
    repos: ["repo-a"],
    status: "active",
  };
  await store.add(first);
  await assert.rejects(store.add(first));
  const got = await store.list("");
  assert.equal(got.length, 1);
});

test("TestUpdateKeepsID", async (t) => {
  const { store, root } = await openStore(t);
  await store.add({
    id: "keep-id",
    text: "Old text",
    strength: "always",
    repos: ["*"],
    status: "active",
  });

  const updated = await store.update("keep-id", {
    id: "other-id",
    text: "New text",
    strength: "never",
    repos: ["repo-b"],
    status: "active",
    source: "memory/decisions/note.md",
  });
  assert.equal(updated.id, "keep-id");
  assert.equal(updated.text, "New text");

  const got = await store.get("keep-id");
  assert.equal(got.id, "keep-id");
  assert.equal(got.text, "New text");
  assert.equal(got.strength, "never");
  await assert.rejects(stat(join(root, "memory", "premises", "other-id.md")), { code: "ENOENT" });
});

test("TestListSkipsForeignNotes", async (t) => {
  const { store, root } = await openStore(t);
  await store.add({ id: "kept", text: "Kept rule", strength: "always", repos: ["*"] });
  const dir = join(root, "memory", "premises");
  await writeFile(join(dir, "Untitled.md"), "");
  await writeFile(join(dir, "broken.md"), "no frontmatter\n");
  await writeFile(join(dir, "tagged.md"), "---\nid: tagged\ntext: Tagged rule\nstrength: never\ntags:\n  - review\nrepos:\n  - \"*\"\nstatus: active\n---\n");

  const got = await store.list("");
  assert.deepEqual(got.map((p) => p.id), ["kept", "tagged"]);
  assert.deepEqual(got[1].repos, ["*"]);
});

test("TestRejectBadStrengthAndStatus", async (t) => {
  const { store, root } = await openStore(t);
  await assert.rejects(store.add({ text: "Maybe rule", strength: "maybe", repos: ["*"] }), /strength/);
  await assert.rejects(store.add({ text: "Gone rule", strength: "always", repos: ["*"], status: "dropped" }), /status/);
  assert.equal(await countFiles(root), 0);
});

test("TestUpdateKeepsOmittedFields", async (t) => {
  const { store } = await openStore(t);
  await store.add({
    id: "keep-fields",
    text: "Old text",
    strength: "always",
    repos: ["repo-b"],
    source: "memory/decisions/note.md",
  });

  await store.update("keep-fields", { text: "New text" });

  const got = await store.get("keep-fields");
  assert.equal(got.text, "New text");
  assert.equal(got.strength, "always");
  assert.deepEqual(got.repos, ["repo-b"]);
  assert.equal(got.source, "memory/decisions/note.md");
  await assert.rejects(store.update("keep-fields", { strength: "maybe" }), /strength/);
});
