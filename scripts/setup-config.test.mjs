import assert from "node:assert/strict";
import test from "node:test";

import { dropTables, setHook, tomlTable } from "./setup-config.mjs";

test("TestSetHookReplacesOnlyBrainHook", () => {
  const other = { type: "command", command: "other-hook" };
  const settings = {
    model: "opus",
    hooks: {
      SessionStart: [
        { matcher: "startup", hooks: [other] },
        { hooks: [{ type: "command", command: "node /old/bin/session-premises.mjs" }] },
      ],
    },
  };

  const added = setHook(settings, "node /new/bin/session-premises.mjs");
  assert.equal(added.model, "opus");
  assert.equal(added.hooks.SessionStart.length, 2);
  assert.deepEqual(added.hooks.SessionStart[0].hooks, [other]);
  assert.equal(added.hooks.SessionStart[1].hooks[0].command, "node /new/bin/session-premises.mjs");
  assert.deepEqual(setHook(added, "node /new/bin/session-premises.mjs"), added);

  const removed = setHook(added, "");
  assert.deepEqual(removed.hooks.SessionStart, [{ matcher: "startup", hooks: [other] }]);
});

test("TestCodexTables", () => {
  const text = [
    "[mcp_servers.keep]",
    'command = "a"',
    "",
    "[mcp_servers.brain-premises]",
    'command = "old"',
    "",
    "[mcp_servers.brain-premises.env]",
    'BRAIN_ROOT = "/old"',
    "",
    "[features]",
    "x = true",
    "",
  ].join("\n");

  const out = dropTables(text, ["brain-premises"]);
  assert.equal(out.includes("brain-premises"), false);
  assert.equal(out.includes("[mcp_servers.keep]"), true);
  assert.equal(out.includes("[features]"), true);

  const table = tomlTable("demo", { command: "cmd", args: ["-y", "x"], env: { K: "v" } });
  assert.equal(table, '[mcp_servers.demo]\ntype = "stdio"\ncommand = "cmd"\nargs = ["-y", "x"]\n\n[mcp_servers.demo.env]\nK = "v"');
});
