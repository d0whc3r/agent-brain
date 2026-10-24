#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { dodPath, lintDod, newDod, parseDod, readStanding, runDod, treeFingerprint } from "../lib/dod.mjs";
import { flags, ifMissing, UsageError } from "../lib/io.mjs";
import { brainRoot, open, statuses, strengths } from "../lib/premise.mjs";
import { loadConfig, resolveRepo, validScope } from "../lib/scope.mjs";
import { acceptSkill, linkSkills } from "../lib/skills.mjs";
import { loadFlows, matchFlows, repoContext } from "../lib/flows.mjs";
import { repeatOf, suggestFlow } from "../lib/decide.mjs";
import { premiseStats } from "../lib/stats.mjs";
import { formatWorktree, listWorktrees } from "../lib/worktrees.mjs";
import { readReceipt, receiptPath, removeReceipt, writeReceipt } from "../lib/receipt.mjs";
import { brainSkills, conflicts, scanScopes } from "../lib/workspace.mjs";
import { runSkills, skillsUsage } from "../lib/third-party.mjs";

const origins = new Set(["correction", "defect"]);

const usageText = `usage:
  brain premise list [--repo name] [--scope name] [--status active|candidate]
  brain premise add TEXT --strength always|never|prefer --scope name|"*" --repo name [--repo name ...] [--id slug] [--source path] [--status active|candidate]
  brain premise seen ID --repo name --origin correction|defect [--date YYYY-MM-DD]
  brain premise promote ID
  brain premise show ID
  brain premise rm ID
  brain premise search QUERY
  brain premise stats
  brain root
  brain scope [--cwd DIR]
  brain installed [write --bin-dir DIR [--target PATH ...] [--claude] | remove]
  brain workspace check
  brain next [--cwd DIR] [--json] [--no-pr] [--request TEXT]
  brain flows
  brain worktree list [--cwd DIR] [--json]
  brain mcp [check]
  brain accept-skill NAME
  brain link-skills [--apply] --target PATH [--target PATH ...]
  brain dod path|run [--cwd DIR]
  brain dod init [--cwd DIR] [--title TEXT] [--replace]
  brain dod lint [--cwd DIR] [--done]
${skillsUsage}`;

// Each command takes the arguments after its name and returns the exit code.
// A bad command line throws UsageError. run turns any other error into exit 1 or 2.
const commands = {
  premise: (args, stdout, stderr) => dispatch(premiseCommands, args, stdout, stderr),
  root: cmdRoot,
  scope: cmdScope,
  installed: cmdInstalled,
  workspace: cmdWorkspace,
  next: cmdNext,
  flows: cmdFlows,
  worktree: cmdWorktree,
  mcp: cmdMCP,
  skills: runSkills,
  "accept-skill": cmdAcceptSkill,
  "link-skills": cmdLinkSkills,
  dod: cmdDod,
};

const premiseCommands = {
  list: cmdList,
  add: cmdAdd,
  show: cmdShow,
  rm: cmdRm,
  search: cmdSearch,
  stats: cmdStats,
  seen: cmdSeen,
  promote: cmdPromote,
};

export async function run(args, stdout, stderr) {
  try {
    return await dispatch(commands, args, stdout, stderr);
  } catch (err) {
    if (err instanceof UsageError) {
      stderr.write(err.message ? `${err.message}\n` : usageText);
      return 1;
    }
    stderr.write(`${err.message}\n`);
    return exitCode(err);
  }
}

