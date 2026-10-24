import { randomBytes } from "node:crypto";
import { link, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse, parseDocument, stringify } from "yaml";

import { loadConfig, validScope } from "./scope.mjs";

// defaultRoot is the repo that holds this file when BRAIN_ROOT is unset.
const defaultRoot = fileURLToPath(new URL("..", import.meta.url));

const idPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const strengths = new Set(["always", "never", "prefer"]);
// A candidate waits for repeats in seen. Reviews apply only active premises.
export const statuses = new Set(["active", "candidate"]);
// One seen entry: date, repo, and origin. A correction comes from the user, a defect from a review.
const seenPattern = /^\d{4}-\d{2}-\d{2} [A-Za-z0-9._*-]+ (correction|defect)$/;
// A scope is a slug from brain.config.json, or "*" for every scope.
const scopePattern = /^(\*|[a-z0-9]+(-[a-z0-9]+)*)$/;
const sourcePattern = /^([A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/;
const secretText = /(api[_-]?key|token|secret|authorization)\s*[:=]\s*\S{8,}/i;

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
        premise = parseFrontmatter(await readFile(join(dir, entry.name), "utf8"));
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
    // File names are unique, so no two ids are equal.
    return out.sort((a, b) => (a.id < b.id ? -1 : 1));
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

  async get(id) {
    return { ...parseFrontmatter(await this.read(id)), id };
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

  // search covers active and candidate premises, so a repeat finds its candidate.
  async search(query) {
    const all = [...(await this.list("")), ...(await this.list("", null, "candidate"))];
    const needle = query.toLowerCase();
    return all.filter((premise) => premise.text.toLowerCase().includes(needle));
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
  if (
    premise.seen.some((entry) => typeof entry !== "string" || !seenPattern.test(entry) || !realDate(entry.slice(0, 10)))
  ) {
    throw new Error("seen entries must be YYYY-MM-DD REPO correction|defect, with a real date");
  }
  if (
    typeof premise.scope !== "string" ||
    !scopePattern.test(premise.scope) ||
    !validScope(premise.scope, loadConfig(root))
  ) {
    throw new Error('scope must be a scope name from brain.config.json, or "*" for every scope');
  }
  if (
    !Array.isArray(premise.repos) ||
    premise.repos.length === 0 ||
    premise.repos.some((repo) => typeof repo !== "string" || repo.trim() === "")
  ) {
    throw new Error('repos must contain at least one repo name. Use "*" for every repo');
  }
  // The source is a note inside the brain, so the premise stays readable where only the brain is.
  if (premise.source && (!sourcePattern.test(premise.source) || premise.source.includes(".."))) {
    throw new Error(
      "source must be a relative path to a Markdown note inside the brain, such as memory/decisions/<file>.md",
    );
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
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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

// splitFrontmatter returns the YAML between the first two --- lines, and the rest of the note
// from the closing --- line on.
function splitFrontmatter(text) {
  const lines = text.split("\n");
  if (lines[0].trim() !== "---") {
    throw new Error("missing frontmatter");
  }
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) {
    throw new Error("missing frontmatter end");
  }
  return { yaml: lines.slice(1, end).join("\n"), rest: lines.slice(end).join("\n") };
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
  return (Array.isArray(value) ? value : [value]).map(scalar);
}
