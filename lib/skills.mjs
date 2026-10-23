import { spawn } from "node:child_process";
import { lstat, mkdir, readdir, rename, symlink, unlink } from "node:fs/promises";
import { join } from "node:path";

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
  await commitMove(root, name, draftRel, activeRel, wasTracked);
}

export async function linkSkills(root, targets, apply) {
  const activeDir = join(root, "skills", "active");
  const entries = await readdir(activeDir, { withFileTypes: true });
  const names = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    names.push(entry.name);
  }
  names.sort();
  const lines = [];
  for (const target of targets) {
    for (const name of names) {
      const source = join(activeDir, name);
      const dest = join(target, name);
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