function dispatch(table, args, stdout, stderr) {
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

async function cmdList(args, stdout) {
  const f = flags(args, { repo: "string", scope: "string", status: "string" });
  if (f.pos.length !== 0) {
    throw new UsageError("list takes no text");
  }
  const status = f.status || "active";
  if (!statuses.has(status)) {
    throw new UsageError("list needs --status active or candidate");
  }
  const store = await open(brainRoot());
  writePremises(stdout, await store.list(f.repo ?? "", f.scope ?? null, status));
  return 0;
}

async function cmdAdd(args, stdout, stderr) {
  const f = flags(args, {
    strength: "string",
    scope: "string",
    id: "string",
    source: "string",
    repo: "list",
    status: "string",
  });
  if (f.pos.length !== 1) {
    throw new UsageError("add needs one TEXT argument");
  }
  if (!strengths.has(f.strength)) {
    throw new UsageError("add needs --strength always, never, or prefer");
  }
  const status = f.status || "active";
  if (!statuses.has(status)) {
    throw new UsageError("add needs --status active or candidate");
  }
  const config = loadConfig(brainRoot());
  if (!validScope(f.scope, config)) {
    throw new UsageError(`add needs --scope ${[...Object.keys(config.scopes), '"*"'].join(", ")}`);
  }
  const store = await open(brainRoot());
  const added = await store.add({
    id: f.id,
    text: f.pos[0],
    strength: f.strength,
    scope: f.scope,
    repos: f.repo,
    source: f.source,
    status,
  });
  stdout.write(`${added.id}\n`);
  // The hint goes to stderr, so a script that reads the id from stdout keeps working.
  try {
    const repeat = await repeatOf(config, store, added);
    if (repeat) {
      stderr.write(
        `possible repeat of ${repeat.id} (confidence ${repeat.confidence.toFixed(2)}, local model): ${repeat.text}\n`,
      );
    }
  } catch (err) {
    stderr.write(`local model: ${err.message}\n`);
  }
  return 0;
}

async function cmdShow(args, stdout) {
  const id = oneArg(args, "show");
  writePremises(stdout, [await (await open(brainRoot())).get(id)]);
  return 0;
}

async function cmdRm(args) {
  const id = oneArg(args, "rm");
  await (await open(brainRoot())).delete(id);
  return 0;
}

async function cmdSearch(args, stdout) {
  const query = oneArg(args, "search");
  writePremises(stdout, await (await open(brainRoot())).search(query));
  return 0;
}

// cmdStats prints id, status, applied, hits, rejected, seen, last date, and a flag.
// Active: unused (never applied), stale (not applied in 90 days), noisy (often rejected),
// or idle (applied 10 times or more with no hit). Candidate: ready (enough repeats) or expired.
async function cmdStats(args, stdout) {
  if (args.length !== 0) {
    throw new UsageError("stats takes no arguments");
  }
  for (const row of await premiseStats(brainRoot())) {
    const cells = row.status === "active" ? [row.applied, row.hits, row.rejected, "-"] : ["-", "-", "-", row.seen];
    stdout.write(`${[row.id, row.status, ...cells, row.last || "-", row.flag || "-"].join("\t")}\n`);
  }
  return 0;
}

// cmdSeen records one repeat of a rule: today or --date, the repo, and the origin.
async function cmdSeen(args) {
  const f = flags(args, { repo: "string", origin: "string", date: "string" });
  if (f.pos.length !== 1 || !f.repo || !origins.has(f.origin)) {
    throw new UsageError("seen needs ID --repo name --origin correction|defect");
  }
  const date = f.date || new Date().toISOString().slice(0, 10);
  await (await open(brainRoot())).see(f.pos[0], `${date} ${f.repo} ${f.origin}`);
  return 0;
}

// cmdPromote makes a candidate active, so reviews apply it.
async function cmdPromote(args) {
  const id = oneArg(args, "promote");
  await (await open(brainRoot())).update(id, { status: "active" });
  return 0;
}

function cmdRoot(args, stdout) {
  if (args.length !== 0) {
    throw new UsageError();
  }
  stdout.write(`${brainRoot().replace(/\/$/, "")}\n`);
  return 0;
}

// cmdScope prints the scope, repo, origin owner, and scope root of the repo at --cwd.
// "-" as the scope means the repo is in no scope, so only global premises apply.
function cmdScope(args, stdout) {
  const f = flags(args, { cwd: "string" });
  if (f.pos.length !== 0) {
    throw new UsageError();
  }
  const config = loadConfig(brainRoot());
  const found = resolveRepo(f.cwd || process.cwd(), config);
  const roots = config.scopes[found.scope]?.roots ?? [];
  stdout.write(`${found.scope || "-"}\t${found.repo}\t${found.owner || "-"}\t${roots[0] ?? "-"}\n`);
  return 0;
}

// cmdDod handles the Definition of Done of the branch at --cwd: path, init, lint, and run.
// The DoD always belongs to the branch at --cwd, so lint and run measure the tree of that repo.
async function cmdDod(args, stdout, stderr) {
  const [sub, ...rest] = args;
  const f = flags(rest, { cwd: "string", title: "string", done: "boolean", replace: "boolean" });
  if (f.pos.length !== 0) {
    throw new UsageError();
  }
  const cwd = f.cwd || process.cwd();
  const path = dodPath(cwd);
  if (path === "") {
    stderr.write(`not a git repo: ${cwd}\n`);
    return 1;
  }
  const { repo } = resolveRepo(cwd, loadConfig(brainRoot()));
  const standing = readStanding(brainRoot(), repo);
  switch (sub) {
    case "path":
      stdout.write(`${path}\n`);
      return 0;
    case "init":
      return dodInit(path, f.title || basename(path, ".md"), { repo, standing, replace: f.replace }, stdout, stderr);
    case "lint":
      return dodLint(path, cwd, standing, f.done, stdout, stderr);
    case "run":
      return dodRun(path, cwd, stdout, stderr);
    default:
      throw new UsageError();
  }
}

// dodInit writes a new DoD. --replace overwrites the DoD of an earlier task on the same branch.
async function dodInit(path, title, { repo, standing, replace }, stdout, stderr) {
  const template = await readFile(join(brainRoot(), "templates", "dod.md"), "utf8");
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, newDod(template, title, standing), { flag: replace ? "w" : "wx" });
  } catch (err) {
    if (err.code === "EEXIST") {
      stderr.write(`a DoD exists: ${path}. Check its title, and use --replace only for a DoD of another task\n`);
      return 1;
    }
    throw err;
  }
  if (standing === "") {
    stderr.write(`no dod/${repo}.md in the brain: write the check of this repo in the DoD\n`);
  }
  stdout.write(`${path}\n`);
  return 0;
}

