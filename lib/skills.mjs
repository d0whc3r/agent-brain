import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, readdir, readlink, rename, symlink, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// A slug cannot contain a path separator, so the move stays inside root.
const namePattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function skillError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export async function acceptSkill(root, name) {
  if (typeof name !== "string" || !namePattern.test(name)) {
    throw skillError(`bad skill name: ${name}`, "BAD_NAME");
  }
  const draftRel = join("skills", "drafts", name);
  const activeRel = join("skills", "active", name);
  const draft = join(root, draftRel);
  const active = join(root, activeRel);
  await requireDraft(draft, name);
  await rejectActive(active, name);

  const listed = await git(root, ["ls-files", "-z", "--", draftRel]);
  const wasTracked = listed.stdout.length > 0;
  await mkdir(join(root, "skills", "active"), { recursive: true });
  await rename(draft, active);
  try {
    await commitMove(root, name, draftRel, activeRel, wasTracked);
  } catch (err) {
    // A failed commit puts the draft back, so a retry starts clean.
    await git(root, ["reset", "-q", "--", draftRel, activeRel]).catch(() => {});
    await rename(active, draft);
    throw err;
  }
  const targets = await readLinkTargets(root);
  if (targets.length === 0) {
    return;
  }
  await linkSkills(root, targets, true);
}

// Read link paths after the commit. A missing file means no refresh.
export async function readLinkTargets(root) {
  const path = join(root, "mcp", "link-targets.txt");
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const targets = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    // A leading ~/ is the home directory, so the file works on any machine.
    targets.push(line.startsWith("~/") ? join(homedir(), line.slice(2)) : line);
  }
  return targets;
}

// linkSkills links the brain skills (skills/active) and the vendored third-party skills
// (.agents/skills) into each target. A brain skill wins over a vendored skill with the same
// name. A target entry that is not a brain link (a folder, or a link to somewhere else)
// belongs to another install, so it is skipped.
export async function linkSkills(root, targets, apply) {
  const sourceDirs = [join(root, "skills", "active"), join(root, ".agents", "skills")];
  const sources = new Map();
  for (const dir of sourceDirs) {
    for (const name of await skillNames(dir)) {
      if (!sources.has(name)) {
        sources.set(name, join(dir, name));
      }
    }
  }
  const names = [...sources.keys()].sort();
  const lines = [];
  for (const target of targets) {
    for (const dest of await staleLinks(target, sourceDirs, names)) {
      lines.push(`rm ${dest}`);
      if (apply) {
        await unlink(dest);
      }
    }
    for (const name of names) {
      const source = sources.get(name);
      const dest = join(target, name);
      if (await isForeign(dest, sourceDirs)) {
        lines.push(`skip ${dest} (not a brain link)`);
        continue;
      }
      lines.push(`ln -sfn ${source} ${dest}`);
      if (!apply) {
        continue;
      }
      await mkdir(target, { recursive: true });
      await replaceLink(source, dest);
    }
  }
  return lines;
}

// skillNames lists the directories in dir that hold a SKILL.md. A missing dir has none.
async function skillNames(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const names = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    try {
      await lstat(join(dir, entry.name, "SKILL.md"));
      names.push(entry.name);
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw err;
      }
    }
  }
  return names;
}

async function isForeign(dest, sourceDirs) {
  try {
    if (!(await lstat(dest)).isSymbolicLink()) {
      return true;
    }
    return !sourceDirs.includes(dirname(await readlink(dest)));
  } catch (err) {
    if (err.code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

// A link into a brain source dir whose skill is gone. Links to other places stay.
async function staleLinks(target, sourceDirs, names) {
  let entries;
  try {
    entries = await readdir(target, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const keep = new Set(names);
  const out = [];
  for (const entry of entries) {
    if (!entry.isSymbolicLink() || keep.has(entry.name)) {
      continue;
    }
    const dest = join(target, entry.name);
    if (sourceDirs.includes(dirname(await readlink(dest)))) {
      out.push(dest);
    }
  }
  return out;
}

async function requireDraft(draft, name) {
  let info;
  try {
    info = await lstat(draft);
  } catch (err) {
    if (err.code === "ENOENT") {
      throw skillError(`missing draft: ${name}`, "ENOENT");
    }
    throw err;
  }
  if (!info.isDirectory()) {
    throw skillError(`missing draft: ${name}`, "ENOENT");
  }
}

async function rejectActive(active, name) {
  try {
    await lstat(active);
  } catch (err) {
    if (err.code === "ENOENT") {
      return;
    }
    throw err;
  }
  throw skillError(`active skill exists: ${name}`, "EXISTS");
}

// Stage and commit only the moved skill. Do not push.
async function commitMove(root, name, draftRel, activeRel, wasTracked) {
  const paths = [activeRel];
  if (wasTracked) {
    paths.unshift(draftRel);
    await git(root, ["add", "-A", "--", ...paths]);
  } else {
    await git(root, ["add", "--", activeRel]);
  }
  await git(root, [
    "commit",
    "--no-gpg-sign",
    "-m",
    `skill: accept ${name}`,
    "--",
    ...paths,
  ]);
}

async function replaceLink(source, dest) {
  try {
    await unlink(dest);
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
  await symlink(source, dest);
}

function git(root, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: root,
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
      if (code !== 0) {
        const err = new Error(stderr.trim() || `git ${args[0]} exited ${code}`);
        err.code = "GIT";
        reject(err);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
