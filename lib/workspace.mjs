import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";
import { execFileSync } from "node:child_process";

// Files that give an agent its rules in a repo.
const instructionFiles = ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"];
const ruleDirs = [".cursor/rules"];
const skillDirs = [".claude/skills", ".agents/skills", "skills"];
const agentDirs = [".claude/agents", ".agents/agents"];
const commandDirs = [".claude/commands", ".agents/commands"];

import { resolveRepo } from "./scope.mjs";

// scanScopes scans the roots of every scope in brain.config.json. Each repo dir gets the
// scope as a prefix, such as "qdrant/qdrant-cloud-ui". A repo whose own scope differs
// from the root scope, such as a third-party clone, is listed as skipped.
export async function scanScopes(config, origin = originName, resolve = (dir) => resolveRepo(dir, config)) {
  const out = { roots: [], repos: [], copies: [] };
  for (const [scope, value] of Object.entries(config.scopes)) {
    for (const root of value.roots) {
      let inv;
      try {
        inv = await scanWorkspace(root, origin);
      } catch (err) {
        if (err.code === "ENOENT") {
          continue;
        }
        throw err;
      }
      out.roots.push(`${scope}: ${relativeHome(root)}`);
      for (const repo of inv.repos) {
        if (repo.dir !== "." && resolve(join(root, repo.dir)).scope !== scope) {
          out.copies.push(`${scope}/${repo.dir} (not in scope ${scope})`);
          continue;
        }
        out.repos.push({ ...repo, dir: `${scope}/${repo.dir}`, scope });
      }
      out.copies.push(...inv.copies.map((c) => `${scope}/${c}`));
    }
  }
  return out;
}

// scanWorkspace lists the agent config of the workspace root and of each repo in it.
// A copy (a directory whose origin repo also has its own directory) is skipped.
export async function scanWorkspace(root, origin = originName) {
  const repos = [await scanRepo(root, ".", "(workspace)")];
  const dirs = (await readdir(root, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
  const origins = new Map();
  for (const dir of dirs) {
    const name = origin(join(root, dir));
    if (name !== "") {
      origins.set(dir, name);
    }
  }
  const names = new Set(origins.keys());
  const copies = [];
  for (const [dir, name] of origins) {
    if (dir !== name && names.has(name)) {
      copies.push(`${dir} (copy of ${name})`);
      continue;
    }
    const repo = await scanRepo(join(root, dir), dir, name);
    if (repo.files.length + repo.skills.length + repo.agents.length + repo.commands.length > 0) {
      repos.push(repo);
    }
  }
  return { root, repos, copies };
}

async function scanRepo(path, dir, origin) {
  const files = [];
  for (const rel of instructionFiles) {
    const hash = await fileHash(join(path, rel));
    if (hash) {
      files.push({ path: rel, hash });
    }
  }
  for (const rel of ruleDirs) {
    for (const name of await names(join(path, rel))) {
      const hash = await fileHash(join(path, rel, name));
      if (hash) {
        files.push({ path: `${rel}/${name}`, hash });
      }
    }
  }
  const skills = new Map();
  for (const rel of skillDirs) {
    for (const name of await names(join(path, rel))) {
      if (skills.has(name)) {
        continue;
      }
      // An empty hash is a skill entry with no readable SKILL.md, such as a dangling link.
      const hash = await fileHash(join(path, rel, name, "SKILL.md"));
      skills.set(name, { name, path: `${rel}/${name}`, hash, source: "" });
    }
  }
  for (const [name, entry] of Object.entries(await lockSkills(path))) {
    if (skills.has(name)) {
      skills.get(name).source = entry.source ?? "";
    }
  }
  const agents = [];
  for (const rel of agentDirs) {
    for (const name of await names(join(path, rel))) {
      const hash = await fileHash(join(path, rel, name));
      if (hash && !agents.some((a) => a.name === name)) {
        agents.push({ name, path: `${rel}/${name}`, hash });
      }
    }
  }
  const commands = [];
  for (const rel of commandDirs) {
    for (const name of await names(join(path, rel))) {
      const hash = await fileHash(join(path, rel, name));
      if (hash && !commands.some((c) => c.name === name)) {
        commands.push({ name, path: `${rel}/${name}`, hash });
      }
    }
  }
  return { dir, origin, files, skills: [...skills.values()].sort(byName), agents, commands };
}

function byName(a, b) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

async function names(dir) {
  try {
    return (await readdir(dir)).filter((n) => !n.startsWith(".")).sort();
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "ENOTDIR") {
      return [];
    }
    throw err;
  }
}

// fileHash follows symlinks and returns "" for a missing file or a directory.
async function fileHash(path) {
  try {
    const real = await realpath(path);
    if (!(await stat(real)).isFile()) {
      return "";
    }
    return createHash("sha256").update(await readFile(real)).digest("hex").slice(0, 12);
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "ENOTDIR") {
      return "";
    }
    throw err;
  }
}

async function lockSkills(path) {
  try {
    return JSON.parse(await readFile(join(path, "skills-lock.json"), "utf8")).skills ?? {};
  } catch (err) {
    if (err.code === "ENOENT") {
      return {};
    }
    throw err;
  }
}

function originName(path) {
  try {
    const url = execFileSync("git", ["-C", path, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    }).trim();
    return basename(url).replace(/\.git$/, "");
  } catch {
    return "";
  }
}

// brainSkills lists the brain's own skills and its vendored third-party skills, with hashes.
export async function brainSkills(brain) {
  const active = new Map();
  for (const name of await names(join(brain, "skills", "active"))) {
    active.set(name, await fileHash(join(brain, "skills", "active", name, "SKILL.md")));
  }
  const vendored = new Map();
  for (const name of await names(join(brain, ".agents", "skills"))) {
    vendored.set(name, await fileHash(join(brain, ".agents", "skills", name, "SKILL.md")));
  }
  return { active, vendored };
}

// conflicts finds repo skills that are broken, or that clash with the brain by name or by content.
export function conflicts(inventory, brain) {
  const out = [];
  for (const repo of inventory.repos) {
    for (const skill of repo.skills) {
      if (skill.hash === "") {
        out.push(`broken\t${repo.dir}/${skill.path}\tno readable SKILL.md`);
        continue;
      }
      if (brain.active.has(skill.name)) {
        out.push(`collision\t${repo.dir}/${skill.path}\tsame name as brain skill ${skill.name}`);
        continue;
      }
      const hash = brain.vendored.get(skill.name);
      if (hash && hash !== skill.hash) {
        out.push(`version\t${repo.dir}/${skill.path}\t${skill.hash} differs from brain .agents/skills/${skill.name} ${hash}`);
      }
    }
  }
  return out;
}

function relativeHome(path) {
  const rel = relative(homedir(), path);
  return rel.startsWith("..") ? path : `~/${rel}`;
}
