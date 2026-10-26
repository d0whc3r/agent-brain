#!/usr/bin/env node

// SessionStart hook. Print the brain scope, the active premises, the matching flows, and the
// invalid premise files for the git repo in the session cwd. Claude Code adds the output to the session context.
// brain.config.json maps origin owners and root directories to scopes. A repo in no scope
// gets only the premises that hold in every scope and every repo. A cwd outside git prints nothing.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { loadFlows, matchFlows, repoContext } from "../lib/flows.mjs";
import { brainHome, brainRoot, open } from "../lib/premise.mjs";
import { loadConfig } from "../lib/scope.mjs";

export function formatContext(ctx, premises, flows) {
  const where = ctx.scope ? `scope ${ctx.scope}` : "no scope, so only global premises apply";
  const out = [`Brain: repo ${ctx.repo}, ${where}.`];
  if (premises.length > 0) {
    out.push(
      "Apply every always and never premise. Quote each one you apply.",
      ...premises.map((p) => `- [${p.strength}] ${p.text} (${p.id}, scope ${p.scope})`),
      "Run brain premise show ID or call premise_get for the reason and the exceptions of a premise.",
    );
  }
  if (flows.length > 0) {
    out.push(
      `Flows that match this repo state: ${flows.map((f) => f.name).join(", ")}. The brain-next skill runs them.`,
    );
  }
  return `${out.join("\n")}\n`;
}

// formatProblems names each premise file that the store skips. The agent reads only stdout,
// so this line is how the user learns that a hand edit broke a premise.
export function formatProblems(problems) {
  if (problems.length === 0) {
    return "";
  }
  const files = problems.map((p) => `${p.file} (${p.reason})`).join("; ");
  return `Premise files not applied because they are invalid: ${files}. Tell the user; brain premise check lists them.\n`;
}

export async function premiseContext(cwd) {
  const home = brainHome();
  // Skip the PR lookup: it calls the network and the hook must stay fast.
  const ctx = repoContext(cwd, { pr: false, config: loadConfig(home) });
  if (!ctx) {
    return "";
  }
  const store = await open(home);
  const premises = await store.list(ctx.repo, ctx.scope);
  const { problems } = await store.scan();
  const flows = matchFlows(await loadFlows(brainRoot(), home), ctx).slice(0, 3);
  return `${formatContext(ctx, premises, flows)}${formatProblems(problems)}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  process.stdout.write(await premiseContext(input.cwd ?? process.cwd()));
}
