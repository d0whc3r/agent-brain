#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { serveMCP } from "../lib/mcp.mjs";
import { brainRoot, open } from "../lib/premise.mjs";

const strengths = new Set(["always", "never", "prefer"]);

export async function run(args, stdout, stderr) {
  if (args.length > 0 && args[0] === "mcp") {
    return cmdMCP(args.slice(1), stderr);
  }
  if (args.length === 0 || args[0] !== "premise") {
    usage(stderr);
    return 1;
  }
  return runPremise(args.slice(1), stdout, stderr);
}

async function runPremise(args, stdout, stderr) {
  if (args.length === 0) {
    usage(stderr);
    return 1;
  }
  switch (args[0]) {
    case "list":
      return cmdList(args.slice(1), stdout, stderr);
    case "add":
      return cmdAdd(args.slice(1), stdout, stderr);
    case "show":
      return cmdShow(args.slice(1), stdout, stderr);
    case "rm":
      return cmdRm(args.slice(1), stderr);
    case "search":
      return cmdSearch(args.slice(1), stdout, stderr);
    default:
      usage(stderr);
      return 1;
  }
}

async function cmdList(args, stdout, stderr) {
  const parsed = parseNamed(args, ["repo"], stderr);
  if (parsed.code !== 0) {
    return parsed.code;
  }
  if (parsed.pos.length !== 0) {
    stderr.write("list takes no text\n");
    return 1;
  }
  const opened = await openStore(stderr);
  if (opened.code !== 0) {
    return opened.code;
  }
  try {
    const items = await opened.store.list(last(parsed.flags.repo));
    writePremises(stdout, items);
    return 0;
  } catch (err) {
    return failStore(stderr, err);
  }
}

async function cmdAdd(args, stdout, stderr) {
  const parsed = parseNamed(args, ["strength", "id", "source", "repo"], stderr);
  if (parsed.code !== 0) {
    return parsed.code;
  }
  if (parsed.pos.length !== 1) {
    stderr.write("add needs one TEXT argument\n");
    return 1;
  }
  const strength = last(parsed.flags.strength);
  if (!strengths.has(strength)) {
    stderr.write("add needs --strength always, never, or prefer\n");
    return 1;
  }
  const opened = await openStore(stderr);
  if (opened.code !== 0) {
    return opened.code;
  }
  try {
    const added = await opened.store.add({
      id: last(parsed.flags.id),
      text: parsed.pos[0],
      strength,
      repos: parsed.flags.repo,
      source: last(parsed.flags.source),
    });
    stdout.write(`${added.id}\n`);
    return 0;
  } catch (err) {
    return failStore(stderr, err);
  }
}

async function cmdShow(args, stdout, stderr) {
  const id = oneArg(args, "show", stderr);
  if (id.code !== 0) {
    return id.code;
  }
  const opened = await openStore(stderr);
  if (opened.code !== 0) {
    return opened.code;
  }
  try {
    const item = await opened.store.get(id.value);
    writePremise(stdout, item);
    return 0;
  } catch (err) {
    return failStore(stderr, err);
  }
}

async function cmdRm(args, stderr) {
  const id = oneArg(args, "rm", stderr);
  if (id.code !== 0) {
    return id.code;
  }
  const opened = await openStore(stderr);
  if (opened.code !== 0) {
    return opened.code;
  }
  try {
    await opened.store.delete(id.value);
    return 0;
  } catch (err) {
    return failStore(stderr, err);
  }
}

async function cmdSearch(args, stdout, stderr) {
  const query = oneArg(args, "search", stderr);
  if (query.code !== 0) {
    return query.code;
  }
  const opened = await openStore(stderr);
  if (opened.code !== 0) {
    return opened.code;
  }
  try {
    const items = await opened.store.search(query.value);
    writePremises(stdout, items);
    return 0;
  } catch (err) {
    return failStore(stderr, err);
  }
}

