import assert from "node:assert/strict";
import test from "node:test";

import { formatContext, formatProblems } from "./session-premises.mjs";

test("TestFormatContext", () => {
  const premise = { id: "rule-a", text: "Rule A.", strength: "never", scope: "*" };
  const scoped = formatContext({ repo: "repo-a", scope: "work" }, [premise], [{ name: "review-diff" }]);
  assert.equal(
    scoped,
    "Brain: repo repo-a, scope work.\nApply every always and never premise. Quote each one you apply.\n- [never] Rule A. (rule-a, scope *)\nRun brain premise show ID or call premise_get for the reason and the exceptions of a premise.\nFlows that match this repo state: review-diff. The brain-next skill runs them.\n",
  );
  assert.equal(
    formatContext({ repo: "clone", scope: "" }, [], []),
    "Brain: repo clone, no scope, so only global premises apply.\n",
  );
});

test("TestFormatProblems", () => {
  assert.equal(formatProblems([]), "");
  assert.equal(
    formatProblems([
      { file: "a.md", reason: "bad status" },
      { file: "b.md", reason: "no repos" },
    ]),
    "Premise files not applied because they are invalid: a.md (bad status); b.md (no repos). Tell the user; brain premise check lists them.\n",
  );
});
