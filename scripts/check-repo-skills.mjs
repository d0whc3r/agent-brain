#!/usr/bin/env node

// Compare repo skill copies with the brain vendor copies.
// Exit 1 when a shared skill name has a different SKILL.md hash.
// A repo-only skill is listed. It is not a failure.

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const brainRoot = fileURLToPath(new URL("..", import.meta.url));
const workspace = process.env.BRAIN_WORKSPACE ?? join(homedir(), "projects", "qdrant");

const registry = JSON.parse(await readFile(join(brainRoot, "skills", "repo-registry.json"), "utf8"));
const brainDir = join(brainRoot, ".agents", "skills");
const brain = await skillHashes(brainDir);

let drift = 0;
const lines = [];
lines.push(`workspace ${workspace}`);
lines.push(`brain skills ${brain.size}`);

for (const home of registry.homes) {
  const dir = join(workspace, home.path);
  let repo;
  try {
    repo = await skillHashes(dir);
  } catch (err) {
    if (err.code === "ENOENT") {
      lines.push(`\n## ${home.id} missing ${home.path}`);
      continue;
    }
    throw err;
  }
  const overlap = [...repo.keys()].filter((name) => brain.has(name)).sort();
  const drifted = overlap.filter((name) => repo.get(name) !== brain.get(name));
  const same = overlap.length - drifted.length;
  lines.push(`\n## ${home.id} skills=${repo.size} overlap=${overlap.length} same=${same} drift=${drifted.length}`);
  lines.push(home.owns);
  if (home.compare === "hash") {
    for (const name of drifted) {
      drift += 1;
      lines.push(`DRIFT ${name} repo=${repo.get(name)} brain=${brain.get(name)}`);
    }
  }
  const only = [...repo.keys()].filter((name) => !brain.has(name)).sort();
  if (only.length > 0) {
    lines.push(`repo-only ${only.join(", ")}`);
  }
}

lines.push(drift === 0 ? "\nno hash drift" : `\n${drift} drifted skill file(s)`);
process.stdout.write(`${lines.join("\n")}\n`);
process.exit(drift === 0 ? 0 : 1);

async function skillHashes(dir) {
  const out = new Map();
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const file = join(dir, entry.name, "SKILL.md");
    try {
      const bytes = await readFile(file);
      out.set(entry.name, createHash("sha256").update(bytes).digest("hex").slice(0, 12));
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw err;
      }
    }
  }
  return out;
}
