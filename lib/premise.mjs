import { randomBytes } from "node:crypto";
import { link, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig, validScope } from "./scope.mjs";

// defaultRoot is the repo that holds this file when BRAIN_ROOT is unset.
const defaultRoot = fileURLToPath(new URL("..", import.meta.url));

const idPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const strengths = new Set(["always", "never", "prefer"]);
// A candidate waits for repeats in seen. Reviews apply only active premises.
const statuses = new Set(["active", "candidate"]);
// One seen entry: date, repo, and origin. A correction comes from the user, a defect from a review.
const seenPattern = /^\d{4}-\d{2}-\d{2} [A-Za-z0-9._*-]+ (correction|defect)$/;
// A scope is a slug from brain.config.json, or "*" for every scope.
const scopePattern = /^(\*|[a-z0-9]+(-[a-z0-9]+)*)$/;
const sourcePattern = /^([A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/;
const secretText =/(api[_-]?key|token|secret|authorization)\s*[:=]\s*\S{8,}/i;

export function brainRoot() {
  if (process.env.BRAIN_ROOT) {
    return process.env.BRAIN_ROOT;
  }
  return defaultRoot;
}

export async function open(root) {
  for (const dir of ["premises", "dropped"]) {
    await mkdir(join(root, "memory", dir), { recursive: true, mode: 0o755 });
  }
  return new Store(root);
}

export class Store {
  constructor(root) {
    this.root = root;
  }

  // list returns premises with the status, active by default. A repo filter keeps premises for that repo or "*".
  // A scope filter keeps premises of that scope or "*". The empty scope ("") is a repo
  // that belongs to no scope: only premises that hold in every scope and every repo apply.
  async list(repo = "", scope = null, status = "active") {
    const dir = join(this.root, "memory", "premises");
    const entries = await readdir(dir, { withFileTypes: true });
    const out = [];
    for (const entry of entries) {
      if (entry.isDirectory() || !entry.name.endsWith(".md")) {
        continue;
      }
      // Obsidian can drop other notes here. Skip them so one bad file does not hide every premise.
      const id = entry.name.slice(0, -".md".length);
      let premise;
      try {
        validateID(id);
        premise = await readPremise(join(dir, entry.name));
      } catch (err) {
        process.stderr.write(`skip ${entry.name}: ${err.message}\n`);
        continue;
      }
      premise.id = id;
      if (premise.status !== status) {
        continue;
      }
      if (!matchesRepo(premise, repo) || !matchesScope(premise, scope)) {
        continue;
      }
      out.push(premise);
    }
    out.sort((a, b) => {
      if (a.id < b.id) {
        return -1;
      }
      if (a.id > b.id) {
        return 1;
      }
      return 0;
    });
    return out;
  }

  async get(id) {
    const path = this.filePath("premises", id);
    try {
      const premise = await readPremise(path);
      premise.id = id;
      return premise;
    } catch (err) {
      if (err.code === "ENOENT") {
        throw missing(id, err);
      }
      throw err;
    }
  }

  async add(input) {
    const premise = normalize(input, input.id ?? "");
    checkPremise(premise, this.root);
    if (premise.id === "") {
      premise.id = slug(premise.text);
    }
    validateID(premise.id);
    const path = this.filePath("premises", premise.id);
    await writeDocument(path, formatPremise(premise), true);
    return premise;
  }

  // update changes only the fields that input sets.
  async update(id, input) {
    const path = this.filePath("premises", id);
    let document;
    try {
      document = await readFile(path, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") {
        throw missing(id, err);
      }
      throw err;
    }
    const premise = parseFrontmatter(document);
    const changes = { id };
    for (const key of ["text", "strength", "scope", "repos", "status", "source", "seen"]) {
      if (input[key] !== undefined) {
        premise[key] = input[key];
        changes[key] = input[key];
      }
    }
    premise.id = id;
    premise.repos = Array.isArray(premise.repos) ? premise.repos.slice() : [];
    premise.seen = Array.isArray(premise.seen) ? premise.seen.slice() : [];
    checkPremise(premise, this.root);
    await writeDocument(path, changeFields(document, changes));
    return premise;
  }

  // see appends one occurrence of the rule to seen.
  async see(id, entry) {
    const premise = await this.get(id);
    return this.update(id, { seen: [...premise.seen, entry] });
  }

  async delete(id) {
    const path = this.filePath("premises", id);
    let document;
    try {
      document = await readFile(path, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") {
        throw missing(id, err);
      }
      throw err;
    }
    parseFrontmatter(document);
    const dropped = this.filePath("dropped", id);
    const archived = changeFields(document, { id, status: "dropped" });
    try {
      await writeDocument(dropped, archived, true);
    } catch (err) {
      if (err.code !== "EEXIST") {
        throw err;
      }
      // A reused id keeps both archived versions.
      const version = `${id}-${randomBytes(8).toString("hex")}`;
      await writeDocument(this.filePath("dropped", version), archived, true);
    }
    await rm(path);
  }

  // search covers active and candidate premises, so a repeat finds its candidate.
  async search(query) {
    const all = [...await this.list(""), ...await this.list("", null, "candidate")];
    const needle = query.toLowerCase();
    return all.filter((premise) => premise.text.toLowerCase().includes(needle));
  }

  filePath(dir, id) {
    validateID(id);
    return join(this.root, "memory", dir, `${id}.md`);
  }
}

function normalize(input, id) {
  return {
    id: id ?? "",
    text: input.text ?? "",
    strength: input.strength ?? "",
    scope: input.scope ?? "",
    repos: Array.isArray(input.repos) ? input.repos.slice() : [],
    status: input.status ? input.status : "active",
    source: input.source ?? "",
    seen: Array.isArray(input.seen) ? input.seen.slice() : [],
  };
}

function missing(id, err) {
  const wrapped = new Error(`premise ${JSON.stringify(id)} not found: ${err.message}`, { cause: err });
  wrapped.code = "ENOENT";
  return wrapped;
}

function validateID(id) {
  if (!idPattern.test(id)) {
    throw new Error(`invalid id ${JSON.stringify(id)}`);
  }
}

// delete is the only way to drop a premise, so add and update keep status active or candidate.
function checkPremise(premise, root) {
  if (!strengths.has(premise.strength)) {
    throw new Error(`strength must be always, never, or prefer, not ${JSON.stringify(premise.strength)}`);
  }
  if (!statuses.has(premise.status)) {
    throw new Error(`status must be active or candidate, not ${JSON.stringify(premise.status)}. Use delete to drop a premise`);
  }
  if (premise.seen.some((entry) => typeof entry !== "string" || !seenPattern.test(entry) || !realDate(entry.slice(0, 10)))) {
    throw new Error("seen entries must be YYYY-MM-DD REPO correction|defect, with a real date");
  }
  if (typeof premise.scope !== "string" || !scopePattern.test(premise.scope)
    || !validScope(premise.scope, loadConfig(root))) {
    throw new Error('scope must be a scope name from brain.config.json, or "*" for every scope');
  }
  if (!Array.isArray(premise.repos) || premise.repos.length === 0
    || premise.repos.some((repo) => typeof repo !== "string" || repo.trim() === "")) {
    throw new Error('repos must contain at least one repo name. Use "*" for every repo');
  }
  // The source is a note inside the brain, so the premise stays readable where only the brain is.
  if (premise.source && (!sourcePattern.test(premise.source) || premise.source.includes(".."))) {
    throw new Error("source must be a relative path to a Markdown note inside the brain, such as memory/decisions/<file>.md");
  }
  rejectSecret(premise.text);
}

// realDate rejects a date such as 2026-13-01 or 2026-02-30, which stats cannot age.
function realDate(date) {
  const time = Date.parse(date);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === date;
}

function rejectSecret(text) {
  if (secretText.test(text) || text.includes("BEGIN PRIVATE KEY")) {
    throw new Error("premise text looks like a secret");
  }
}

function slug(text) {
  let out = "";
  let prevHyphen = false;
  for (const char of text.toLowerCase()) {
    if ((char >= "a" && char <= "z") || (char >= "0" && char <= "9")) {
      out += char;
      prevHyphen = false;
      continue;
    }
    if (out.length === 0 || prevHyphen) {
      continue;
    }
    out += "-";
    prevHyphen = true;
  }
  return out.replace(/-+$/, "");
}

function matchesScope(premise, scope) {
  if (scope === null) {
    return true;
  }
  if (premise.scope === "*") {
    return scope !== "" || premise.repos.includes("*");
  }
  return premise.scope === scope;
}

function matchesRepo(premise, repo) {
  if (repo === "") {
    return true;
  }
  for (const name of premise.repos) {
    if (name === repo || name === "*") {
      return true;
    }
  }
  return false;
}

// Linking a complete temp file creates a premise without replacing another writer's file.
async function writeDocument(path, text, create = false) {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o755 });
  const tmp = join(dir, `.premise-${randomBytes(8).toString("hex")}`);
  try {
    await writeFile(tmp, text, { mode: 0o644 });
    if (create) {
      await link(tmp, path);
    } else {
      await rename(tmp, path);
    }
  } finally {
    await rm(tmp, { force: true });
  }
}

