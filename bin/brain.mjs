#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { serveMCP } from "../lib/mcp.mjs";
import { brainRoot, open } from "../lib/premise.mjs";
import { anyScope, loadConfig, resolveRepo } from "../lib/scope.mjs";
import { acceptSkill, linkSkills } from "../lib/skills.mjs";
import { loadFlows, matchFlows, repoContext } from "../lib/flows.mjs";
import { premiseStats } from "../lib/stats.mjs";
import { formatWorktree, listWorktrees } from "../lib/worktrees.mjs";
import { readReceipt, receiptPath, removeReceipt, writeReceipt } from "../lib/receipt.mjs";
import { brainSkills, conflicts, scanScopes } from "../lib/workspace.mjs";
import { runSkills, skillsUsage } from "../lib/third-party.mjs";

const strengths = new Set(["always", "never", "prefer"]);

export async function run(args, stdout, stderr) {
  if (args.length > 0 && args[0] === "mcp") {
    return cmdMCP(args.slice(1), stderr);
  }
  if (args.length > 0 && args[0] === "skills") {
    return runSkills(args.slice(1), stdout, stderr);
  }
  if (args.length > 0 && args[0] === "accept-skill") {
    return cmdAcceptSkill(args.slice(1), stderr);
  }
  if (args.length === 1 && args[0] === "root") {
    stdout.write(`${brainRoot().replace(/\/$/, "")}\n`);
    return 0;
  }
  if (args.length > 0 && args[0] === "installed") {
    return cmdInstalled(args.slice(1), stdout, stderr);
  }
  if (args.length > 0 && args[0] === "scope") {
    return cmdScope(args.slice(1), stdout, stderr);
  }
  if (args.length > 0 && args[0] === "next") {
    return cmdNext(args.slice(1), stdout, stderr);
  }
  if (args.length > 0 && args[0] === "worktree") {
    return cmdWorktree(args.slice(1), stdout, stderr);
  }
  if (args.length > 0 && args[0] === "flows") {
    return cmdFlows(stdout);
  }
  if (args.length > 0 && args[0] === "workspace") {
    return cmdWorkspace(args.slice(1), stdout, stderr);
  }
  if (args.length > 0 && args[0] === "link-skills") {
    return cmdLinkSkills(args.slice(1), stdout, stderr);
  }
  if (args.length === 0 || args[0] !== "premise") {
    usage(stderr);
    return 1;
  }
  return runPremise(args.slice(1), stdout, stderr);
}

async function runPremise(args, stdout, stderr) {
  if (args.length === 0) {
    usage(stderr);
    return 1;
  }
  switch (args[0]) {
    case "list":
      return cmdList(args.slice(1), stdout, stderr);
    case "add":
      return cmdAdd(args.slice(1), stdout, stderr);
    case "show":
      return cmdShow(args.slice(1), stdout, stderr);
    case "rm":
      return cmdRm(args.slice(1), stderr);
    case "search":
      return cmdSearch(args.slice(1), stdout, stderr);
    case "stats":
      return cmdStats(args.slice(1), stdout, stderr);
    default:
      usage(stderr);
      return 1;
  }
}

async function cmdList(args, stdout, stderr) {
  const parsed = parseNamed(args, ["repo", "scope"], stderr);
  if (parsed.code !== 0) {
    return parsed.code;
  }
  if (parsed.pos.length !== 0) {
    stderr.write("list takes no text\n");
    return 1;
  }
  const opened = await openStore(stderr);
  if (opened.code !== 0) {
    return opened.code;
  }
  try {
    const scope = parsed.flags.scope.length > 0 ? last(parsed.flags.scope) : null;
    const items = await opened.store.list(last(parsed.flags.repo), scope);
    writePremises(stdout, items);
    return 0;
  } catch (err) {
    return failStore(stderr, err);
  }
}

async function cmdAdd(args, stdout, stderr) {
  const parsed = parseNamed(args, ["strength", "scope", "id", "source", "repo"], stderr);
  if (parsed.code !== 0) {
    return parsed.code;
  }
  if (parsed.pos.length !== 1) {
    stderr.write("add needs one TEXT argument\n");
    return 1;
  }
  const strength = last(parsed.flags.strength);
  if (!strengths.has(strength)) {
    stderr.write("add needs --strength always, never, or prefer\n");
    return 1;
  }
  const scope = last(parsed.flags.scope);
  const scopes = Object.keys(loadConfig(brainRoot()).scopes);
  if (scope !== anyScope && !scopes.includes(scope)) {
    stderr.write(`add needs --scope ${[...scopes, '"*"'].join(", ")}\n`);
    return 1;
  }
  const opened = await openStore(stderr);
  if (opened.code !== 0) {
    return opened.code;
  }
  try {
    const added = await opened.store.add({
      id: last(parsed.flags.id),
      text: parsed.pos[0],
      strength,
      scope,
      repos: parsed.flags.repo,
      source: last(parsed.flags.source),
    });
    stdout.write(`${added.id}\n`);
    return 0;
  } catch (err) {
    return failStore(stderr, err);
  }
}

