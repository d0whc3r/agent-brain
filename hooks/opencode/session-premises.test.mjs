import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { attach, loadPremiseText, markerTime } from "./session-premises.js";

test("TestAttachAddsPremiseText", async () => {
  const event = { sessionID: "ses_1", system: [] };
  const ctx = {
    session: {
      hook(_name, fn) {
        return fn(event);
      },
      get() {
        return { location: { directory: "/repo" } };
      },
    },
  };

  await attach(ctx, async () => "Brain: repo demo.\n");
  assert.equal(event.system[0].text, "Brain: repo demo.\n");
});

test("TestAttachFailsOpen", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  const event = { sessionID: "ses_1", system: [] };
  const ctx = {
    session: {
      hook(_name, fn) {
        return fn(event);
      },
      get() {
        throw new Error("down");
      },
    },
  };

  await attach(ctx, async () => {
    throw new Error("down");
  });
  assert.deepEqual(event.system, []);
  assert.equal(log.mock.callCount(), 1);
  assert.equal(log.mock.calls[0].arguments[0], "brain session-premises:");
  assert.equal(log.mock.calls[0].arguments[1].message, "down");
});

test("TestLoadPremiseTextSkipsOutsideGit", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "brain-hook-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const text = await loadPremiseText(dir);
  assert.equal(text, "");
});

test("TestMarkerTimeFallsBackOnlyWhenMissing", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "brain-hook-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "file");
  await writeFile(file, "");
  assert.equal(await markerTime(join(dir, "missing")), 0);
  await assert.rejects(markerTime(join(file, "premises")), { code: "ENOTDIR" });
});

test("TestLoadPremiseTextReportsStderr", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "brain-hook-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  // A folder as brain.config.json of the home makes the script fail after it finds the git repo.
  await mkdir(join(dir, "brain.config.json"));
  const previous = process.env.BRAIN_HOME;
  process.env.BRAIN_HOME = dir;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.BRAIN_HOME;
      return;
    }
    process.env.BRAIN_HOME = previous;
  });
  const repo = join(import.meta.dirname, "..", "..");
  await assert.rejects(loadPremiseText(repo), /session-premises exited 1: [\s\S]*EISDIR/u);
});
