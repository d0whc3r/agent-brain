import assert from "node:assert/strict";
import test from "node:test";

import { parseOrigin, resolveRepo } from "./scope.mjs";

test("TestParseOrigin", () => {
  assert.deepEqual(parseOrigin("git@github.com:org-a/repo-a.git"), { owner: "org-a", repo: "repo-a" });
  assert.deepEqual(parseOrigin("ssh://git@github.com/org-b/repo-b.git"), { owner: "org-b", repo: "repo-b" });
  assert.deepEqual(parseOrigin("https://github.com/org-c/repo-c"), { owner: "org-c", repo: "repo-c" });
  assert.deepEqual(parseOrigin(""), { owner: "", repo: "" });
});

test("TestResolveRepo", () => {
  const config = {
    scopes: {
      work: { owners: ["org-a"], roots: ["/w"] },
      home: { owners: ["me"], roots: [] },
    },
  };
  const origin = (url) => () => url;
  assert.deepEqual(resolveRepo("/x/repo-a-copy", config, origin("git@github.com:org-a/repo-a.git")), {
    repo: "repo-a",
    owner: "org-a",
    scope: "work",
  });
  assert.deepEqual(resolveRepo("/x/tool", config, origin("git@github-private.com:me/tool.git")), {
    repo: "tool",
    owner: "me",
    scope: "home",
  });
  assert.deepEqual(resolveRepo("/w/local-only", config, origin("")), { repo: "local-only", owner: "", scope: "work" });
  assert.deepEqual(resolveRepo("/x/clone", config, origin("https://github.com/stranger/clone")), {
    repo: "clone",
    owner: "stranger",
    scope: "",
  });
  assert.deepEqual(resolveRepo("/w/clone", config, origin("https://github.com/stranger/clone")), {
    repo: "clone",
    owner: "stranger",
    scope: "",
  });
});