async function cmdMCP(args, stderr) {
  if (args.length !== 0) {
    usage(stderr);
    return 1;
  }
  try {
    await serveMCP();
    return 0;
  } catch (err) {
    stderr.write(`${err.message}\n`);
    return 1;
  }
}

function parseNamed(args, names, stderr) {
  const valued = new Set(names);
  let ordered;
  try {
    ordered = orderFlags(valued, args);
  } catch (err) {
    stderr.write(`${err.message}\n`);
    return { code: 1 };
  }
  const flags = {};
  for (const name of names) {
    flags[name] = [];
  }
  const pos = [];
  for (let i = 0; i < ordered.length; i++) {
    const arg = ordered[i];
    const split = splitFlag(arg);
    if (!split.isFlag) {
      pos.push(arg);
      continue;
    }
    if (split.name === "h" || split.name === "help") {
      usage(stderr);
      return { code: 1 };
    }
    let value;
    if (split.hasValue) {
      value = arg.slice(arg.indexOf("=") + 1);
    } else {
      i += 1;
      value = ordered[i];
    }
    flags[split.name].push(value);
  }
  return { code: 0, flags, pos };
}

function last(values) {
  if (!values || values.length === 0) {
    return "";
  }
  return values[values.length - 1];
}

function oneArg(args, name, stderr) {
  if (args.length !== 1 || args[0].startsWith("-")) {
    stderr.write(`${name} needs one argument\n`);
    return { code: 1 };
  }
  return { code: 0, value: args[0] };
}

async function openStore(stderr) {
  try {
    return { code: 0, store: await open(brainRoot()) };
  } catch (err) {
    return { code: failStore(stderr, err) };
  }
}

// A missing id is exit 1. Any other store rejection is exit 2.
function failStore(stderr, err) {
  stderr.write(`${err.message}\n`);
  if (isMissing(err)) {
    return 1;
  }
  return 2;
}

function isMissing(err) {
  let current = err;
  while (current) {
    if (current.code === "ENOENT") {
      return true;
    }
    current = current.cause;
  }
  return false;
}

function writePremises(stdout, items) {
  for (const item of items) {
    writePremise(stdout, item);
  }
}

function writePremise(stdout, item) {
  stdout.write(`${item.id}\t${item.strength}\t${item.text}\n`);
}

function usage(stderr) {
  stderr.write(`usage:
  brain premise list [--repo name]
  brain premise add TEXT --strength always|never|prefer [--repo name ...] [--id slug] [--source path]
  brain premise show ID
  brain premise rm ID
  brain premise search QUERY
  brain mcp
`);
}

// orderFlags puts valued flags before positionals.
// The add command puts TEXT first, and later flags must still parse.
function orderFlags(valued, args) {
  const flags = [];
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      pos.push(...args.slice(i + 1));
      break;
    }
    const split = splitFlag(arg);
    if (!split.isFlag) {
      pos.push(arg);
      continue;
    }
    if (split.name === "h" || split.name === "help") {
      flags.push(arg);
      continue;
    }
    if (!valued.has(split.name)) {
      throw new Error(`unknown flag --${split.name}`);
    }
    flags.push(arg);
    if (split.hasValue) {
      continue;
    }
    if (i + 1 >= args.length) {
      throw new Error(`flag --${split.name} needs a value`);
    }
    i += 1;
    flags.push(args[i]);
  }
  return flags.concat(pos);
}

function splitFlag(arg) {
  if (arg.length < 2 || !arg.startsWith("-")) {
    return { isFlag: false };
  }
  const body = arg.replace(/^-+/, "");
  if (body === "") {
    return { isFlag: false };
  }
  const eq = body.indexOf("=");
  const name = eq === -1 ? body : body.slice(0, eq);
  if (name === "") {
    return { isFlag: false };
  }
  return { name, hasValue: eq !== -1, isFlag: true };
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return import.meta.url === pathToFileURL(entry).href;
  }
}

if (isDirectRun()) {
  const code = await run(process.argv.slice(2), process.stdout, process.stderr);
  process.exit(code);
}