async function readDod(path, stderr) {
  const text = await ifMissing(readFile(path, "utf8"), null);
  if (text === null) {
    stderr.write(`no DoD at ${path}: run brain dod init\n`);
  }
  return text;
}

async function dodLint(path, cwd, standing, done, stdout, stderr) {
  const text = await readDod(path, stderr);
  if (text === null) {
    return 1;
  }
  const tree = done ? treeFingerprint(cwd) : "";
  const problems = lintDod(text, { standing: parseDod(standing), done, tree });
  for (const problem of problems) {
    stdout.write(`${problem}\n`);
  }
  if (problems.length > 0) {
    return 1;
  }
  stdout.write(`ok: ${parseDod(text).length} criteria${done ? `, each with evidence for tree ${tree}` : ""}\n`);
  return 0;
}

async function dodRun(path, cwd, stdout, stderr) {
  const text = await readDod(path, stderr);
  if (text === null) {
    return 1;
  }
  const result = runDod(text, cwd);
  await writeFile(path, result.text);
  stdout.write(`tree ${result.tree}\n`);
  for (const r of result.results) {
    stdout.write(`${r.ok ? "pass" : "fail"}\texit ${r.status}\t${r.criterion.outcome}\n`);
    if (!r.ok) {
      stdout.write(`${r.tail}\n`);
    }
  }
  if (!result.stable) {
    stdout.write("the checks changed files: run brain dod run again\n");
  }
  return result.stable && result.results.every((r) => r.ok) ? 0 : 1;
}