async function cmdShow(args, stdout, stderr) {
  const id = oneArg(args, "show", stderr);
  if (id.code !== 0) {
    return id.code;
  }
  const opened = await openStore(stderr);
  if (opened.code !== 0) {
    return opened.code;
  }
  try {
    const item = await opened.store.get(id.value);
    writePremise(stdout, item);
    return 0;
  } catch (err) {
    return failStore(stderr, err);
  }
}

async function cmdRm(args, stderr) {
  const id = oneArg(args, "rm", stderr);
  if (id.code !== 0) {
    return id.code;
  }
  const opened = await openStore(stderr);
  if (opened.code !== 0) {
    return opened.code;
  }
  try {
    await opened.store.delete(id.value);
    return 0;
  } catch (err) {
    return failStore(stderr, err);
  }
}

async function cmdSearch(args, stdout, stderr) {
  const query = oneArg(args, "search", stderr);
  if (query.code !== 0) {
    return query.code;
  }
  const opened = await openStore(stderr);
  if (opened.code !== 0) {
    return opened.code;
  }
  try {
    const items = await opened.store.search(query.value);
    writePremises(stdout, items);
    return 0;
  } catch (err) {
    return failStore(stderr, err);
  }
}

// cmdStats prints id, applied, rejected, last applied date, and a flag:
// unused (never applied), stale (not applied in 90 days), or noisy (often rejected).
async function cmdStats(args, stdout, stderr) {
  if (args.length !== 0) {
    stderr.write("stats takes no arguments\n");
    return 1;
  }
  try {
    for (const row of await premiseStats(brainRoot())) {
      stdout.write(`${row.id}\t${row.applied}\t${row.rejected}\t${row.last || "-"}\t${row.flag || "-"}\n`);
    }
    return 0;
  } catch (err) {
    return failStore(stderr, err);
  }
}

// cmdScope prints the scope, repo, origin owner, and scope root of the repo at --cwd.
// "-" as the scope means the repo is in no scope, so only global premises apply.
function cmdScope(args, stdout, stderr) {
  let cwd = process.cwd();
  if (args.length === 2 && args[0] === "--cwd") {
    cwd = args[1];
  } else if (args.length !== 0) {
    usage(stderr);
    return 1;
  }
  const config = loadConfig(brainRoot());
  const found = resolveRepo(cwd, config);
  const roots = config.scopes[found.scope]?.roots ?? [];
  stdout.write(`${found.scope || "-"}\t${found.repo}\t${found.owner || "-"}\t${roots[0] ?? "-"}\n`);
  return 0;
}

// cmdInstalled prints the install receipt: what install put on disk for this checkout.
// install.sh runs "installed write" and uninstall.sh runs "installed remove".
async function cmdInstalled(args, stdout, stderr) {
  const root = brainRoot();
  if (args[0] === "remove" && args.length === 1) {
    await removeReceipt(root, {}, stdout);
    return 0;
  }
  if (args[0] === "write") {
    const opts = { targets: [], binDir: "", claude: false };
    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--claude") {
        opts.claude = true;
      } else if (args[i] === "--target" && i + 1 < args.length) {
        opts.targets.push(args[++i]);
      } else if (args[i] === "--bin-dir" && i + 1 < args.length) {
        opts.binDir = args[++i];
      } else {
        usage(stderr);
        return 1;
      }
    }
    const items = await writeReceipt(root, opts, stdout);
    stdout.write(`${items.length} items in ${receiptPath()}\n`);
    return 0;
  }
  if (args.length !== 0) {
    usage(stderr);
    return 1;
  }
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
  let cwd = process.cwd();
  let json = false;
  if (args[0] !== "list") {
    usage(stderr);
    return 1;
  }
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--json") {
      json = true;
    } else if (args[i] === "--cwd" && i + 1 < args.length) {
      cwd = args[++i];
    } else {
      usage(stderr);
      return 1;
    }
  }
  const list = listWorktrees(cwd);
  if (!list) {
    stderr.write(`not a git repo: ${cwd}\n`);
    return 1;
  }
  if (json) {
    stdout.write(`${JSON.stringify(list, null, 2)}\n`);
    return 0;
  }
  for (const w of list) {
    stdout.write(`${formatWorktree(w)}\n`);
  }
  return 0;
}

