#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { cmdChromeMCP } from "../lib/chrome.mjs";
import { suggestFlow } from "../lib/decide.mjs";
import { cmdDod } from "../lib/dod-cli.mjs";
import { loadFlows, matchFlows, repoContext } from "../lib/flows.mjs";
import { cmdHome } from "../lib/home-cli.mjs";
import { flags, UsageError } from "../lib/io.mjs";
import { premiseCommands } from "../lib/premise-cli.mjs";
import { brainHome, brainRoot, open } from "../lib/premise.mjs";
import { readReceipt, receiptPath, removeReceipt, writeReceipt } from "../lib/receipt.mjs";
import { loadConfig, resolveRepo } from "../lib/scope.mjs";
import { acceptSkill, linkSkills } from "../lib/skills.mjs";
import { runSkills, skillsUsage } from "../lib/third-party.mjs";
import { brainSkills, conflicts, scanScopes } from "../lib/workspace.mjs";
import { formatWorktree, listWorktrees } from "../lib/worktrees.mjs";

const usageText = `usage:
  brain premise list [--repo name] [--scope name] [--status active|candidate]
  brain premise add TEXT --strength always|never|prefer --scope name|"*" --repo name [--repo name ...] [--id slug] [--source path] [--status active|candidate]
  brain premise seen ID --repo name --origin correction|defect [--date YYYY-MM-DD]
  brain premise promote ID
  brain premise show ID
  brain premise update ID [--text TEXT] [--strength always|never|prefer] [--scope name|"*"] [--repo name ...] [--source path] [--status active|candidate]
  brain premise rm ID
  brain premise search QUERY [--repo name] [--scope name] [--status active|candidate]
  brain premise stats
  brain premise check
  brain root
  brain home [migrate --from DIR [--apply] | starters [--apply] | sync]
  brain scope [--cwd DIR]
  brain installed [write --bin-dir DIR [--target PATH ...] [--claude] | remove]
  brain workspace check
  brain next [--cwd DIR] [--json] [--no-pr] [--request TEXT]
  brain flows
  brain worktree list [--cwd DIR] [--json]
  brain mcp [check]
  brain chrome-mcp
  brain accept-skill NAME
  brain link-skills [--apply] --target PATH [--target PATH ...]
  brain dod path|run [--cwd DIR]
  brain dod init [--cwd DIR] [--title TEXT] [--replace]
  brain dod lint [--cwd DIR] [--done]
${skillsUsage}`;

// Each command takes the arguments after its name and returns the exit code.
// A bad command line throws UsageError. run turns any other error into exit 1 or 2.
const commands = {
  premise: (args, stdout, stderr) => dispatch(premiseCommands, args, { stdout, stderr }),
  root: cmdRoot,
  home: cmdHome,
  scope: cmdScope,
  installed: cmdInstalled,
  workspace: cmdWorkspace,
  next: cmdNext,
  flows: cmdFlows,
  worktree: cmdWorktree,
  mcp: cmdMCP,
  "chrome-mcp": cmdChromeMCP,
  skills: runSkills,
  "accept-skill": cmdAcceptSkill,
  "link-skills": cmdLinkSkills,
  dod: cmdDod,
};

export async function run(args, stdout, stderr) {
  try {
    return await dispatch(commands, args, { stdout, stderr });
  } catch (err) {
    if (err instanceof UsageError) {
      stderr.write(err.message ? `${err.message}\n` : usageText);
      return 1;
    }
    stderr.write(`${err.message}\n`);
    return exitCode(err);
  }
}

function dispatch(table, args, { stdout, stderr }) {
  if (!Object.hasOwn(table, args[0] ?? "")) {
    throw new UsageError();
  }
  return table[args[0]](args.slice(1), stdout, stderr);
}

// A missing premise, skill, or file, or a bad skill name, is exit 1. Any other failure is exit 2.
function exitCode(err) {
  for (let cause = err; cause; cause = cause.cause) {
    if (cause.code === "ENOENT" || cause.code === "BAD_NAME") {
      return 1;
    }
  }
  return 2;
}

function cmdRoot(args, stdout) {
  if (args.length > 0) {
    throw new UsageError();
  }
  stdout.write(`${brainRoot().replace(/\/$/u, "")}\n`);
  return 0;
}

