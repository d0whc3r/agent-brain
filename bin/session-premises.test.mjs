import assert from "node:assert/strict";
import test from "node:test";

import { repoFor } from "./session-premises.mjs";

test("TestRepoFor", () => {
  const root = "/q";
  assert.equal(repoFor("/q/repo-b/src/app", root), "repo-b");
  assert.equal(repoFor("/q/repo-b", root), "repo-b");
  assert.equal(repoFor("/q", root), "");
  assert.equal(repoFor("/elsewhere/repo-b", root), "");
  assert.equal(repoFor("/q/repo-b-copy2/src", root), "");
  assert.equal(repoFor("/q/repo-b", ""), "");
});
