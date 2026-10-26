import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("ts-lsp.sh", import.meta.url));

// fake makes a bin folder with a stub language server, and one project for each TypeScript
// version. Each stub prints its name and its arguments.
async function fake(t, { server = true } = {}) {
  const base = await mkdtemp(join(await realpath(tmpdir()), "brain-ts-lsp-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  await mkdir(join(base, "bin"));
  if (server) {
    await stub(join(base, "bin"), "typescript-language-server", "tsls");
  }
  for (const version of ["7.0.2", "6.0.3"]) {
    const project = join(base, `ts${version[0]}`, "node_modules");
    await mkdir(join(project, "typescript"), { recursive: true });
    await writeFile(
      join(project, "typescript", "package.json"),
      `{\n  "name": "typescript",\n  "version": "${version}"\n}\n`,
    );
    await stub(join(project, ".bin"), "tsc", "tsc");
  }
  return base;
}

async function stub(dir, name, label) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), `#!/bin/sh\necho "${label} $*"\n`, { mode: 0o755 });
}

function run(base, cwd, env = {}) {
  const result = spawnSync("/bin/bash", [script], {
    cwd,
    encoding: "utf8",
    env: { PATH: `${join(base, "bin")}:/usr/bin:/bin`, ...env },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("TestTsLspStartsTheNativeServerOfTypeScript7", async (t) => {
  const base = await fake(t);

  assert.equal(run(base, join(base, "ts7")).stdout, "tsc --lsp -stdio\n");
  assert.equal(run(base, join(base, "ts6"), { CLAUDE_PROJECT_DIR: join(base, "ts7") }).stdout, "tsc --lsp -stdio\n");
});

test("TestTsLspStartsTheGlobalServerForOlderTypeScript", async (t) => {
  const base = await fake(t);

  assert.equal(run(base, join(base, "ts6")).stdout, "tsls --stdio\n");
  assert.equal(run(base, base).stdout, "tsls --stdio\n", "a folder with no TypeScript gets the global server");
});

test("TestTsLspFailsWithoutTheGlobalServer", async (t) => {
  const base = await fake(t, { server: false });

  const result = run(base, join(base, "ts6"));

  assert.equal(result.code, 1);
  assert.equal(
    result.stderr,
    "ts-lsp: typescript-language-server not found. Run scripts/install.sh in the brain checkout.\n",
  );
});
