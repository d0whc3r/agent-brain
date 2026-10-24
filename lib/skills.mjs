import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

import { gitOrThrow, ifMissing } from "./io.mjs";
import { expandHome } from "./scope.mjs";

// A slug cannot contain a path separator, so the move stays inside root.
const namePattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Brain skills carry this prefix, so a session shows which skill came from the brain.
export const brainPrefix = "brain-";
// Vendored third-party skills are linked under this prefix.
export const thirdPartyPrefix = "brain-tp-";

function skillError(message, code) {
  return Object.assign(new Error(message), { code });
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
  if (!(await ifMissing(lstat(draft), null))?.isDirectory()) {
    throw skillError(`missing draft: ${name}`, "ENOENT");
  }
  if (await ifMissing(lstat(active), null)) {
    throw skillError(`active skill exists: ${name}`, "EXISTS");
  }

  const wasTracked = gitOrThrow(root, ["ls-files", "-z", "--", draftRel]).length > 0;
  await mkdir(join(root, "skills", "active"), { recursive: true });
  await rename(draft, active);
  try {
    commitMove(root, name, draftRel, activeRel, wasTracked);
  } catch (err) {
    // A failed commit puts the draft back, so a retry starts clean.
    try {
      gitOrThrow(root, ["reset", "-q", "--", draftRel, activeRel]);
    } catch {
      // The reset only clears the index. The rename below restores the files.
    }
    await rename(active, draft);
    throw err;
  }
  const targets = await readLinkTargets(root);
  if (targets.length === 0) {
    return;
  }
  await linkSkills(root, targets, true);
}

// Read link paths after the commit. A missing file means no refresh. A leading ~/ is the
// home directory, so the file works on any machine.
export async function readLinkTargets(root) {
  const text = await ifMissing(readFile(join(root, "mcp", "link-targets.txt"), "utf8"), "");
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map(expandHome);
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
  return (await ifMissing(readdir(join(root, "agents")), []))
    .filter((n) => n.endsWith(".md"))
    .map((n) => n.slice(0, -3))
    .sort();
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
    await writeFile(
      join(linked, name, "SKILL.md"),
      template.replaceAll("{{name}}", name).replace("{{description}}", description),
    );
  }
}

// skillNames lists the directories in dir that hold a SKILL.md. A missing dir has none.
async function skillNames(dir) {
  const names = [];
  for (const entry of await ifMissing(readdir(dir, { withFileTypes: true }), [])) {
    if (entry.isDirectory() && (await ifMissing(lstat(join(dir, entry.name, "SKILL.md")), null))) {
      names.push(entry.name);
    }
  }
  return names;
}

// isForeign tells whether dest holds something that is not a brain link: a folder, a file,
// or a link to another place. A missing dest is free.
async function isForeign(dest, sourceDirs) {
  const info = await ifMissing(lstat(dest), null);
  if (!info) {
    return false;
  }
  return !info.isSymbolicLink() || !sourceDirs.includes(dirname(await readlink(dest)));
}

// A link into a brain source dir whose skill is gone. Links to other places stay.
async function staleLinks(target, sourceDirs, names) {
  const keep = new Set(names);
  const out = [];
  for (const entry of await ifMissing(readdir(target, { withFileTypes: true }), [])) {
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

// Stage and commit only the moved skill. Do not push.
function commitMove(root, name, draftRel, activeRel, wasTracked) {
  const paths = wasTracked ? [draftRel, activeRel] : [activeRel];
  gitOrThrow(root, ["add", ...(wasTracked ? ["-A"] : []), "--", ...paths]);
  gitOrThrow(root, ["commit", "--no-gpg-sign", "-m", `skill: accept ${name}`, "--", ...paths]);
}

async function replaceLink(source, dest) {
  await ifMissing(unlink(dest));
  await symlink(source, dest);
}