// cmdScope prints the scope, repo, origin owner, and scope root of the repo at --cwd.
// "-" as the scope means the repo is in no scope, so only global premises apply.
function cmdScope(args, stdout) {
  const f = flags(args, { cwd: "string" });
  if (f.pos.length > 0) {
    throw new UsageError();
  }
  const config = loadConfig(brainHome());
  const found = resolveRepo(f.cwd || process.cwd(), config);
  const roots = config.scopes[found.scope]?.roots ?? [];
  stdout.write(`${found.scope || "-"}\t${found.repo}\t${found.owner || "-"}\t${roots[0] ?? "-"}\n`);
  return 0;
}

// cmdInstalled prints the install receipt: what install put on disk for this checkout.
// install.sh runs "installed write" and uninstall.sh runs "installed remove".
async function cmdInstalled(args, stdout, stderr) {
  const [sub, ...rest] = args;
  if (sub === "remove" && rest.length === 0) {
    await removeReceipt(brainRoot(), { dryRun: process.env.BRAIN_DRY_RUN === "1" }, stdout);
    return 0;
  }
  if (sub === "write") {
    return installedWrite(rest, stdout);
  }
  if (args.length > 0) {
    throw new UsageError();
  }
  return installedShow(stdout, stderr);
}

// brainVersion reads the semver of this checkout, which the receipt keeps for the next install.
function brainVersion() {
  return JSON.parse(readFileSync(join(brainRoot(), "package.json"), "utf8")).version;
}

async function installedWrite(args, stdout) {
  const f = flags(args, { target: "list", "bin-dir": "string", claude: "boolean" });
  if (f.pos.length > 0) {
    throw new UsageError();
  }
  const items = await writeReceipt(
    brainRoot(),
    { targets: f.target, binDir: f["bin-dir"] ?? "", claude: f.claude, version: brainVersion() },
    stdout,
  );
  stdout.write(`${items.length} items in ${receiptPath()}\n`);
  return 0;
}

async function installedShow(stdout, stderr) {
  const receipt = await readReceipt();
  if (!receipt) {
    stderr.write("no receipt. Run scripts/install.sh\n");
    return 1;
  }
  stdout.write(`root\t${receipt.root}\n`);
  for (const i of receipt.items) {
    stdout.write(`${i.type}\t${i.name}\t${i.where}\n`);
  }
  return 0;
}

// cmdWorktree lists the worktrees of the repo at --cwd with state, parent branch, and size.
function cmdWorktree(args, stdout, stderr) {
  const [sub, ...rest] = args;
  if (sub !== "list") {
    throw new UsageError();
  }
  const f = flags(rest, { json: "boolean", cwd: "string" });
  if (f.pos.length > 0) {
    throw new UsageError();
  }
  const cwd = f.cwd || process.cwd();
  const list = listWorktrees(cwd);
  if (!list) {
    stderr.write(`not a git repo: ${cwd}\n`);
    return 1;
  }
  stdout.write(f.json ? `${JSON.stringify(list, null, 2)}\n` : list.map((w) => `${formatWorktree(w)}\n`).join(""));
  return 0;
}

// cmdNext reads the repo state at --cwd (default: the current directory) and lists
// the flows that match it, most specific first. With --request and a decide block in
// brain.config.json, it also prints the flow that the local model suggests for the request.
async function cmdNext(args, stdout, stderr) {
  const f = flags(args, { json: "boolean", "no-pr": "boolean", cwd: "string", request: "string" });
  if (f.pos.length > 0) {
    throw new UsageError();
  }
  const cwd = f.cwd || process.cwd();
  const config = loadConfig(brainHome());
  const ctx = repoContext(cwd, { pr: !f["no-pr"], config });
  if (!ctx) {
    stderr.write(`not a git repo: ${cwd}\n`);
    return 1;
  }
  const flows = matchFlows(await loadFlows(brainRoot(), brainHome()), ctx);
  const premises = await (await open(brainHome())).list(ctx.repo, ctx.scope);
  const next = { ctx, flows, premises, request: f.request };
  next.suggested = f.request ? await suggest(config, next, stderr) : null;
  stdout.write(f.json ? nextJson(next) : nextText(next));
  return 0;
}

