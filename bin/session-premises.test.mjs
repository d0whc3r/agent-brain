import assert from "node:assert/strict";
import test from "node:test";

import { formatContext } from "./session-premises.mjs";

test("TestFormatContext", () => {
  const premise = { id: "rule-a", text: "Rule A.", strength: "never", scope: "*" };
  const scoped = formatContext({ repo: "repo-a", scope: "work" }, [premise], [{ name: "review-diff" }]);
  assert.equal(scoped, "Brain: repo repo-a, scope work.\nApply every always and never premise. Quote each one you apply.\n- [never] Rule A. (rule-a, scope *)\nFlows that match this repo state: review-diff. The next skill runs them.\n");
  assert.equal(formatContext({ repo: "clone", scope: "" }, [], []), "Brain: repo clone, no scope, so only global premises apply.\n");
});
