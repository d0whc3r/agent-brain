import { stat } from "node:fs/promises";

import { homeStarters, migrateHome, syncHome } from "./home.mjs";
import { flags, ifMissing, UsageError } from "./io.mjs";
import { premiseCommands } from "./premise-cli.mjs";
import { brainHome, brainRoot, open } from "./premise.mjs";

// cmdHome prints the home of the user: the config, the premises and notes, and the user skills.
// migrate copies the data of an old checkout into it, and starters offers new starter premises.
// Without --apply, both print what they would change and change nothing. sync commits, pulls,
// and pushes the home.
export async function cmdHome(args, stdout, stderr) {
  const [sub, ...rest] = args;
  if (sub === undefined) {
    stdout.write(`${brainHome().replace(/\/$/u, "")}\n`);
    return 0;
  }
  if (sub === "sync" && rest.length === 0) {
    return homeSync(stdout, stderr);
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

// homeSync exits 1 when the home needs the user, such as a rebase conflict, and checks the
// premises after a sync, because a pull can bring an invalid premise from another machine.
async function homeSync(stdout, stderr) {
  try {
    syncHome(brainHome(), (line) => stdout.write(`${line}\n`));
  } catch (err) {
    if (err.code !== "SYNC") {
      throw err;
    }
    stderr.write(`${err.message}\n`);
    return 1;
  }
  return premiseCommands.check([], stdout);
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