// suggest asks the local model for a flow. A model failure prints a warning and suggests nothing.
async function suggest(config, { ctx, request, flows }, stderr) {
  try {
    const answer = await suggestFlow(config, ctx, { request, flows });
    return answer && { flow: answer.choice, confidence: answer.confidence };
  } catch (err) {
    stderr.write(`local model: ${err.message}\n`);
    return null;
  }
}

function nextJson({ ctx, flows, premises, request, suggested }) {
  const out = { context: ctx, premises: premises.map((p) => p.id), flows };
  if (request) {
    out.suggested = suggested;
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

function nextText({ ctx, flows, premises, suggested }) {
  const ticket = ctx.ticket ? ` (${ctx.ticket})` : "";
  const lines = [
    `repo ${ctx.repo}, scope ${ctx.scope || "-"}, branch ${ctx.branch || "detached"}${ticket}, ahead ${ctx.ahead}, behind ${ctx.behind}, ${ctx.dirty ? "dirty" : "clean"}, pr ${ctx.pr}, worktrees ${ctx.worktrees}`,
    `kinds: ${ctx.kinds.join(", ") || "-"}; ${premises.length} active premises`,
    ...flows.map((flow, i) => `${i + 1}. ${flow.name}: ${flow.description ?? ""}`),
  ];
  if (suggested) {
    lines.push(`suggested by the local model: ${suggested.flow} (confidence ${suggested.confidence.toFixed(2)})`);
  }
  return lines.map((line) => `${line}\n`).join("");
}

async function cmdFlows(args, stdout) {
  for (const flow of await loadFlows(brainRoot(), brainHome())) {
    stdout.write(`${flow.name}\t${flow.model ?? "-"}\t${flow.description ?? ""}\n`);
  }
  return 0;
}

// workspace check prints each conflict between the repos in the scope roots and the brain:
// broken links, version drift of a shared skill, and name collisions. Exit 1 when it prints
// a line, and exit 2 when the scan fails.
async function cmdWorkspace(args, stdout, stderr) {
  if (args.length !== 1 || args[0] !== "check") {
    throw new UsageError();
  }
  const home = brainHome();
  try {
    const found = conflicts(await scanScopes(loadConfig(home)), await brainSkills(brainRoot(), home));
    for (const line of found) {
      stdout.write(`conflict\t${line}\n`);
    }
    return found.length === 0 ? 0 : 1;
  } catch (err) {
    stderr.write(`${err.message}\n`);
    return 2;
  }
}

async function cmdAcceptSkill(args) {
  if (args.length === 1 && (args[0] === "-h" || args[0] === "--help")) {
    throw new UsageError();
  }
  if (args.length !== 1 || args[0].startsWith("-")) {
    throw new UsageError("accept-skill needs one NAME");
  }
  await acceptSkill(brainRoot(), brainHome(), args[0]);
  return 0;
}

async function cmdLinkSkills(args, stdout) {
  const f = flags(args, { apply: "boolean", target: "list" });
  if (f.pos.length > 0) {
    throw new UsageError("link-skills takes no text");
  }
  if (f.target.includes("")) {
    throw new UsageError("flag --target needs a value");
  }
  if (f.target.length === 0) {
    throw new UsageError("link-skills needs --target PATH");
  }
  for (const line of await linkSkills(brainRoot(), f.target, { apply: f.apply, home: brainHome() })) {
    stdout.write(`${line}\n`);
  }
  return 0;
}

// cmdMCP serves the premise MCP server on stdio, or checks a fresh server with "check".
// Any failure is exit 1.
async function cmdMCP(args, stdout, stderr) {
  if (args.length > 1 || (args.length === 1 && args[0] !== "check")) {
    throw new UsageError();
  }
  try {
    if (args[0] === "check") {
      const { checkMCP } = await import("../lib/mcp-check.mjs");
      const result = await checkMCP();
      stdout.write(`brain-premises ${result.version}: ${result.tools.length} tools and shared store match\n`);
      return 0;
    }
    const { serveMCP } = await import("../lib/mcp.mjs");
    await serveMCP();
    return 0;
  } catch (err) {
    stderr.write(`${err.message}\n`);
    return 1;
  }
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return realpathSync(import.meta.filename) === realpathSync(entry);
  } catch {
    return import.meta.url === pathToFileURL(entry).href;
  }
}

if (isDirectRun()) {
  const code = await run(process.argv.slice(2), process.stdout, process.stderr);
  process.exit(code);
}
