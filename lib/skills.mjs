import { spawn } from "node:child_process";
import { cp, lstat, mkdir, readFile, readdir, readlink, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// A slug cannot contain a path separator, so the move stays inside root.
const namePattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Brain skills carry this prefix, so a session shows which skill came from the brain.
export const brainPrefix = "brain-";
// Vendored third-party skills are linked under this prefix.
export const thirdPartyPrefix = "brain-tp-";

function skillError(message, code) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export async function acceptSkill(root, name) {
  if (typeof name !== "string" || !namePattern.test(name)) {
    throw skillError(`bad skill name: ${name}`, "BAD_NAME");
  }
  if (!name.startsWith(brainPrefix) || name.startsWith(thirdPartyPrefix)) {
    throw skillError(`skill name needs the ${brainPrefix} prefix: ${name}`, "BAD_NAME");
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

// linkSkills links the brain skills (skills/active) and the vendored third-party skills into
// each target. A vendored skill is linked from a copy in .agents/linked named brain-tp-<name>.
// A target entry that is not a brain link (a folder, or a link to somewhere else) belongs
// to another install, so it is skipped. A brain link whose skill is gone is removed, also
// a link into .agents/skills from an install before the prefix.
export async function linkSkills(root, targets, apply) {
  const active = join(root, "skills", "active");
  const vendored = join(root, ".agents", "skills");
  const linked = join(root, ".agents", "linked");
  const sourceDirs = [active, linked, vendored];
  const sources = new Map();
  for (const name of await skillNames(active)) {
    sources.set(name, join(active, name));
  }
  if (apply) {
    await prefixThirdParty(vendored, linked);
    await agentSkills(root, linked);
  }
  for (const name of await skillNames(vendored)) {
    sources.set(thirdPartyPrefix + name, join(linked, thirdPartyPrefix + name));
  }
  // Each agent gets a skill of the same name that runs it, so a skill is the one entry point.
  for (const name of await agentNames(root)) {
    if (!sources.has(name)) {
      sources.set(name, join(linked, name));
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

// prefixThirdParty copies each vendored skill to linked/brain-tp-<name> and sets that name
// in the frontmatter. The copy is rebuilt on each run, so a skill update reaches it.
async function prefixThirdParty(vendored, linked) {
  // Keep linked/opencode-agents: setup-config.mjs writes it, and OpenCode links into it.
  await mkdir(linked, { recursive: true });
  for (const entry of await readdir(linked)) {
    if (entry !== "opencode-agents") {
      await rm(join(linked, entry), { recursive: true, force: true });
    }
  }
  for (const name of await skillNames(vendored)) {
    const dest = join(linked, thirdPartyPrefix + name);
    await cp(join(vendored, name), dest, { recursive: true });
    const file = join(dest, "SKILL.md");
    const text = await readFile(file, "utf8");
    await writeFile(file, text.replace(/^name:.*$/m, `name: ${thirdPartyPrefix}${name}`));
  }
}

async function agentNames(root) {
  try {
    return (await readdir(join(root, "agents"))).filter((n) => n.endsWith(".md")).map((n) => n.slice(0, -3)).sort();
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

// agentSkills writes linked/<agent>/SKILL.md from templates/agent-skill.md for each agent.
async function agentSkills(root, linked) {
  const names = await agentNames(root);
  if (names.length === 0) {
    return;
  }
  const template = await readFile(join(root, "templates", "agent-skill.md"), "utf8");
  for (const name of names) {
    const text = await readFile(join(root, "agents", `${name}.md`), "utf8");
    const description = (text.match(/^description:\s*(.*)$/m) ?? [])[1] ?? `"Run the ${name} agent."`;
    await mkdir(join(linked, name), { recursive: true });
    await writeFile(join(linked, name, "SKILL.md"), template.replaceAll("{{name}}", name).replace("{{description}}", description));
  }
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
