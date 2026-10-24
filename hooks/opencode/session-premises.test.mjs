import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { attach, loadPremiseText } from "./session-premises.js";

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

test("TestAttachFailsOpen", async () => {
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
});

test("TestLoadPremiseTextSkipsOutsideGit", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "brain-hook-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const text = await loadPremiseText(dir);
  assert.equal(text, "");
});