// cmdInstalled prints the install receipt: what install put on disk for this checkout.
// install.sh runs "installed write" and uninstall.sh runs "installed remove".
async function cmdInstalled(args, stdout, stderr) {
  const [sub, ...rest] = args;
  if (sub === "remove" && rest.length === 0) {
    await removeReceipt(brainRoot(), {}, stdout);
    return 0;
  }
  if (sub === "write") {
    const f = flags(rest, { target: "list", "bin-dir": "string", claude: "boolean" });
    if (f.pos.length !== 0) {
      throw new UsageError();
    }
    const items = await writeReceipt(
      brainRoot(),
      { targets: f.target, binDir: f["bin-dir"] ?? "", claude: f.claude },
      stdout,
    );
    stdout.write(`${items.length} items in ${receiptPath()}\n`);
    return 0;
  }
  if (args.length !== 0) {
    throw new UsageError();
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
  const [sub, ...rest] = args;
  if (sub !== "list") {
    throw new UsageError();
  }
  const f = flags(rest, { json: "boolean", cwd: "string" });
  if (f.pos.length !== 0) {
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
  if (f.pos.length !== 0) {
    throw new UsageError();
  }
  const cwd = f.cwd || process.cwd();
  const config = loadConfig(brainRoot());
  const ctx = repoContext(cwd, { pr: !f["no-pr"], config });
  if (!ctx) {
    stderr.write(`not a git repo: ${cwd}\n`);
    return 1;
  }
  const flows = matchFlows(await loadFlows(brainRoot()), ctx);
  const premises = await (await open(brainRoot())).list(ctx.repo, ctx.scope);
  let suggested = null;
  if (f.request) {
    try {
      const answer = await suggestFlow(config, ctx, f.request, flows);
      suggested = answer && { flow: answer.choice, confidence: answer.confidence };
    } catch (err) {
      stderr.write(`local model: ${err.message}\n`);
    }
  }
  if (f.json) {
    const out = { context: ctx, premises: premises.map((p) => p.id), flows };
    if (f.request) {
      out.suggested = suggested;
    }
    stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return 0;
  }
  const ticket = ctx.ticket ? ` (${ctx.ticket})` : "";
  stdout.write(
    `repo ${ctx.repo}, scope ${ctx.scope || "-"}, branch ${ctx.branch || "detached"}${ticket}, ahead ${ctx.ahead}, behind ${ctx.behind}, ${ctx.dirty ? "dirty" : "clean"}, pr ${ctx.pr}, worktrees ${ctx.worktrees}\n`,
  );
  stdout.write(`kinds: ${ctx.kinds.join(", ") || "-"}; ${premises.length} active premises\n`);
  flows.forEach((flow, i) => {
    stdout.write(`${i + 1}. ${flow.name}: ${flow.description ?? ""}\n`);
  });
  if (suggested) {
    stdout.write(`suggested by the local model: ${suggested.flow} (confidence ${suggested.confidence.toFixed(2)})\n`);
  }
  return 0;
}

async function cmdFlows(args, stdout) {
  for (const flow of await loadFlows(brainRoot())) {
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
  const brain = brainRoot();
  try {
    const found = conflicts(await scanScopes(loadConfig(brain)), await brainSkills(brain));
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
  await acceptSkill(brainRoot(), args[0]);
  return 0;
}

async function cmdLinkSkills(args, stdout) {
  const f = flags(args, { apply: "boolean", target: "list" });
  if (f.pos.length !== 0) {
    throw new UsageError("link-skills takes no text");
  }
  if (f.target.includes("")) {
    throw new UsageError("flag --target needs a value");
  }
  if (f.target.length === 0) {
    throw new UsageError("link-skills needs --target PATH");
  }
  for (const line of await linkSkills(brainRoot(), f.target, f.apply)) {
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

function oneArg(args, name) {
  if (args.length !== 1 || args[0].startsWith("-")) {
    throw new UsageError(`${name} needs one argument`);
  }
  return args[0];
}

function writePremises(stdout, items) {
  for (const item of items) {
    stdout.write(`${item.id}\t${item.scope}\t${item.strength}\t${item.text}\n`);
  }
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
