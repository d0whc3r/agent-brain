import { repeatOf } from "./decide.mjs";
import { flags, UsageError } from "./io.mjs";
import { brainHome, open, statuses, strengths } from "./premise.mjs";
import { loadConfig, validScope } from "./scope.mjs";
import { premiseStats } from "./stats.mjs";

const origins = new Set(["correction", "defect"]);

// premiseCommands holds the brain premise subcommands. Each takes the arguments after its
// name and returns the exit code, like the commands of bin/brain.mjs.
export const premiseCommands = {
  list: cmdList,
  add: cmdAdd,
  show: cmdShow,
  update: cmdUpdate,
  rm: cmdRm,
  search: cmdSearch,
  stats: cmdStats,
  seen: cmdSeen,
  promote: cmdPromote,
  check: cmdCheck,
};

async function cmdList(args, stdout) {
  const f = flags(args, { repo: "string", scope: "string", status: "string" });
  if (f.pos.length > 0) {
    throw new UsageError("list takes no text");
  }
  const status = f.status || "active";
  if (!statuses.has(status)) {
    throw new UsageError("list needs --status active or candidate");
  }
  const store = await open(brainHome());
  writePremises(stdout, await store.list(f.repo ?? "", f.scope ?? null, status));
  return 0;
}

async function cmdAdd(args, stdout, stderr) {
  const f = addFlags(args);
  const config = loadConfig(brainHome());
  if (!validScope(f.scope, config)) {
    throw new UsageError(`add needs --scope ${[...Object.keys(config.scopes), '"*"'].join(", ")}`);
  }
  const store = await open(brainHome());
  const added = await store.add({
    id: f.id,
    text: f.pos[0],
    strength: f.strength,
    scope: f.scope,
    repos: f.repo,
    source: f.source,
    status: f.status,
  });
  stdout.write(`${added.id}\n`);
  // The hint goes to stderr, so a script that reads the id from stdout keeps working.
  stderr.write(await repeatHint(config, store, added));
  return 0;
}

// addFlags reads the flags of premise add and checks the text, strength, and status.
function addFlags(args) {
  const f = flags(args, {
    strength: "string",
    scope: "string",
    id: "string",
    source: "string",
    repo: "list",
    status: "string",
  });
  if (f.pos.length !== 1) {
    throw new UsageError("add needs one TEXT argument");
  }
  if (!strengths.has(f.strength)) {
    throw new UsageError("add needs --strength always, never, or prefer");
  }
  f.status ||= "active";
  if (!statuses.has(f.status)) {
    throw new UsageError("add needs --status active or candidate");
  }
  return f;
}

// repeatHint names the premise that the local model sees as the same rule, or the model
// failure. It returns "" when there is nothing to say.
async function repeatHint(config, store, added) {
  try {
    const repeat = await repeatOf(config, store, added);
    if (!repeat) {
      return "";
    }
    return `possible repeat of ${repeat.id} (confidence ${repeat.confidence.toFixed(2)}, local model): ${repeat.text}\n`;
  } catch (err) {
    return `local model: ${err.message}\n`;
  }
}

// cmdShow prints the premise line, then the body: the reason and the exceptions.
async function cmdShow(args, stdout) {
  const id = oneArg(args, "show");
  const premise = await (await open(brainHome())).get(id);
  writePremises(stdout, [premise]);
  if (premise.body) {
    stdout.write(`\n${premise.body}\n`);
  }
  return 0;
}

// cmdUpdate changes only the fields that its flags set.
async function cmdUpdate(args) {
  const f = flags(args, {
    text: "string",
    strength: "string",
    scope: "string",
    repo: "list",
    source: "string",
    status: "string",
  });
  const changes = {
    text: f.text,
    strength: f.strength,
    scope: f.scope,
    repos: f.repo.length > 0 ? f.repo : undefined,
    source: f.source,
    status: f.status,
  };
  if (f.pos.length !== 1 || Object.values(changes).every((value) => value === undefined)) {
    throw new UsageError(
      "update needs one ID and at least one of --text, --strength, --scope, --repo, --source, --status",
    );
  }
  await (await open(brainHome())).update(f.pos[0], changes);
  return 0;
}

async function cmdRm(args) {
  const id = oneArg(args, "rm");
  await (await open(brainHome())).delete(id);
  return 0;
}

async function cmdSearch(args, stdout) {
  const f = flags(args, { repo: "string", scope: "string", status: "string" });
  if (f.pos.length !== 1) {
    throw new UsageError("search needs one QUERY argument");
  }
  if (f.status !== undefined && !statuses.has(f.status)) {
    throw new UsageError("search needs --status active or candidate");
  }
  const store = await open(brainHome());
  writePremises(stdout, await store.search(f.pos[0], { repo: f.repo, scope: f.scope, status: f.status }));
  return 0;
}

// cmdStats prints id, status, applied, hits, rejected, seen, last date, and a flag.
// Active: unused (never applied), stale (not applied in 90 days), noisy (often rejected),
// or idle (applied 10 times or more with no hit). Candidate: ready (enough repeats) or expired.
async function cmdStats(args, stdout) {
  if (args.length > 0) {
    throw new UsageError("stats takes no arguments");
  }
  for (const row of await premiseStats(brainHome())) {
    const cells = row.status === "active" ? [row.applied, row.hits, row.rejected, "-"] : ["-", "-", "-", row.seen];
    stdout.write(`${[row.id, row.status, ...cells, row.last || "-", row.flag || "-"].join("\t")}\n`);
  }
  return 0;
}

// cmdSeen records one repeat of a rule: today or --date, the repo, and the origin.
async function cmdSeen(args) {
  const f = flags(args, { repo: "string", origin: "string", date: "string" });
  if (f.pos.length !== 1 || !f.repo || !origins.has(f.origin)) {
    throw new UsageError("seen needs ID --repo name --origin correction|defect");
  }
  const date = f.date || new Date().toISOString().slice(0, 10);
  await (await open(brainHome())).see(f.pos[0], `${date} ${f.repo} ${f.origin}`);
  return 0;
}

// cmdPromote makes a candidate active, so reviews apply it.
async function cmdPromote(args) {
  const id = oneArg(args, "promote");
  await (await open(brainHome())).update(id, { status: "active" });
  return 0;
}

// cmdCheck prints each note in memory/premises that add or update would reject. list, reviews,
// and the session hook skip such a note.
async function cmdCheck(args, stdout) {
  if (args.length > 0) {
    throw new UsageError("check takes no arguments");
  }
  const { premises, problems } = await (await open(brainHome())).scan();
  for (const problem of problems) {
    stdout.write(`${problem.file}: ${problem.reason}\n`);
  }
  if (problems.length > 0) {
    return 1;
  }
  stdout.write(`ok: ${premises.length} premises\n`);
  return 0;
}

function oneArg(args, name) {
  if (args.length !== 1 || args[0].startsWith("-")) {
    throw new UsageError(`${name} needs one argument`);
  }
  return args[0];
}

function writePremises(stdout, items) {
  for (const item of items) {
    stdout.write(`${item.id}\t${item.scope}\t${item.strength}\t${item.text}\n`);
  }
}
