import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, readdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { brainRoot } from "./premise.mjs";
import { readLinkTargets } from "./skills.mjs";

export const skillsUsage = `  brain skills list
  brain skills add SOURCE --skill NAME --kind KIND [--kind KIND] [--apply]
  brain skills check
  brain skills update [--apply]
  brain skills sync
  brain skills remove NAME [--apply]
`;

export async function runSkills(args, stdout, stderr) {
  if (args.length === 0) {
    usage(stderr);
    return 1;
  }
  let parsed;
  try {
    parsed = parseArgs(args.slice(1));
  } catch (err) {
    if (err.code === "HELP") {
      usage(stderr);
      return 1;
    }
    stderr.write(`${err.message}\n`);
    return 1;
  }
  try {
    switch (args[0]) {
      case "list":
        return await cmdList(parsed, stdout, stderr);
      case "check":
        return await cmdCheck(parsed, stdout, stderr);
      case "add":
        return await cmdAdd(parsed, stdout, stderr);
      case "update":
        return await cmdUpdate(parsed, stdout, stderr);
      case "sync":
        return await cmdSync(parsed, stdout, stderr);
      case "remove":
        return await cmdRemove(parsed, stderr);
      default:
        usage(stderr);
        return 1;
    }
  } catch (err) {
    stderr.write(`${err.message}\n`);
    if (err.code === "ENOENT") {
      return 1;
    }
    return 2;
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
  if (missing > 0) {
    return 1;
  }
  return 0;
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
    const code = await runApply(args, stderr);
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
  const rows = await allRows();
  for (const row of rows) {
    if (await hasSkillFile(row.name)) {
      continue;
    }
    const args = addArgs(row.source, row.name);
    stdout.write(commandLine(args));
    const code = await runApply(args, stderr);
    if (code !== 0) {
      return code;
    }
  }
  const updateArgs = ["update", "-p", "-y"];
  stdout.write(commandLine(updateArgs));
  const code = await runApply(updateArgs, stderr);
  if (code !== 0) {
    return code;
  }
  await linkRepoSkills(stdout);
  return 0;
}

async function cmdRemove(parsed, stderr) {
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
    const code = await runApply(removeArgs(name), stderr);
    if (code !== 0) {
      return code;
    }
  }
  catalog.skills = kept;
  await writeCatalog(catalog);
  return 0;
}

function addArgs(source, name) {
  return ["add", source, "--skill", name, "--copy", "-y"];
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

function parseArgs(args) {
  const skill = [];
  const kind = [];
  const pos = [];
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      pos.push(...args.slice(i + 1));
      break;
    }
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--skill" || arg.startsWith("--skill=")) {
      const taken = takeValue(arg, args, i);
      i = taken.index;
      skill.push(taken.value);
      continue;
    }
    if (arg === "--kind" || arg.startsWith("--kind=")) {
      const taken = takeValue(arg, args, i);
      i = taken.index;
      kind.push(taken.value);
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      const err = new Error("help");
      err.code = "HELP";
      throw err;
    }
    if (arg.startsWith("-")) {
      throw new Error(`unknown flag ${arg}`);
    }
    pos.push(arg);
  }
  return { skill, kind, pos, apply };
}

function takeValue(arg, args, index) {
  const eq = arg.indexOf("=");
  if (eq !== -1) {
    return { value: arg.slice(eq + 1), index };
  }
  const next = index + 1;
  if (next >= args.length || args[next].startsWith("-")) {
    throw new Error(`flag ${arg} needs a value`);
  }
  return { value: args[next], index: next };
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
  try {
    await readFile(join(vendorDir(), name, "SKILL.md"));
    return true;
  } catch (err) {
    if (err.code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

async function installedNames() {
  const names = new Set();
  let entries;
  try {
    entries = await readdir(vendorDir(), { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") {
      return names;
    }
    throw err;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (await hasSkillFile(entry.name)) {
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
  const path = join(brainRoot(), "skills", "internal.json");
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      return { skills: [] };
    }
    throw err;
  }
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.skills)) {
    throw new Error("internal.json needs a skills array");
  }
  return parsed;
}

async function linkRepoSkills(stdout) {
  const targets = await readLinkTargets(brainRoot());
  const names = await installedNames();
  for (const target of targets) {
    await mkdir(target, { recursive: true });
    for (const name of names) {
      const dest = join(target, name);
      const source = join(vendorDir(), name);
      try {
        const stat = await lstat(dest);
        if (!stat.isSymbolicLink()) {
          stdout.write(`skip ${dest}\n`);
          continue;
        }
        await rm(dest);
      } catch (err) {
        if (err.code !== "ENOENT") {
          throw err;
        }
      }
      await symlink(source, dest);
      stdout.write(`ln -sfn ${source} ${dest}\n`);
    }
  }
}

// BRAIN_SKILLS_BIN is the skills executable, not npx.
// A set value receives list, add, update, or remove directly.
function spawnSkills(args) {
  const override = process.env.BRAIN_SKILLS_BIN;
  let cmd = "npx";
  let cmdArgs = ["skills", ...args];
  if (override) {
    cmd = override;
    cmdArgs = args;
  }
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      cwd: brainRoot(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function runApply(args, stderr) {
  const result = await spawnSkills(args);
  if (result.stderr) {
    stderr.write(result.stderr);
  }
  if (result.code !== 0) {
    return result.code;
  }
  return 0;
}

function usage(stderr) {
  stderr.write(`usage:\n${skillsUsage}`);
}
