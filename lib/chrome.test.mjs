import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { chromeServer, screenshotDir } from "./chrome.mjs";

const template = fileURLToPath(new URL("../templates/home/mcp/chrome-devtools.json", import.meta.url));

// homeWithConfig makes a brain home that holds the template config.
async function homeWithConfig(t) {
  const home = await mkdtemp(join(tmpdir(), "brain-chrome-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(join(home, "mcp"));
  await copyFile(template, join(home, "mcp", "chrome-devtools.json"));
  return home;
}

test("TestChromeMCPFillsTheScope", async (t) => {
  const home = await homeWithConfig(t);

  const server = chromeServer(home, "qdrant", "/u");

  assert.equal(server.command, "npx");
  assert.ok(server.args.includes("--user-data-dir=/u/.local/share/agent-brain/chrome-profiles/qdrant"), server.args);
  assert.ok(server.args.includes(`--filesystemRoot=${home}/memory/sessions/screenshots/qdrant`), server.args);
  assert.ok(!server.args.some((arg) => arg.includes("${")), server.args);
});

test("TestChromeMCPUsesDefaultOutsideAScope", async (t) => {
  const home = await homeWithConfig(t);

  const server = chromeServer(home, "", "/u");

  assert.ok(server.args.includes("--user-data-dir=/u/.local/share/agent-brain/chrome-profiles/default"), server.args);
  assert.ok(server.args.includes(`--filesystemRoot=${home}/memory/sessions/screenshots/default`), server.args);
});

test("TestScreenshotDirReadsTheFlag", async (t) => {
  const home = await homeWithConfig(t);

  assert.equal(screenshotDir(home, "qdrant"), `${home}/memory/sessions/screenshots/qdrant`);
  await writeFile(join(home, "mcp", "chrome-devtools.json"), JSON.stringify({ command: "npx", args: [] }));
  assert.equal(screenshotDir(home, "qdrant"), null);
});
