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
  const path = join(home, ".local", "share", "qdrant-review-brain", "installed.txt");
  assert.match(await readFile(path, "utf8"), /^root\t.*\nskills\tbrain-a\t/);

  // A new version drops the agent, so its link breaks. The skill link is already gone.
  await rm(join(root, "agents", "brain-x.md"));
  await rm(join(skills, "brain-a"));
  out = sink();
  await writeReceipt(root, opts, out);
  assert.match(out.text, /removed\tskills\tbrain-a\t/);
  assert.match(out.text, /removed\tagents\tbrain-x\t/);
  assert.equal(await exists(join(agents, "brain-x.md")), false);
  assert.equal(await exists(join(skills, "foreign")), true);

  out = sink();
  await removeReceipt(root, opts, out);
  assert.match(out.text, /removed\tbin\tbrain\t/);
  assert.equal(await exists(join(bin, "brain")), false);
  assert.equal(await exists(path), false);
  assert.equal(await exists(join(skills, "foreign")), true);

  out = sink();
  await removeReceipt(root, opts, out);
  assert.equal(out.text, "no receipt\n");
});

test("TestReceiptOfOtherCheckoutStays", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "brain-home-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const path = join(home, "installed.txt");
  await writeFile(path, "root\t/other\nbin\tbrain\t/x/brain\n");
  const out = sink();
  await removeReceipt(join(home, "brain"), { home, path }, out);
  assert.equal(out.text, "receipt belongs to /other. Skipped.\n");
  assert.equal(await exists(path), true);
});
