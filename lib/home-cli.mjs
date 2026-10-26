import { stat } from "node:fs/promises";

import { homeStarters, migrateHome } from "./home.mjs";
import { flags, ifMissing, UsageError } from "./io.mjs";
import { brainHome, brainRoot, open } from "./premise.mjs";

// cmdHome prints the home of the user: the config, the premises and notes, and the user skills.
// migrate copies the data of an old checkout into it, and starters offers new starter premises.
// Without --apply, both print what they would change and change nothing.
export async function cmdHome(args, stdout, stderr) {
  const [sub, ...rest] = args;
  if (sub === undefined) {
    stdout.write(`${brainHome().replace(/\/$/u, "")}\n`);
    return 0;
  }
  const f = flags(rest, { from: "string", apply: "boolean" });
  if (f.pos.length > 0 || (sub === "migrate") !== Boolean(f.from) || !["migrate", "starters"].includes(sub)) {
    throw new UsageError();
  }
  if (sub === "starters") {
    stdout.write((await homeStarters(brainRoot(), brainHome(), f.apply)).map((line) => `${line}\n`).join(""));
    return 0;
  }
  return homeMigrate(f, stdout, stderr);
}

// homeMigrate exits 1 when a home file the user changed keeps a migrated file out, or when a
// migrated premise is invalid, so a conflict is never silent.
async function homeMigrate(f, stdout, stderr) {
  if (!(await ifMissing(stat(f.from), null))?.isDirectory()) {
    stderr.write(`no brain checkout at ${f.from}\n`);
    return 1;
  }
  const lines = await migrateHome(brainRoot(), brainHome(), { from: f.from, apply: f.apply });
  stdout.write(lines.map((line) => `${line}\n`).join(""));
  const clashes = lines.filter((line) => line.startsWith("conflict "));
  if (clashes.length > 0) {
    stderr.write(`${clashes.length} conflicts: the home file differs from the checkout and from the template\n`);
  }
  if (!f.apply) {
    return clashes.length > 0 ? 1 : 0;
  }
  const { premises, problems } = await (await open(brainHome())).scan();
  stdout.write(`ok: ${premises.length} premises\n`);
  for (const problem of problems) {
    stderr.write(`invalid premise ${problem.file}: ${problem.reason}\n`);
  }
  return clashes.length > 0 || problems.length > 0 ? 1 : 0;
}
