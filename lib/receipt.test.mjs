import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { removeReceipt, writeReceipt } from "./receipt.mjs";

function sink() {
  const out = {
    text: "",
    write: (s) => {
      out.text += s;
    },
  };
  return out;
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

test("TestReceiptListsEachHookTool", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "brain-home-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const root = join(home, "brain");
  const pluginDir = join(root, "hooks", "opencode");
  const linkDir = join(home, ".config", "opencode", "plugins");
  await mkdir(pluginDir, { recursive: true });
  await mkdir(linkDir, { recursive: true });
  await mkdir(join(home, ".codex"), { recursive: true });
  await mkdir(join(home, ".claude"), { recursive: true });
  await writeFile(join(pluginDir, "session-premises.js"), "export {}\n");
  await symlink(join(pluginDir, "session-premises.js"), join(linkDir, "brain-session-premises.js"));
  await writeFile(join(home, ".claude", "settings.json"), "node session-premises.mjs\n");
  await writeFile(join(home, ".codex", "hooks.json"), "node session-premises.mjs\n");

  const items = await writeReceipt(root, { home, binDir: join(home, "bin"), targets: [] }, sink());
  assert.deepEqual(
    items.filter((i) => i.type === "hook").map((i) => i.where),
    [
      join(home, ".claude", "settings.json"),
      join(home, ".codex", "hooks.json"),
      join(linkDir, "brain-session-premises.js"),
    ],
  );
});

test("TestReceiptNamesDroppedItems", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "brain-home-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const root = join(home, "brain");
  const skills = join(home, ".claude", "skills");
  const agents = join(home, ".claude", "agents");
  const bin = join(home, "bin");
  for (const dir of [
    join(root, "agents"),
    join(root, "bin"),
    join(root, "skills", "active", "brain-a"),
    skills,
    agents,
    bin,
  ]) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(join(root, "agents", "brain-x.md"), "x\n");
  await writeFile(join(root, "bin", "brain.mjs"), "x\n");
  await symlink(join(root, "agents", "brain-x.md"), join(agents, "brain-x.md"));
  await symlink(join(root, "skills", "active", "brain-a"), join(skills, "brain-a"));
  await symlink(join(home, "elsewhere"), join(skills, "foreign"));
  await symlink(join(root, "bin", "brain.mjs"), join(bin, "brain"));
  await writeFile(join(home, ".claude", "settings.json"), '{"hooks":"node session-premises.mjs"}');
  const opts = { home, binDir: bin, targets: [skills], claude: true };

  let out = sink();
  const items = await writeReceipt(root, opts, out);
  assert.equal(out.text, "");
  assert.deepEqual(
    items.filter((i) => i.type !== "mcp").map((i) => `${i.type} ${i.name}`),
    ["skills brain-a", "agents brain-x", "bin brain", "hook session-premises"],
  );
  const path = join(home, ".local", "share", "agent-brain", "installed.txt");
  assert.match(await readFile(path, "utf8"), /^root\t.*\nskills\tbrain-a\t/u);

  // A new version drops the agent, so its link breaks. The skill link is already gone.
  await rm(join(root, "agents", "brain-x.md"));
  await rm(join(skills, "brain-a"));
  out = sink();
  await writeReceipt(root, opts, out);
  assert.equal(out.text, `removed\tagents\t${join(agents, "brain-x.md")}\n`, "only a link it removed");
  assert.equal(await exists(join(agents, "brain-x.md")), false);
  assert.equal(await exists(join(skills, "foreign")), true);

  out = sink();
  await removeReceipt(root, { ...opts, dryRun: true }, out);
  assert.equal(out.text, `removed\tbin\t${join(bin, "brain")}\n`);
  assert.equal(await exists(join(bin, "brain")), true, "a dry run removes nothing");
  assert.equal(await exists(path), true);

  out = sink();
  await removeReceipt(root, opts, out);
  assert.equal(out.text, `removed\tbin\t${join(bin, "brain")}\n`);
  assert.equal(await exists(join(bin, "brain")), false);
  assert.equal(await exists(path), false);
  assert.equal(await exists(join(skills, "foreign")), true);

  out = sink();
  await removeReceipt(root, opts, out);
  assert.equal(out.text, "note\tno receipt\n");
});

test("TestReceiptOfOtherCheckoutStays", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "brain-home-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const other = join(home, "other");
  await mkdir(other);
  const path = join(home, "installed.txt");
  await writeFile(path, `root\t${other}\nbin\tbrain\t/x/brain\n`);
  const out = sink();
  await removeReceipt(join(home, "brain"), { home, path }, out);
  assert.equal(out.text, `note\treceipt belongs to ${other}. Skipped.\n`);
  assert.equal(await exists(path), true);
});

// movedHome writes a receipt whose checkout is gone: a dead skill link, and a bin link that
// another tool replaced since.
async function movedHome(t) {
  const home = await mkdtemp(join(tmpdir(), "brain-home-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const gone = join(home, "gone");
  const skill = join(home, "skills", "brain-a");
  const bin = join(home, "bin", "brain");
  await mkdir(join(home, "skills"));
  await mkdir(join(home, "bin"));
  await symlink(join(gone, "skills", "active", "brain-a"), skill);
  await symlink(join(home, "skills"), bin);
  const path = join(home, "installed.txt");
  await writeFile(path, `root\t${gone}\nskills\tbrain-a\t${skill}\nbin\tbrain\t${bin}\n`);
  return { home, gone, skill, bin, path };
}

test("TestOrphanReceiptGoesWithItsDeadLinks", async (t) => {
  const { home, gone, skill, bin, path } = await movedHome(t);
  const out = sink();
  await removeReceipt(join(home, "brain"), { home, path }, out);
  assert.equal(out.text, `removed\tskills\t${skill}\nnote\tremoved the receipt of ${gone}, a checkout that is gone\n`);
  assert.equal(await exists(skill), false);
  assert.equal(await exists(bin), true, "a link to another place stays");
  assert.equal(await exists(path), false);
});

test("TestReceiptAfterMoveRemovesDeadLinks", async (t) => {
  const { home, skill, bin, path } = await movedHome(t);
  const root = join(home, "brain");
  await mkdir(root);
  const out = sink();
  await writeReceipt(root, { home, path, binDir: join(home, "bin"), targets: [] }, out);
  assert.equal(out.text, `removed\tskills\t${skill}\n`);
  assert.equal(await exists(skill), false);
  assert.equal(await exists(bin), true);
  assert.match(await readFile(path, "utf8"), new RegExp(`^root\t${root}\t\n`, "u"));
});