async function readPremise(path) {
  const data = await readFile(path, "utf8");
  return parseFrontmatter(data);
}

function formatPremise(premise) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(premise)) {
    // An active premise from add has no occurrences to keep.
    if (key === "seen" && value.length === 0) {
      continue;
    }
    lines.push(...fieldLines(key, value));
  }
  lines.push("---");
  return `${lines.join("\n")}\n`;
}

function fieldLines(key, value) {
  if (key === "repos" || key === "seen") {
    return [`${key}:`, ...value.map((item) => `  - ${quoteYAML(item)}`)];
  }
  return [`${key}: ${quoteYAML(value)}`];
}

// Replace only changed fields. Keep Obsidian metadata, the body, and line endings.
function changeFields(document, changes) {
  const newline = document.includes("\r\n") ? "\r\n" : "\n";
  const lines = document.split(/\r?\n/);
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  const remaining = new Map(Object.entries(changes));
  const out = [lines[0]];
  for (let i = 1; i < end; i++) {
    const key = lines[i].match(/^([\w-]+):/)?.[1];
    if (!Object.hasOwn(changes, key)) {
      out.push(lines[i]);
      continue;
    }
    if (remaining.has(key)) {
      out.push(...fieldLines(key, remaining.get(key)));
      remaining.delete(key);
    }
    while (i + 1 < end && /^(?:[ \t]+\S|[ \t]*-\s)/.test(lines[i + 1])) {
      i++;
    }
  }
  for (const [key, value] of remaining) {
    out.push(...fieldLines(key, value));
  }
  return [...out, ...lines.slice(end)].join(newline);
}

