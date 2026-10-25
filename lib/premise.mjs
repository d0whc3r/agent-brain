import { randomBytes } from "node:crypto";
import { link, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse, parseDocument, stringify } from "yaml";

import { loadConfig, validScope } from "./scope.mjs";

// defaultRoot is the repo that holds this file when BRAIN_ROOT is unset.
const defaultRoot = fileURLToPath(new URL("..", import.meta.url));

const idPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/u;
export const strengths = new Set(["always", "never", "prefer"]);
// A candidate waits for repeats in seen. Reviews apply only active premises.
export const statuses = new Set(["active", "candidate"]);
// One seen entry: date, repo, and origin. A correction comes from the user, a defect from a review.
const seenPattern = /^\d{4}-\d{2}-\d{2} [A-Za-z0-9._*-]+ (correction|defect)$/u;
// A scope is a slug from brain.config.json, or "*" for every scope.
const scopePattern = /^(\*|[a-z0-9]+(-[a-z0-9]+)*)$/u;
const sourcePattern = /^([A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/u;
const secretText = /(api[_-]?key|token|secret|authorization)\s*[:=]\s*\S{8,}/iu;

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

  // list returns premises with the status, active by default; null includes active and candidate in one scan.
  // A repo filter keeps premises for that repo or "*".
  // A scope filter keeps premises of that scope or "*". The empty scope ("") is a repo
  // that belongs to no scope: only premises that hold in every scope and every repo apply.
  async list(repo = "", scope = null, status = "active") {
    const { premises, problems } = await this.scan();
    for (const problem of problems) {
      process.stderr.write(`skip ${problem.file}: ${problem.reason}\n`);
    }
    const out = premises.filter(
      (p) => (status === null || p.status === status) && matchesRepo(p, repo) && matchesScope(p, scope),
    );
    // File names are unique, so no two ids are equal.
    return out.toSorted((a, b) => (a.id < b.id ? -1 : 1));
  }

  // scan reads every .md note in memory/premises. It returns the valid premises, and the file and
  // reason of each note that add or update would reject. Obsidian can drop other notes here, and a
  // hand edit can break a premise, so one bad note does not hide every premise.
  async scan() {
    const dir = join(this.root, "memory", "premises");
    const premises = [];
    const problems = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory() || !entry.name.endsWith(".md")) {
        continue;
      }
      try {
        premises.push(await readEntry(dir, entry.name, this.root));
      } catch (err) {
        problems.push({ file: entry.name, reason: err.message.split("\n")[0] });
      }
    }
    return { premises, problems };
  }

  // read returns the text of a premise file. A missing file throws a not-found error.
  async read(id) {
    try {
      return await readFile(this.filePath("premises", id), "utf8");
    } catch (err) {
      if (err.code === "ENOENT") {
        throw Object.assign(new Error(`premise ${JSON.stringify(id)} not found: ${err.message}`, { cause: err }), {
          code: "ENOENT",
        });
      }
      throw err;
    }
  }

  // get returns the premise fields and the body: the note text after the frontmatter, trimmed.
  // It does not check the fields, so show and premise_delete still reach a note that list skips.
  async get(id) {
    const document = await this.read(id);
    const { body } = splitFrontmatter(document.replaceAll("\r\n", "\n"));
    return { ...parseFrontmatter(document), id, body: body.trim() };
  }

  async add(input) {
    const premise = normalize(input);
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
    const document = await this.read(id);
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
    await writeDocument(this.filePath("premises", id), changeFields(document, changes));
    return premise;
  }

  // see appends one occurrence of the rule to seen.
  async see(id, entry) {
    const premise = await this.get(id);
    return this.update(id, { seen: [...premise.seen, entry] });
  }

  async delete(id) {
    const document = await this.read(id);
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
    await rm(this.filePath("premises", id));
  }

  // Search includes candidates for repeat detection. Filters have the same meaning as list.
  async search(query, { repo = "", scope = null, status = null } = {}) {
    const all = await this.list(repo, scope, status);
    const needle = query.toLowerCase();
    return all.filter((premise) => premise.id.includes(needle) || premise.text.toLowerCase().includes(needle));
  }

  filePath(dir, id) {
    validateID(id);
    return join(this.root, "memory", dir, `${id}.md`);
  }
}

