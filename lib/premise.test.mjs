import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
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
    scope: "*",
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
    scope: "*",
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
    scope: "*",
    repos: ["*"],
    status: "active",
  });
  await store.add({
    id: "cluster-only",
    text: "New RPC lands in service-a",
    strength: "always",
    scope: "*",
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
  await assert.rejects(
    store.add({ id: "../dropped", text: "Path escape", strength: "never", scope: "*", repos: ["*"], status: "active" }),
  );
  await assert.rejects(
    store.add({ id: "foo/bar", text: "Path escape", strength: "never", scope: "*", repos: ["*"], status: "active" }),
  );
  assert.deepEqual(await filesOutsideMemory(root), []);
  assert.equal(await countFiles(root), 0);
});

test("TestRejectSecretText", async (t) => {
  const { store, root } = await openStore(t);
  await assert.rejects(
    store.add({ text: "api_key=abcdefghij123456", strength: "never", scope: "*", repos: ["*"], status: "active" }),
  );
  assert.equal(await countFiles(root), 0);

  await assert.rejects(
    store.add({ text: "-----BEGIN PRIVATE KEY-----", strength: "never", scope: "*", repos: ["*"], status: "active" }),
  );
  assert.equal(await countFiles(root), 0);
});

test("TestSearch", async (t) => {
  const { store } = await openStore(t);
  await store.add({
    text: "New RPC lands in Service-A",
    strength: "always",
    scope: "*",
    repos: ["repo-a"],
    status: "active",
  });
  await store.add({ text: "Keep handlers small", strength: "prefer", scope: "*", repos: ["*"], status: "active" });

  const got = await store.search("service-a");
  assert.equal(got.length, 1);
  assert.equal(got[0].text, "New RPC lands in Service-A");
});

test("TestSearchScopeStatusAndID", async (t) => {
  const { store, root } = await openStore(t);
  await writeFile(join(root, "brain.config.json"), JSON.stringify({ scopes: { personal: {}, work: {} } }));
  for (const [id, scope, repos, status] of [
    ["global-rule", "*", ["*"], "active"],
    ["personal-rule", "personal", ["same-name"], "active"],
    ["work-rule", "work", ["same-name"], "active"],
    ["other-rule", "personal", ["other-repo"], "active"],
    ["maybe-rule", "personal", ["same-name"], "candidate"],
  ]) {
    await store.add({ id, text: "Review before publishing", strength: "always", scope, repos, status });
  }
  const ids = async (query, filters) => (await store.search(query, filters)).map((p) => p.id);
  const target = { repo: "same-name", scope: "personal" };
  assert.deepEqual(await ids("REVIEW", target), ["global-rule", "maybe-rule", "personal-rule"]);
  assert.deepEqual(await ids("Review", { ...target, status: "active" }), ["global-rule", "personal-rule"]);
  assert.deepEqual(await ids("Review", { ...target, status: "candidate" }), ["maybe-rule"]);
  assert.deepEqual(await ids("Review", { ...target, scope: "" }), ["global-rule"]);
  assert.deepEqual(await ids("PERSONAL-RULE"), ["personal-rule"]);
  assert.equal((await ids("Review")).length, 5);
});

test("TestAddCollision", async (t) => {
  const { store } = await openStore(t);
  const first = {
    text: "New RPC lands in service-a",
    strength: "always",
    scope: "*",
    repos: ["repo-a"],
    status: "active",
  };
  await store.add(first);
  await assert.rejects(store.add(first));
  const got = await store.list("");
  assert.equal(got.length, 1);
});

test("TestConcurrentAddKeepsOneRule", async (t) => {
  const { root, store } = await openStore(t);
  const stores = await Promise.all(Array.from({ length: 8 }, () => open(root)));
  const results = await Promise.allSettled(
    stores.map((other, i) =>
      other.add({ id: "shared-rule", text: `Rule from writer ${i}`, strength: "always", scope: "*", repos: ["*"] }),
    ),
  );
  const winners = results.filter((result) => result.status === "fulfilled");
  assert.equal(winners.length, 1);
  for (const result of results.filter((r) => r.status === "rejected")) {
    assert.equal(result.reason.code, "EEXIST");
  }
  assert.deepEqual(await store.get("shared-rule"), winners[0].value);
  assert.equal(await countFiles(root), 1);
});