function quoteYAML(value) {
  if (value === "") {
    return '""';
  }
  if (yamlSafe(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function yamlSafe(value) {
  if (value !== value.trim()) {
    return false;
  }
  if (/[:#"'\`&*!%@{[|>\n\r\t]/.test(value)) {
    return false;
  }
  if (value.startsWith("-") || value.startsWith("?")) {
    return false;
  }
  switch (value.toLowerCase()) {
    case "true":
    case "false":
    case "null":
    case "yes":
    case "no":
    case "~":
      return false;
    default:
      return true;
  }
}

function parseFrontmatter(data) {
  const text = data.replaceAll("\r\n", "\n");
  const lines = text.split("\n");
  if (lines.length === 0 || lines[0].trim() !== "---") {
    throw new Error("missing frontmatter");
  }
  const body = [];
  let closed = false;
  for (const line of lines.slice(1)) {
    if (line.trim() === "---") {
      closed = true;
      break;
    }
    body.push(line);
  }
  if (!closed) {
    throw new Error("missing frontmatter end");
  }
  return parseFields(body);
}

function parseFields(lines) {
  const premise = {
    id: "",
    text: "",
    strength: "",
    scope: "",
    repos: [],
    status: "",
    source: "",
    seen: [],
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      continue;
    }
    // A list item here belongs to a key this parser ignores, such as Obsidian tags.
    if (listItem(line) !== null || /^\s/.test(line)) {
      continue;
    }
    const cut = line.indexOf(":");
    if (cut === -1) {
      throw new Error(`bad frontmatter line ${JSON.stringify(line)}`);
    }
    const key = line.slice(0, cut).trim();
    const val = line.slice(cut + 1).trim();
    if ((key === "repos" || key === "seen") && val === "") {
      for (let j = i + 1; j < lines.length; j++) {
        const item = listItem(lines[j]);
        if (item === null) {
          break;
        }
        premise[key].push(parseScalar(item));
        i = j;
      }
      continue;
    }
    if (key === "repos") {
      premise.repos = [parseScalar(val)];
      continue;
    }
    switch (key) {
      case "id":
        premise.id = parseScalar(val);
        break;
      case "text":
        premise.text = parseScalar(val);
        break;
      case "strength":
        premise.strength = parseScalar(val);
        break;
      case "scope":
        premise.scope = parseScalar(val);
        break;
      case "status":
        premise.status = parseScalar(val);
        break;
      case "source":
        premise.source = parseScalar(val);
        break;
      default:
        break;
    }
  }
  return premise;
}

function listItem(line) {
  if (line.startsWith("  - ")) {
    return line.slice("  - ".length);
  }
  if (line.startsWith("- ")) {
    return line.slice("- ".length);
  }
  return null;
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}
