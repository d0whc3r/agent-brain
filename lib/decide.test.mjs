import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { decide, repeatOf, suggestFlow } from "./decide.mjs";

// fakeModel serves /v1/systemone. reply(body) returns the answer of the request body.
async function fakeModel(t, reply) {
  const requests = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const body = JSON.parse(raw);
      requests.push(body);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ model: body.model, answers: { answer: reply(body) } }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  return { requests, url: `http://127.0.0.1:${server.address().port}/v1/systemone` };
}

function on(url, scopes) {
  return { scopes: {}, decide: { model: "test-model", scopes, url } };
}

const question = { type: "choice", instructions: "Pick one.", criteria: { a: "first", b: "second" } };

test("TestDecideOffSendsNothing", async (t) => {
  const model = await fakeModel(t, () => ({ choice: "a", confidence: 0.9 }));
  assert.equal(await decide({ scopes: {}, decide: null }, "personal", "state", question), null);
  assert.equal(await decide(on(model.url, ["personal"]), "qdrant", "state", question), null);
  assert.equal(model.requests.length, 0);
});

test("TestDecideAnyScope", async (t) => {
  const model = await fakeModel(t, () => ({ choice: "b", confidence: 0.8 }));
  for (const scope of ["qdrant", "personal", ""]) {
    assert.deepEqual(await decide(on(model.url, ["*"]), scope, "state", question), { choice: "b", confidence: 0.8 });
  }
  assert.equal(model.requests.length, 3);
  assert.deepEqual(model.requests[0], { model: "test-model", state: "state", questions: { answer: question } });
});

test("TestDecideRejectsUnlistedChoice", async (t) => {
  const model = await fakeModel(t, () => ({ choice: "c", confidence: 0.99 }));
  await assert.rejects(decide(on(model.url, ["*"]), "personal", "state", question), /not a listed choice/);
});

test("TestDecideServerDown", async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  await assert.rejects(decide(on(`http://127.0.0.1:${port}/v1/systemone`, ["*"]), "personal", "state", question));
});

test("TestSuggestFlowAsksMatchedFlows", async (t) => {
  const model = await fakeModel(t, () => ({ choice: "self-review", confidence: 0.97 }));
  const ctx = {
    repo: "repo-a",
    scope: "personal",
    branch: "feat",
    onMain: false,
    ahead: 2,
    behind: 0,
    dirty: false,
    pr: "none",
    changed: ["a.js"],
    kinds: ["ui"],
  };
  const flows = [
    { name: "self-review", description: "Review your own branch." },
    { name: "prepare-pr", description: "Draft the PR." },
  ];
  const answer = await suggestFlow(on(model.url, ["*"]), ctx, "revisa mi rama", flows);
  assert.deepEqual(answer, { choice: "self-review", confidence: 0.97 });
  const sent = model.requests[0];
  assert.deepEqual(Object.keys(sent.questions.answer.criteria), ["self-review", "prepare-pr", "none"]);
  assert.match(sent.state, /User request: "revisa mi rama"/);
  assert.equal(await suggestFlow(on(model.url, ["*"]), ctx, "revisa mi rama", []), null);
  assert.equal(model.requests.length, 1);
});

test("TestRepeatOfSameScope", async (t) => {
  let choice = "qdrant-rule";
  const model = await fakeModel(t, () => ({ choice, confidence: 0.91 }));
  const active = [
    { id: "qdrant-rule", text: "Use pnpm.", scope: "qdrant" },
    { id: "personal-rule", text: "Use npm.", scope: "personal" },
    { id: "new-rule", text: "Run pnpm, not npm.", scope: "qdrant" },
  ];
  const candidates = [{ id: "global-rule", text: "Quote each premise.", scope: "*" }];
  const store = { list: async (repo, scope, status = "active") => (status === "active" ? active : candidates) };
  const config = on(model.url, ["*"]);

  const repeat = await repeatOf(config, store, active[2]);
  assert.deepEqual(repeat, { id: "qdrant-rule", text: "Use pnpm.", confidence: 0.91 });
  assert.deepEqual(Object.keys(model.requests[0].questions.answer.criteria), ["qdrant-rule", "global-rule", "none"]);

  choice = "none";
  assert.equal(await repeatOf(config, store, active[2]), null);
  assert.equal(await repeatOf({ scopes: {}, decide: null }, store, active[2]), null);
  assert.equal(model.requests.length, 2);
});
