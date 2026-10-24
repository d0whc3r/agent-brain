import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { run } from "./brain.mjs";

async function invoke(args) {
  let stdout = "";
  let stderr = "";
  const code = await run(
    args,
    {
      write(chunk) {
        stdout += chunk;
      },
    },
    {
      write(chunk) {
        stderr += chunk;
      },
    },
  );
  return { code, stdout, stderr };
}

test("cli", { concurrency: 1 }, async (suite) => {
  await suite.test("TestCLIAddListRm", async (t) => {
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

    const unscoped = await invoke(["premise", "add", "Rule without a repo", "--strength", "always", "--scope", "*"]);
    assert.equal(unscoped.code, 2);
    assert.match(unscoped.stderr, /repos/u);

    let result = await invoke([
      "premise",
      "add",
      "New RPC lands in service-a",
      "--strength",
      "always",
      "--scope",
      "*",
      "--repo",
      "repo-a",
    ]);
    assert.equal(result.code, 0, result.stderr);

    result = await invoke(["premise", "list"]);
    assert.equal(result.code, 0, result.stderr);
    const want = "new-rpc-lands-in-service-a\t*\talways\tNew RPC lands in service-a\n";
    assert.equal(result.stdout, want);

    result = await invoke(["premise", "list", "--repo", "repo-a"]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, want);

    result = await invoke(["premise", "list", "--repo", "repo-b"]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "");

    result = await invoke(["premise", "rm", "new-rpc-lands-in-service-a"]);
    assert.equal(result.code, 0, result.stderr);

    result = await invoke(["premise", "list"]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.includes("New RPC lands in service-a"), false);
  });

  await suite.test("TestCLISecretExitCode", async (t) => {
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

    const result = await invoke([
      "premise",
      "add",
      "api_key=abcdefghij123456",
      "--strength",
      "never",
      "--scope",
      "*",
      "--repo",
      "*",
    ]);
    assert.equal(result.code, 2, result.stderr);
    assert.match(result.stderr, /secret/u);
  });

  await suite.test("TestCLIScopeRequired", async (t) => {
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
    await writeFile(join(root, "brain.config.json"), JSON.stringify({ scopes: { work: { owners: ["org"] } } }));

    let result = await invoke(["premise", "add", "Work rule", "--strength", "always", "--repo", "*"]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /--scope work, "\*"/u);
    result = await invoke(["premise", "add", "Work rule", "--strength", "always", "--scope", "home", "--repo", "*"]);
    assert.equal(result.code, 1);
    result = await invoke(["premise", "add", "Work rule", "--strength", "always", "--scope", "work", "--repo", "*"]);
    assert.equal(result.code, 0, result.stderr);
    await invoke(["premise", "add", "Every rule", "--strength", "never", "--scope", "*", "--repo", "*"]);

    result = await invoke(["premise", "list", "--scope", "work"]);
    assert.equal(result.stdout, "every-rule\t*\tnever\tEvery rule\nwork-rule\twork\talways\tWork rule\n");
    result = await invoke(["premise", "list", "--scope", ""]);
    assert.equal(result.stdout, "every-rule\t*\tnever\tEvery rule\n");
  });

  await suite.test("TestCLIMissingID", async (t) => {
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

    let result = await invoke(["premise", "show", "missing-id"]);
    assert.equal(result.code, 1, result.stderr);
    result = await invoke(["premise", "rm", "missing-id"]);
    assert.equal(result.code, 1, result.stderr);
    result = await invoke(["premise", "show"]);
    assert.equal(result.code, 1, result.stderr);
  });

  await suite.test("TestMCPStdio", async () => {
    const script = fileURLToPath(new URL("./brain.mjs", import.meta.url));
    const child = spawn(process.execPath, [script, "mcp"], { stdio: ["pipe", "pipe", "pipe"] });
    const stop = () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
      }
    };
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const init = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "0.0.1" } },
    };
    try {
      child.stdin.write(`${JSON.stringify(init)}\n`);
      const line = await waitForLine(
        () => stdout,
        () => stderr,
      );
      const msg = JSON.parse(line);
      assert.equal(msg.id, 1);
      assert.equal(msg.result.serverInfo.name, "brain-premises");
      child.stdin.end();
      const code = await waitExit(child);
      assert.equal(code, 0, stderr);
    } finally {
      stop();
    }
  });
});

function waitForLine(getStdout, getStderr) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const text = getStdout();
      const nl = text.indexOf("\n");
      if (nl !== -1) {
        clearInterval(timer);
        resolve(text.slice(0, nl));
        return;
      }
      if (Date.now() - start > 2000) {
        clearInterval(timer);
        reject(new Error(`no stdio response: stdout=${JSON.stringify(text)} stderr=${JSON.stringify(getStderr())}`));
      }
    }, 10);
  });
}

function waitExit(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("mcp did not exit"));
    }, 2000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

test("TestCLICandidate", async (t) => {
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

  let result = await invoke([
    "premise",
    "add",
    "Maybe rule",
    "--strength",
    "never",
    "--scope",
    "*",
    "--repo",
    "*",
    "--status",
    "candidate",
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await invoke(["premise", "list"])).stdout, "");
  assert.equal(
    (await invoke(["premise", "list", "--status", "candidate"])).stdout,
    "maybe-rule\t*\tnever\tMaybe rule\n",
  );

  result = await invoke(["premise", "seen", "maybe-rule", "--repo", "repo-a", "--origin", "guess"]);
  assert.equal(result.code, 1);
  for (const date of ["2026-10-20", "2026-10-22"]) {
    result = await invoke([
      "premise",
      "seen",
      "maybe-rule",
      "--repo",
      "repo-a",
      "--origin",
      "correction",
      "--date",
      date,
    ]);
    assert.equal(result.code, 0, result.stderr);
  }
  result = await invoke(["premise", "stats"]);
  assert.match(result.stdout, /^maybe-rule\tcandidate\t-\t-\t-\t2\t2026-10-22\t(ready|expired)\n$/u);

  result = await invoke(["premise", "promote", "maybe-rule"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await invoke(["premise", "list"])).stdout, "maybe-rule\t*\tnever\tMaybe rule\n");
});
