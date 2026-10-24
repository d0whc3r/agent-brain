import { anyScope } from "./scope.mjs";

// The decide block of brain.config.json turns on a local decision model, served by the
// Ollama /v1/systemone API. Each answer is a hint. A caller keeps its own path without it.
const defaultURL = "http://localhost:11434/v1/systemone";
// A cold start loads the model first, which takes a few seconds.
const timeoutMs = 10000;
const none = "none";

function enabled(config, scope) {
  const scopes = config.decide?.scopes ?? [anyScope];
  return Boolean(config.decide) && (scopes.includes(anyScope) || scopes.includes(scope));
}

// decide asks one choice question. It returns null when the decide block is missing or
// does not list the scope. It throws when the server fails or the choice is not a criterion.
export async function decide(config, scope, state, question) {
  if (!enabled(config, scope)) {
    return null;
  }
  const res = await fetch(config.decide.url ?? defaultURL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: config.decide.model, state, questions: { answer: question } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const answer = body.answers?.answer;
  if (!answer || !Object.hasOwn(question.criteria, answer.choice)) {
    throw new Error(`answer is not a listed choice: ${JSON.stringify(answer?.choice)}`);
  }
  return { choice: answer.choice, confidence: answer.confidence };
}

// suggestFlow picks one of the flows that match the repo state, or none, for the request.
export async function suggestFlow(config, ctx, request, flows) {
  if (flows.length === 0) {
    return null;
  }
  const criteria = Object.fromEntries(flows.map((f) => [f.name, f.description || f.name]));
  criteria[none] = "No listed flow fits the request.";
  const state = [
    `Repo ${ctx.repo}, scope ${ctx.scope || "none"}, branch ${ctx.branch || "detached"} (${ctx.onMain ? "main" : "feature"}).`,
    `Ahead ${ctx.ahead}, behind ${ctx.behind}, ${ctx.dirty ? "uncommitted changes" : "clean tree"}, PR ${ctx.pr}, ${ctx.changed.length} changed files, kinds ${ctx.kinds.join(", ") || "none"}.`,
    `User request: ${JSON.stringify(request)}`,
  ].join("\n");
  return decide(config, ctx.scope, state, {
    type: "choice",
    instructions:
      "Which brain flow best serves the user request in this repo state? Choose none when no flow fits the request.",
    criteria,
  });
}

// repeatOf names the premise of the same scope that states the same rule as premise.
// A repeat counts toward a candidate, so a second premise for one rule splits its count.
export async function repeatOf(config, store, premise) {
  if (!enabled(config, premise.scope)) {
    return null;
  }
  const all = [...(await store.list("")), ...(await store.list("", null, "candidate"))];
  const same = all.filter(
    (p) => p.id !== premise.id && (premise.scope === anyScope || p.scope === anyScope || p.scope === premise.scope),
  );
  if (same.length === 0) {
    return null;
  }
  const criteria = Object.fromEntries(same.map((p) => [p.id, p.text]));
  criteria[none] = "No listed premise states the same rule.";
  const answer = await decide(config, premise.scope, `New rule: ${JSON.stringify(premise.text)}`, {
    type: "choice",
    instructions: "Which existing premise states the same rule as the new rule? Choose none when no premise states it.",
    criteria,
  });
  if (answer.choice === none) {
    return null;
  }
  return { id: answer.choice, text: criteria[answer.choice], confidence: answer.confidence };
}
