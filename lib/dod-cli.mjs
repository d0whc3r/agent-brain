import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { dodPath, lintDod, newDod, parseDod, readStanding, runDod, treeFingerprint } from "./dod.mjs";
import { flags, ifMissing, UsageError } from "./io.mjs";
import { brainRoot } from "./premise.mjs";
import { loadConfig, resolveRepo } from "./scope.mjs";

// cmdDod handles the Definition of Done of the branch at --cwd: path, init, lint, and run.
// The DoD always belongs to the branch at --cwd, so lint and run measure the tree of that repo.
export async function cmdDod(args, stdout, stderr) {
  const [sub, ...rest] = args;
  const f = flags(rest, { cwd: "string", title: "string", done: "boolean", replace: "boolean" });
  if (f.pos.length > 0) {
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
  const dod = { path, cwd, repo, standing, title: f.title, done: f.done, replace: f.replace };
  switch (sub) {
    case "path":
      stdout.write(`${path}\n`);
      return 0;
    case "init":
      return dodInit(dod, stdout, stderr);
    case "lint":
      return dodLint(dod, stdout, stderr);
    case "run":
      return dodRun(dod, stdout, stderr);
    default:
      throw new UsageError();
  }
}

// dodInit writes a new DoD. --replace overwrites the DoD of an earlier task on the same branch.
async function dodInit({ path, title, repo, standing, replace }, stdout, stderr) {
  const template = await readFile(join(brainRoot(), "templates", "dod.md"), "utf8");
  await mkdir(dirname(path), { recursive: true });
  const text = newDod(template, title || basename(path, ".md"), standing);
  try {
    await writeFile(path, text, { flag: replace ? "w" : "wx" });
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
