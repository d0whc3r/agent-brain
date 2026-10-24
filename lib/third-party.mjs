import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { flags, ifMissing, UsageError } from "./io.mjs";
import { brainRoot } from "./premise.mjs";
import { linkSkills, readLinkTargets } from "./skills.mjs";

export const skillsUsage = `  brain skills list
  brain skills add SOURCE --skill NAME --kind KIND [--kind KIND] [--apply]
  brain skills check
  brain skills update [--apply]
  brain skills sync
  brain skills remove NAME [--apply]
`;

const commands = { list: cmdList, check: cmdCheck, add: cmdAdd, update: cmdUpdate, sync: cmdSync, remove: cmdRemove };

// runSkills runs one skills command. A bad command line is exit 1, a missing file is exit 1,
// and any other failure is exit 2.
export async function runSkills(args, stdout, stderr) {
  try {
    const [name, ...rest] = args;
    const parsed = flags(rest, { skill: "list", kind: "list", apply: "boolean" });
    if (!Object.hasOwn(commands, name ?? "")) {
      throw new UsageError();
    }
    return await commands[name](parsed, stdout, stderr);
  } catch (err) {
    if (err instanceof UsageError) {
      stderr.write(err.message ? `${err.message}\n` : `usage:\n${skillsUsage}`);
      return 1;
    }
    stderr.write(`${err.message}\n`);
    return err.code === "ENOENT" ? 1 : 2;
  }
}

async function cmdList(parsed, stdout, stderr) {
  if (hasExtra(parsed)) {
    stderr.write("list takes no arguments\n");
    return 1;
  }
  const catalog = await readCatalog();
  const installed = await installedNames();
  for (const row of catalog.skills) {
    const status = installed.has(row.name) ? "installed" : "missing";
    stdout.write(`${row.name}\t${row.source}\t${row.kinds.join(",")}\t${status}\n`);
  }
  return 0;
}

// A skill is present when the repo has .agents/skills/<name>/SKILL.md.
async function cmdCheck(parsed, stdout, stderr) {
  if (hasExtra(parsed)) {
    stderr.write("check takes no arguments\n");
    return 1;
  }
  const catalog = await readCatalog();
  const internal = await readInternal();
  const installed = await installedNames();
  let missing = 0;
  for (const row of catalog.skills.concat(internal.skills)) {
    if (installed.has(row.name)) {
      continue;
    }
    stdout.write(`${row.name}\n`);
    missing += 1;
  }
  return missing > 0 ? 1 : 0;
}

async function cmdAdd(parsed, stdout, stderr) {
  if (parsed.pos.length !== 1) {
    stderr.write("add needs one SOURCE argument\n");
    return 1;
  }
  if (parsed.skill.length !== 1 || parsed.skill[0] === "") {
    stderr.write("add needs one --skill NAME\n");
    return 1;
  }
  if (parsed.kind.length === 0) {
    stderr.write("add needs one --kind KIND\n");
    return 1;
  }
  const catalog = await readCatalog();
  const source = parsed.pos[0];
  const name = parsed.skill[0];
  const args = addArgs(source, name);
  stdout.write(commandLine(args));
  // A failed install must leave the catalog file unchanged.
  if (parsed.apply) {
    const code = runApply(args, stderr);
    if (code !== 0) {
      return code;
    }
  }
  catalog.skills.push({
    name,
    source,
    kinds: parsed.kind.slice(),
  });
  await writeCatalog(catalog);
  return 0;
}

async function cmdUpdate(parsed, stdout, stderr) {
  if (parsed.pos.length !== 0 || parsed.skill.length !== 0 || parsed.kind.length !== 0) {
    stderr.write("update takes no skill arguments\n");
    return 1;
  }
  const args = ["update", "-p", "-y"];
  if (!parsed.apply) {
    stdout.write(commandLine(args));
    return 0;
  }
  return runApply(args, stderr);
}

async function cmdSync(parsed, stdout, stderr) {
  if (hasExtra(parsed)) {
    stderr.write("sync takes no arguments\n");
    return 1;
  }
  const runs = [];
  for (const row of await allRows()) {
    if (!(await hasSkillFile(row.name))) {
      runs.push(addArgs(row.source, row.name));
    }
  }
  runs.push(["update", "-p", "-y"]);
  for (const args of runs) {
    stdout.write(commandLine(args));
    const code = runApply(args, stderr);
    if (code !== 0) {
      return code;
    }
  }
  for (const line of await linkSkills(brainRoot(), await readLinkTargets(brainRoot()), true)) {
    stdout.write(`${line}\n`);
  }
  return 0;
}