// cmdNext reads the repo state at --cwd (default: the current directory) and lists
// the flows that match it, most specific first.
async function cmdNext(args, stdout, stderr) {
  let cwd = process.cwd();
  let json = false;
  let pr = true;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") {
      json = true;
    } else if (args[i] === "--no-pr") {
      pr = false;
    } else if (args[i] === "--cwd" && i + 1 < args.length) {
      cwd = args[++i];
    } else {
      usage(stderr);
      return 1;
    }
  }
  const ctx = repoContext(cwd, { pr, config: loadConfig(brainRoot()) });
  if (!ctx) {
    stderr.write(`not a git repo: ${cwd}\n`);
    return 1;
  }
  const flows = matchFlows(await loadFlows(brainRoot()), ctx);
  const store = await open(brainRoot());
  const premises = await store.list(ctx.repo, ctx.scope);
  if (json) {
    stdout.write(`${JSON.stringify({ context: ctx, premises: premises.map((p) => p.id), flows }, null, 2)}\n`);
    return 0;
  }
  const ticket = ctx.ticket ? ` (${ctx.ticket})` : "";
  stdout.write(`repo ${ctx.repo}, scope ${ctx.scope || "-"}, branch ${ctx.branch || "detached"}${ticket}, ahead ${ctx.ahead}, behind ${ctx.behind}, ${ctx.dirty ? "dirty" : "clean"}, pr ${ctx.pr}, worktrees ${ctx.worktrees}\n`);
  stdout.write(`kinds: ${ctx.kinds.join(", ") || "-"}; ${premises.length} active premises\n`);
  flows.forEach((flow, i) => {
    stdout.write(`${i + 1}. ${flow.name}: ${flow.description ?? ""}\n`);
  });
  return 0;
}

async function cmdFlows(stdout) {
  for (const flow of await loadFlows(brainRoot())) {
    stdout.write(`${flow.name}\t${flow.model ?? "-"}\t${flow.description ?? ""}\n`);
  }
  return 0;
}

// workspace check prints each conflict between the repos in the scope roots and the brain:
// broken links, version drift of a shared skill, and name collisions. Exit 1 when it prints a line.
async function cmdWorkspace(args, stdout, stderr) {
  if (args.length !== 1 || args[0] !== "check") {
    usage(stderr);
    return 1;
  }
  const brain = brainRoot();
  try {
    const live = await scanScopes(loadConfig(brain));
    const found = conflicts(live, await brainSkills(brain));
    for (const line of found) {
      stdout.write(`conflict\t${line}\n`);
    }
    return found.length === 0 ? 0 : 1;
  } catch (err) {
    stderr.write(`${err.message}\n`);
    return 2;
  }
}

async function cmdAcceptSkill(args, stderr) {
  if (args.length === 1 && (args[0] === "-h" || args[0] === "--help")) {
    usage(stderr);
    return 1;
  }
  if (args.length !== 1 || args[0].startsWith("-")) {
    stderr.write("accept-skill needs one NAME\n");
    return 1;
  }
  try {
    await acceptSkill(brainRoot(), args[0]);
    return 0;
  } catch (err) {
    return failSkill(stderr, err);
  }
}

async function cmdLinkSkills(args, stdout, stderr) {
  let apply = false;
  const targets = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--target" || arg.startsWith("--target=")) {
      const taken = takeFlagValue(arg, args, i);
      if (taken.error) {
        stderr.write(`${taken.error}\n`);
        return 1;
      }
      i = taken.index;
      targets.push(taken.value);
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      usage(stderr);
      return 1;
    }
    if (arg.startsWith("-")) {
      stderr.write(`unknown flag ${arg}\n`);
      return 1;
    }
    stderr.write("link-skills takes no text\n");
    return 1;
  }
  if (targets.length === 0) {
    stderr.write("link-skills needs --target PATH\n");
    return 1;
  }
  try {
    const lines = await linkSkills(brainRoot(), targets, apply);
    for (const line of lines) {
      stdout.write(`${line}\n`);
    }
    return 0;
  } catch (err) {
    return failSkill(stderr, err);
  }
}

function takeFlagValue(arg, args, index) {
  const eq = arg.indexOf("=");
  if (eq !== -1) {
    const value = arg.slice(eq + 1);
    if (value === "") {
      return { error: `flag ${arg.slice(0, eq)} needs a value` };
    }
    return { value, index };
  }
  const next = index + 1;
  if (next >= args.length || args[next].startsWith("-")) {
    return { error: `flag ${arg} needs a value` };
  }
  return { value: args[next], index: next };
}

