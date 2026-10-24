import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";

import { git, ifMissing } from "./io.mjs";
import { resolveRepo } from "./scope.mjs";

// Files that give an agent its rules in a repo.
const instructionFiles = ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"];
const ruleDirs = [".cursor/rules"];
const skillDirs = [".claude/skills", ".agents/skills", "skills"];
const agentDirs = [".claude/agents", ".agents/agents"];
const commandDirs = [".claude/commands", ".agents/commands"];

// scanScopes scans the roots of every scope in brain.config.json. Each repo dir gets the
// scope as a prefix, such as "qdrant/qdrant-cloud-ui". A repo whose own scope differs
// from the root scope, such as a third-party clone, is listed as skipped.
export async function scanScopes(config, origin = originName, resolve = (dir) => resolveRepo(dir, config)) {
  const out = { roots: [], repos: [], copies: [] };
  const roots = Object.entries(config.scopes).flatMap(([scope, value]) => value.roots.map((root) => ({ scope, root })));
  for (const { scope, root } of roots) {
    const inv = await ifMissing(scanWorkspace(root, origin), null);
    if (!inv) {
      continue;
    }
    out.roots.push(`${scope}: ${relativeHome(root)}`);
    const { kept = [], skipped = [] } = Object.groupBy(inv.repos, (repo) =>
      repo.dir === "." || resolve(join(root, repo.dir)).scope === scope ? "kept" : "skipped",
    );
    out.repos.push(...kept.map((repo) => ({ ...repo, dir: `${scope}/${repo.dir}`, scope })));
    out.copies.push(
      ...skipped.map((repo) => `${scope}/${repo.dir} (not in scope ${scope})`),
      ...inv.copies.map((c) => `${scope}/${c}`),
    );
  }
  return out;
}

// scanWorkspace lists the agent config of the workspace root and of each repo in it.
// A copy (a directory whose origin repo also has its own directory) is skipped.
export async function scanWorkspace(root, origin = originName) {
  const repos = [await scanRepo(root, ".", "(workspace)")];
  const origins = await originsOf(root, origin);
  const originDirs = new Set(origins.keys());
  const copies = [];
  for (const [dir, name] of origins) {
    if (dir !== name && originDirs.has(name)) {
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

// originsOf maps each visible dir of root that has an origin remote to the origin repo name.
async function originsOf(root, origin) {
  const dirs = (await readdir(root, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .toSorted();
  const origins = new Map();
  for (const dir of dirs) {
    const name = origin(join(root, dir));
    if (name !== "") {
      origins.set(dir, name);
    }
  }
  return origins;
}

async function scanRepo(path, dir, origin) {
  return {
    dir,
    origin,
    files: await instructionHashes(path),
    skills: await scanSkills(path),
    agents: await scanFiles(path, agentDirs),
    commands: await scanFiles(path, commandDirs),
  };
}

// instructionHashes lists the instruction files and the rule files of a repo.
async function instructionHashes(path) {
  const files = [];
  for (const rel of instructionFiles) {
    const hash = await fileHash(join(path, rel));
    if (hash) {
      files.push({ path: rel, hash });
    }
  }
  for (const rule of await scanFiles(path, ruleDirs)) {
    files.push({ path: rule.path, hash: rule.hash });
  }
  return files;
}

// scanSkills lists the skills of a repo by name, with the source that skills-lock.json gives.
async function scanSkills(path) {
  const skills = new Map();
  for (const rel of skillDirs) {
    for (const name of (await names(join(path, rel))).filter((n) => !skills.has(n))) {
      // An empty hash is a skill entry with no readable SKILL.md, such as a dangling link.
      const hash = await fileHash(join(path, rel, name, "SKILL.md"));
      skills.set(name, { name, path: `${rel}/${name}`, hash, source: "" });
    }
  }
  const lock = JSON.parse(await ifMissing(readFile(join(path, "skills-lock.json"), "utf8"), "{}")).skills ?? {};
  for (const [name, entry] of Object.entries(lock)) {
    if (skills.has(name)) {
      skills.get(name).source = entry.source ?? "";
    }
  }
  // Names are unique in the map, so no two are equal.
  return [...skills.values()].toSorted((a, b) => (a.name < b.name ? -1 : 1));
}

// scanFiles lists the readable files in each dir of dirs under path. A name in an earlier
// dir hides the same name in a later dir.
async function scanFiles(path, dirs) {
  const out = [];
  for (const rel of dirs) {
    for (const name of await names(join(path, rel))) {
      const hash = await fileHash(join(path, rel, name));
      if (hash && !out.some((f) => f.name === name)) {
        out.push({ name, path: `${rel}/${name}`, hash });
      }
    }
  }
  return out;
}

async function names(dir) {
  return (await ifMissing(readdir(dir), [])).filter((n) => !n.startsWith(".")).toSorted();
}

// fileHash follows symlinks and returns "" for a missing file or a directory.
async function fileHash(path) {
  const real = await ifMissing(realpath(path), null);
  if (!real || !(await stat(real)).isFile()) {
    return "";
  }
  return createHash("sha256")
    .update(await readFile(real))
    .digest("hex")
    .slice(0, 12);
}

function originName(path) {
  return basename(git(path, ["remote", "get-url", "origin"]) ?? "").replace(/\.git$/u, "");
}

async function skillHashes(dir) {
  const hashes = new Map();
  for (const name of await names(dir)) {
    hashes.set(name, await fileHash(join(dir, name, "SKILL.md")));
  }
  return hashes;
}

// brainSkills lists the brain's own skills and its vendored third-party skills, with hashes.
export async function brainSkills(brain) {
  return {
    active: await skillHashes(join(brain, "skills", "active")),
    vendored: await skillHashes(join(brain, ".agents", "skills")),
  };
}

// conflicts finds repo skills that are broken, or that clash with the brain by name or by content.
export function conflicts(inventory, brain) {
  return inventory.repos.flatMap((repo) =>
    repo.skills.map((skill) => skillConflict(repo, skill, brain)).filter(Boolean),
  );
}

// skillConflict returns the conflict line of one repo skill, or "" when it has none.
function skillConflict(repo, skill, brain) {
  if (skill.hash === "") {
    return `broken\t${repo.dir}/${skill.path}\tno readable SKILL.md`;
  }
  if (brain.active.has(skill.name)) {
    return `collision\t${repo.dir}/${skill.path}\tsame name as brain skill ${skill.name}`;
  }
  const hash = brain.vendored.get(skill.name);
  if (hash && hash !== skill.hash) {
    return `version\t${repo.dir}/${skill.path}\t${skill.hash} differs from brain .agents/skills/${skill.name} ${hash}`;
  }
  return "";
}

function relativeHome(path) {
  const rel = relative(homedir(), path);
  return rel.startsWith("..") ? path : `~/${rel}`;
}