function normalize(input) {
  return {
    id: input.id ?? "",
    text: input.text ?? "",
    strength: input.strength ?? "",
    scope: input.scope ?? "",
    repos: Array.isArray(input.repos) ? input.repos.slice() : [],
    status: input.status ? input.status : "active",
    source: input.source ?? "",
    seen: Array.isArray(input.seen) ? input.seen.slice() : [],
  };
}

// readEntry returns the premise in the note name of dir. It throws when add or update would reject it.
async function readEntry(dir, name, root) {
  const id = name.slice(0, -".md".length);
  validateID(id);
  const premise = { ...parseFrontmatter(await readFile(join(dir, name), "utf8")), id };
  checkPremise(premise, root);
  return premise;
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
    throw new Error(
      `status must be active or candidate, not ${JSON.stringify(premise.status)}. Use delete to drop a premise`,
    );
  }
  if (!premise.seen.every((entry) => validSeen(entry))) {
    throw new Error("seen entries must be YYYY-MM-DD REPO correction|defect, with a real date");
  }
  if (!validScopeName(premise.scope, root)) {
    throw new Error('scope must be a scope name from brain.config.json, or "*" for every scope');
  }
  if (!validRepos(premise.repos)) {
    throw new Error('repos must contain at least one repo name. Use "*" for every repo');
  }
  // The source is a note inside the brain, so the premise stays readable where only the brain is.
  if (premise.source && !validSource(premise.source)) {
    throw new Error(
      "source must be a relative path to a Markdown note inside the brain, such as memory/decisions/<file>.md",
    );
  }
  rejectSecret(premise.text);
}

function validSeen(entry) {
  return typeof entry === "string" && seenPattern.test(entry) && realDate(entry.slice(0, 10));
}

function validScopeName(scope, root) {
  return typeof scope === "string" && scopePattern.test(scope) && validScope(scope, loadConfig(root));
}

function validRepos(repos) {
  return (
    Array.isArray(repos) && repos.length > 0 && repos.every((repo) => typeof repo === "string" && repo.trim() !== "")
  );
}

function validSource(source) {
  return sourcePattern.test(source) && !source.includes("..");
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
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
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
  return repo === "" || premise.repos.some((name) => name === repo || name === "*");
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

// lineWidth 0 keeps each value on one line, so a long rule stays one line in Obsidian.
const yamlOptions = { lineWidth: 0 };

function formatPremise(premise) {
  // An active premise from add has no occurrences to keep, and stringify skips undefined.
  const fields = premise.seen.length === 0 ? { ...premise, seen: undefined } : premise;
  return `---\n${stringify(fields, yamlOptions)}---\n`;
}

// changeFields sets only the changed fields. The YAML document keeps Obsidian metadata,
// comments, the body, and the line endings of the note.
function changeFields(document, changes) {
  const newline = document.includes("\r\n") ? "\r\n" : "\n";
  const { yaml, rest } = splitFrontmatter(document.replaceAll("\r\n", "\n"));
  const doc = parseDocument(yaml);
  for (const [key, value] of Object.entries(changes)) {
    doc.set(key, value);
  }
  return `---\n${doc.toString(yamlOptions)}${rest}`.replaceAll("\n", newline);
}

// splitFrontmatter returns the YAML between the first two --- lines, the rest of the note
// from the closing --- line on, and the body after that line.
function splitFrontmatter(text) {
  const lines = text.split("\n");
  if (lines[0].trim() !== "---") {
    throw new Error("missing frontmatter");
  }
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) {
    throw new Error("missing frontmatter end");
  }
  return {
    yaml: lines.slice(1, end).join("\n"),
    rest: lines.slice(end).join("\n"),
    body: lines.slice(end + 1).join("\n"),
  };
}

// parseFrontmatter reads the premise fields and ignores any other key, such as Obsidian tags.
function parseFrontmatter(data) {
  const fields = parse(splitFrontmatter(data.replaceAll("\r\n", "\n")).yaml) ?? {};
  return {
    id: scalar(fields.id),
    text: scalar(fields.text),
    strength: scalar(fields.strength),
    scope: scalar(fields.scope),
    repos: list(fields.repos),
    status: scalar(fields.status),
    source: scalar(fields.source),
    seen: list(fields.seen),
  };
}

// The premise checks compare strings, so YAML numbers and booleans become text.
function scalar(value) {
  return value === null || value === undefined ? "" : String(value);
}

function list(value) {
  if (value === null || value === undefined) {
    return [];
  }
  return (Array.isArray(value) ? value : [value]).map((item) => scalar(item));
}