function failSkill(stderr, err) {
  stderr.write(`${err.message}\n`);
  if (err.code === "ENOENT" || err.code === "BAD_NAME") {
    return 1;
  }
  return 2;
}

async function cmdMCP(args, stderr) {
  if (args.length !== 0) {
    usage(stderr);
    return 1;
  }
  try {
    await serveMCP();
    return 0;
  } catch (err) {
    stderr.write(`${err.message}\n`);
    return 1;
  }
}

function parseNamed(args, names, stderr) {
  const valued = new Set(names);
  let ordered;
  try {
    ordered = orderFlags(valued, args);
  } catch (err) {
    stderr.write(`${err.message}\n`);
    return { code: 1 };
  }
  const flags = {};
  for (const name of names) {
    flags[name] = [];
  }
  const pos = [];
  for (let i = 0; i < ordered.length; i++) {
    const arg = ordered[i];
    const split = splitFlag(arg);
    if (!split.isFlag) {
      pos.push(arg);
      continue;
    }
    if (split.name === "h" || split.name === "help") {
      usage(stderr);
      return { code: 1 };
    }
    let value;
    if (split.hasValue) {
      value = arg.slice(arg.indexOf("=") + 1);
    } else {
      i += 1;
      value = ordered[i];
    }
    flags[split.name].push(value);
  }
  return { code: 0, flags, pos };
}

function last(values) {
  if (!values || values.length === 0) {
    return "";
  }
  return values[values.length - 1];
}

function oneArg(args, name, stderr) {
  if (args.length !== 1 || args[0].startsWith("-")) {
    stderr.write(`${name} needs one argument\n`);
    return { code: 1 };
  }
  return { code: 0, value: args[0] };
}

async function openStore(stderr) {
  try {
    return { code: 0, store: await open(brainRoot()) };
  } catch (err) {
    return { code: failStore(stderr, err) };
  }
}

// A missing id is exit 1. Any other store rejection is exit 2.
function failStore(stderr, err) {
  stderr.write(`${err.message}\n`);
  if (isMissing(err)) {
    return 1;
  }
  return 2;
}

function isMissing(err) {
  let current = err;
  while (current) {
    if (current.code === "ENOENT") {
      return true;
    }
    current = current.cause;
  }
  return false;
}

function writePremises(stdout, items) {
  for (const item of items) {
    writePremise(stdout, item);
  }
}

function writePremise(stdout, item) {
  stdout.write(`${item.id}\t${item.scope}\t${item.strength}\t${item.text}\n`);
}

function usage(stderr) {
  stderr.write(`usage:
  brain premise list [--repo name] [--scope name]
  brain premise add TEXT --strength always|never|prefer --scope name|"*" --repo name [--repo name ...] [--id slug] [--source path]
  brain premise show ID
  brain premise rm ID
  brain premise search QUERY
  brain premise stats
  brain root
  brain scope [--cwd DIR]
  brain installed [write --bin-dir DIR [--target PATH ...] [--claude] | remove]
  brain workspace check
  brain next [--cwd DIR] [--json] [--no-pr]
  brain flows
  brain worktree list [--cwd DIR] [--json]
  brain mcp
  brain accept-skill NAME
  brain link-skills [--apply] --target PATH [--target PATH ...]
${skillsUsage}`);
}

// orderFlags puts valued flags before positionals.
// The add command puts TEXT first, and later flags must still parse.
function orderFlags(valued, args) {
  const flags = [];
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      pos.push(...args.slice(i + 1));
      break;
    }
    const split = splitFlag(arg);
    if (!split.isFlag) {
      pos.push(arg);
      continue;
    }
    if (split.name === "h" || split.name === "help") {
      flags.push(arg);
      continue;
    }
    if (!valued.has(split.name)) {
      throw new Error(`unknown flag --${split.name}`);
    }
    flags.push(arg);
    if (split.hasValue) {
      continue;
    }
    if (i + 1 >= args.length) {
      throw new Error(`flag --${split.name} needs a value`);
    }
    i += 1;
    flags.push(args[i]);
  }
  return flags.concat(pos);
}

function splitFlag(arg) {
  if (arg.length < 2 || !arg.startsWith("-")) {
    return { isFlag: false };
  }
  const body = arg.replace(/^-+/, "");
  if (body === "") {
    return { isFlag: false };
  }
  const eq = body.indexOf("=");
  const name = eq === -1 ? body : body.slice(0, eq);
  if (name === "") {
    return { isFlag: false };
  }
  return { name, hasValue: eq !== -1, isFlag: true };
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return import.meta.url === pathToFileURL(entry).href;
  }
}

if (isDirectRun()) {
  const code = await run(process.argv.slice(2), process.stdout, process.stderr);
  process.exit(code);
}
