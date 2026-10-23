import assert from "node:assert/strict";
import test from "node:test";

import { repoFor } from "./session-premises.mjs";

test("TestRepoFor", () => {
  const root = "/q";
  const none = () => "";
  assert.equal(repoFor("/q/repo-b/src/app", root, none), "repo-b");
  assert.equal(repoFor("/q", root, none), "");
  assert.equal(repoFor("/elsewhere/repo-b", root, none), "");
  assert.equal(repoFor("/q/repo-b", "", none), "");
});

test("TestRepoForUsesOrigin", () => {
  const root = "/q";
  assert.equal(repoFor("/q/repo-b-copy2/src", root, () => "git@github.com:org/repo-b.git"), "repo-b");
  assert.equal(repoFor("/q/repo-b-copy2-wt/task-1", root, () => "https://github.com/org/repo-b"), "repo-b");
});