async function cmdRemove(parsed, stdout, stderr) {
  if (parsed.pos.length !== 1 || parsed.skill.length !== 0 || parsed.kind.length !== 0) {
    stderr.write("remove needs one NAME argument\n");
    return 1;
  }
  const name = parsed.pos[0];
  const catalog = await readCatalog();
  const kept = catalog.skills.filter((row) => row.name !== name);
  if (kept.length === catalog.skills.length) {
    stderr.write(`skill ${JSON.stringify(name)} not found\n`);
    return 1;
  }
  if (parsed.apply) {
    const code = runApply(removeArgs(name), stderr);
    if (code !== 0) {
      return code;
    }
  }
  catalog.skills = kept;
  await writeCatalog(catalog);
  return 0;
}

// -a codex writes only .agents/skills, the folder Codex and OpenCode read and review-brain
// reads for Claude Code. Without it, npx skills copies into every agent folder it detects.
function addArgs(source, name) {
  return ["add", source, "--skill", name, "-a", "codex", "--copy", "-y"];
}

function removeArgs(name) {
  return ["remove", name, "-p", "-y"];
}

// The printed line is the command a person runs.
// --apply executes those arguments through BRAIN_SKILLS_BIN when that variable is set.
function commandLine(args) {
  return `npx skills ${args.join(" ")}\n`;
}

function hasExtra(parsed) {
  return parsed.pos.length !== 0 || parsed.skill.length !== 0 || parsed.kind.length !== 0 || parsed.apply;
}

function catalogPath() {
  return join(brainRoot(), "skills", "third-party.json");
}

async function readCatalog() {
  const path = catalogPath();
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      const missing = new Error(`catalog not found: ${path}`);
      missing.code = "ENOENT";
      throw missing;
    }
    throw err;
  }
  const catalog = JSON.parse(text);
  if (!catalog || !Array.isArray(catalog.agents) || !Array.isArray(catalog.skills)) {
    throw new Error("catalog needs agents and skills arrays");
  }
  return catalog;
}

async function writeCatalog(catalog) {
  const path = catalogPath();
  const dir = dirname(path);
  const tmp = join(dir, `.third-party-${randomBytes(8).toString("hex")}`);
  try {
    await writeFile(tmp, `${JSON.stringify(catalog, null, 2)}\n`, { mode: 0o644 });
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

function vendorDir() {
  return join(brainRoot(), ".agents", "skills");
}

async function hasSkillFile(name) {
  return (await ifMissing(readFile(join(vendorDir(), name, "SKILL.md")), null)) !== null;
}

// installedNames lists the vendored skills: each dir in .agents/skills with a SKILL.md.
async function installedNames() {
  const names = new Set();
  for (const entry of await ifMissing(readdir(vendorDir(), { withFileTypes: true }), [])) {
    if (entry.isDirectory() && (await hasSkillFile(entry.name))) {
      names.add(entry.name);
    }
  }
  return names;
}

async function allRows() {
  const catalog = await readCatalog();
  const internal = await readInternal();
  return catalog.skills.concat(internal.skills);
}

async function readInternal() {
  const parsed = JSON.parse(
    await ifMissing(readFile(join(brainRoot(), "skills", "internal.json"), "utf8"), '{"skills":[]}'),
  );
  if (!parsed || !Array.isArray(parsed.skills)) {
    throw new Error("internal.json needs a skills array");
  }
  return parsed;
}

// runApply runs npx skills with args in the brain root, copies its stderr, and returns its
// exit code. BRAIN_SKILLS_BIN, when set, is the skills executable and receives args directly.
function runApply(args, stderr) {
  const bin = process.env.BRAIN_SKILLS_BIN;
  const run = spawnSync(bin || "npx", bin ? args : ["skills", ...args], {
    cwd: brainRoot(),
    encoding: "utf8",
    stdio: ["ignore", "ignore", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error) {
    throw run.error;
  }
  if (run.stderr) {
    stderr.write(run.stderr);
  }
  return run.status ?? 1;
}
