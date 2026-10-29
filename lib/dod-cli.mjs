import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { dodPath, listDods } from "./dod-path.mjs";
import { lintDod, newDod, parseDod, readStanding, runDod, treeFingerprint } from "./dod.mjs";
import { flags, ifMissing, UsageError } from "./io.mjs";
import { brainHome, brainRoot } from "./premise.mjs";
import { loadConfig, resolveRepo } from "./scope.mjs";

const actions = { path: dodShowPath, init: dodInit, lint: dodLint, run: dodRun };

// cmdDod handles the Definition of Done of a task in the worktree at --cwd: path, init, lint,
// run, and list. The task is --task, or the branch. Lint and run measure the tree of that
// worktree.
export async function cmdDod(args, stdout, stderr) {
  const [sub, ...rest] = args;
  const f = flags(rest, { cwd: "string", task: "string", title: "string", done: "boolean", replace: "boolean" });
  if (f.pos.length > 0 || (sub !== "list" && !Object.hasOwn(actions, sub))) {
    throw new UsageError();
  }
  const cwd = f.cwd || process.cwd();
  const { dir, path, problem } = dodPath(cwd, f.task);
  if (sub === "list" && dir !== "") {
    return dodList(dir, stdout);
  }
  if (problem !== "") {
    return dodProblem(problem, f.task ? "" : dir, stderr);
  }
  const { repo } = resolveRepo(cwd, loadConfig(brainHome()));
  const standing = readStanding(brainHome(), repo);
  const dod = { path, cwd, repo, standing, title: f.title, done: f.done, replace: f.replace };
  return actions[sub](dod, stdout, stderr);
}

// listText prints one DoD per line: the date of its last change, the task, and the title.
function listText(dods) {
  return dods.map((d) => `${d.changed.toISOString().slice(0, 10)}\t${d.task}\t${d.title}\n`).join("");
}

async function dodList(dir, stdout) {
  stdout.write(listText(await listDods(dir)) || "no DoD in this worktree\n");
  return 0;
}

// dodProblem prints why no DoD file resolves. With dir, it lists the DoDs to pick a task from.
async function dodProblem(problem, dir, stderr) {
  stderr.write(`${problem}\n${dir === "" ? "" : listText(await listDods(dir))}`);
  return 1;
}

async function dodShowPath({ path }, stdout) {
  stdout.write(`${path}\n`);
  return 0;
}

// dodInit writes a new DoD. --replace restarts the DoD of the same task.
async function dodInit({ path, title, repo, standing, replace }, stdout, stderr) {
  const template = await readFile(join(brainRoot(), "templates", "dod.md"), "utf8");
  await mkdir(dirname(path), { recursive: true });
  const text = newDod(template, title || basename(path, ".md"), standing);
  try {
    await writeFile(path, text, { flag: replace ? "w" : "wx" });
  } catch (err) {
    if (err.code === "EEXIST") {
      stderr.write(
        `a DoD exists: ${path}. Read its title: for another task, pass --task <slug>; to restart this task, pass --replace\n`,
      );
      return 1;
    }
    throw err;
  }
  if (standing === "") {
    stderr.write(`no dod/${repo}.md in the brain home: write the check of this repo in the DoD\n`);
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

async function dodLint({ path, cwd, standing, done }, stdout, stderr) {
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

async function dodRun({ path, cwd }, stdout, stderr) {
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