test("TestUpdateKeepsID", async (t) => {
  const { store, root } = await openStore(t);
  await store.add({ id: "keep-id", text: "Old text", strength: "always", scope: "*", repos: ["*"], status: "active" });

  const updated = await store.update("keep-id", {
    id: "other-id",
    text: "New text",
    strength: "never",
    scope: "*",
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
  await store.add({ id: "kept", text: "Kept rule", strength: "always", scope: "*", repos: ["*"] });
  const dir = join(root, "memory", "premises");
  await writeFile(join(dir, "Untitled.md"), "");
  await writeFile(join(dir, "broken.md"), "no frontmatter\n");
  await writeFile(
    join(dir, "tagged.md"),
    '---\nid: tagged\ntext: Tagged rule\nstrength: never\nscope: "*"\ntags:\n  - review\nrepos:\n  - "*"\nstatus: active\n---\n',
  );

  const got = await store.list("");
  assert.deepEqual(
    got.map((p) => p.id),
    ["kept", "tagged"],
  );
  assert.deepEqual(got[1].repos, ["*"]);
});

test("TestRejectBadStrengthAndStatus", async (t) => {
  const { store, root } = await openStore(t);
  await assert.rejects(store.add({ text: "Maybe rule", strength: "maybe", repos: ["*"] }), /strength/u);
  await assert.rejects(
    store.add({ text: "Gone rule", strength: "always", scope: "*", repos: ["*"], status: "dropped" }),
    /status/u,
  );
  assert.equal(await countFiles(root), 0);
});

test("TestRejectSourceOutsideBrain", async (t) => {
  const { store, root } = await openStore(t);
  for (const source of [
    "~/.claude/projects/x/memory/a.md",
    "/abs/a.md",
    "../a.md",
    "engram #12",
    "skills/x/SKILL.md@abc",
  ]) {
    await assert.rejects(
      store.add({ text: "Rule", strength: "always", scope: "*", repos: ["*"], source }),
      /source/u,
      source,
    );
  }
  assert.equal(await countFiles(root), 0);
  await store.add({ text: "Rule", strength: "always", scope: "*", repos: ["*"], source: "memory/decisions/note.md" });
});

test("TestUpdateKeepsOmittedFields", async (t) => {
  const { store } = await openStore(t);
  await store.add({
    id: "keep-fields",
    text: "Old text",
    strength: "always",
    scope: "*",
    repos: ["repo-b"],
    source: "memory/decisions/note.md",
  });

  await store.update("keep-fields", { text: "New text" });

  const got = await store.get("keep-fields");
  assert.equal(got.text, "New text");
  assert.equal(got.strength, "always");
  assert.deepEqual(got.repos, ["repo-b"]);
  assert.equal(got.source, "memory/decisions/note.md");
  await assert.rejects(store.update("keep-fields", { strength: "maybe" }), /strength/u);
});

test("TestUpdateAndDeleteKeepNotes", async (t) => {
  const { store, root } = await openStore(t);
  await store.add({ id: "annotated", text: "Old rule", strength: "always", scope: "*", repos: ["repo-a", "repo-b"] });
  const path = join(root, "memory", "premises", "annotated.md");
  const original = (await readFile(path, "utf8"))
    .replace(
      "strength: always",
      "# Keep this metadata\ntags:\n  - review\nevidence:\n  text: Supporting evidence\n  scope: unrelated-metadata\nstrength: always",
    )
    .concat("\n# Context\n\nKeep this explanation.\n\n---\nstatus: body text\n")
    .replaceAll("\n", "\r\n");
  await writeFile(path, original);

  await store.update("annotated", { text: "New rule" });
  assert.equal(await readFile(path, "utf8"), original.replace("Old rule", "New rule"));
  assert.equal((await store.get("annotated")).text, "New rule");
  assert.equal((await store.get("annotated")).scope, "*");
  await store.update("annotated", { repos: ["repo-c"] });
  const expected = original.replace("Old rule", "New rule").replace("  - repo-a\r\n  - repo-b", "  - repo-c");
  assert.equal(await readFile(path, "utf8"), expected);
  assert.deepEqual((await store.get("annotated")).repos, ["repo-c"]);

  await store.delete("annotated");
  assert.equal(
    await readFile(join(root, "memory", "dropped", "annotated.md"), "utf8"),
    expected.replace("status: active", "status: dropped"),
  );
});

test("TestDeleteKeepsEarlierArchive", async (t) => {
  const { store, root } = await openStore(t);
  await store.add({ id: "reused", text: "Original rule", strength: "always", scope: "*", repos: ["*"] });
  await store.delete("reused");
  const path = join(root, "memory", "dropped", "reused.md");
  const archive = await readFile(path, "utf8");
  await store.add({ id: "reused", text: "Replacement rule", strength: "never", scope: "*", repos: ["*"] });

  await store.delete("reused");
  assert.equal(await readFile(path, "utf8"), archive);
  await assert.rejects(store.get("reused"), { code: "ENOENT" });
  const archives = await readdir(join(root, "memory", "dropped"));
  assert.equal(archives.length, 2);
  const replacement = archives.find((name) => name !== "reused.md");
  assert.match(await readFile(join(root, "memory", "dropped", replacement), "utf8"), /text: Replacement rule/u);
});

test("TestRequireRepoScope", async (t) => {
  const { store, root } = await openStore(t);
  for (const repos of [undefined, [], [""], ["  "], [3], "repo-a"]) {
    await assert.rejects(store.add({ id: "scoped", text: "Rule", strength: "always", scope: "*", repos }), /repos/u);
  }
  assert.equal(await countFiles(root), 0);
  await store.add({ id: "scoped", text: "Rule", strength: "always", scope: "*", repos: ["*"] });
  await assert.rejects(store.update("scoped", { repos: [] }), /repos/u);
  assert.equal((await store.list("repo-a")).length, 1);
});

test("TestCandidateHiddenUntilPromoted", async (t) => {
  const { store } = await openStore(t);
  await store.add({
    id: "maybe-rule",
    text: "Maybe rule",
    strength: "always",
    scope: "*",
    repos: ["*"],
    status: "candidate",
  });
  assert.deepEqual(await store.list(""), []);
  assert.deepEqual(
    (await store.list("", null, "candidate")).map((p) => p.id),
    ["maybe-rule"],
  );

  await store.see("maybe-rule", "2026-10-20 repo-a correction");
  await store.see("maybe-rule", "2026-10-24 repo-b correction");
  assert.deepEqual((await store.get("maybe-rule")).seen, [
    "2026-10-20 repo-a correction",
    "2026-10-24 repo-b correction",
  ]);
  await assert.rejects(store.see("maybe-rule", "yesterday repo-a correction"), /seen/u);
  await assert.rejects(store.see("maybe-rule", "2026-10-24 repo-a guess"), /seen/u);
  await assert.rejects(store.see("maybe-rule", "2026-13-01 repo-a correction"), /real date/u);
  await assert.rejects(store.see("maybe-rule", "2026-02-30 repo-a correction"), /real date/u);

  await store.update("maybe-rule", { status: "active" });
  assert.deepEqual(
    (await store.list("")).map((p) => p.id),
    ["maybe-rule"],
  );
  assert.deepEqual((await store.get("maybe-rule")).seen.length, 2);
});

test("TestActivePremiseHasNoSeenField", async (t) => {
  const { store, root } = await openStore(t);
  await store.add({ id: "plain", text: "Plain rule", strength: "never", scope: "*", repos: ["*"] });
  const text = await readFile(join(root, "memory", "premises", "plain.md"), "utf8");
  assert.ok(!text.includes("seen"));
});

test("TestScopeMustExistInConfig", async (t) => {
  const { store, root } = await openStore(t);
  const config = join(root, "brain.config.json");
  await writeFile(config, JSON.stringify({ scopes: { personal: {} } }));
  const rule = { id: "known-scope", text: "Scoped rule", strength: "always", scope: "unknown", repos: ["repo-a"] };
  await assert.rejects(store.add(rule), /scope/u);
  await store.add({ ...rule, scope: "personal" });
  const path = join(root, "memory", "premises", "known-scope.md");
  const original = await readFile(path, "utf8");
  await assert.rejects(store.update(rule.id, { scope: "unknown" }), /scope/u);
  assert.equal(await readFile(path, "utf8"), original);
  await writeFile(config, JSON.stringify({ scopes: { personal: {}, work: {} } }));
  assert.equal((await store.update(rule.id, { scope: "work" })).scope, "work");
});

test("TestSearchFindsCandidates", async (t) => {
  const { store } = await openStore(t);
  await store.add({
    id: "maybe-scope",
    text: "Scope update RPCs by account",
    strength: "always",
    scope: "*",
    repos: ["*"],
    status: "candidate",
  });
  assert.deepEqual(
    (await store.search("account")).map((p) => p.id),
    ["maybe-scope"],
  );
});
