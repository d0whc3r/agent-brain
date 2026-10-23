import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

// defaultRoot is the brain repo when BRAIN_ROOT is unset.
const defaultRoot = "/Users/josep/projects/qdrant-review-brain";

const idPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
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

  async list(repo) {
    const dir = join(this.root, "memory", "premises");
    const entries = await readdir(dir, { withFileTypes: true });
    const out = [];
    for (const entry of entries) {
      if (entry.isDirectory() || !entry.name.endsWith(".md")) {
        continue;
      }
      const id = entry.name.slice(0, -".md".length);
      validateID(id);
      const premise = await readPremise(join(dir, entry.name));
      premise.id = id;
      if (premise.status !== "active") {
        continue;
      }
      if (!matchesRepo(premise, repo)) {
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
    rejectSecret(premise.text);
    if (premise.id === "") {
      premise.id = slug(premise.text);
    }
    validateID(premise.id);
    const path = this.filePath("premises", premise.id);
    try {
      await stat(path);
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw err;
      }
      await writePremise(path, premise);
      return premise;
    }
    throw new Error(`premise ${JSON.stringify(premise.id)} already exists`);
  }

  async update(id, input) {
    const premise = normalize(input, id);
    rejectSecret(premise.text);
    const path = this.filePath("premises", id);
    try {
      await readPremise(path);
    } catch (err) {
      if (err.code === "ENOENT") {
        throw missing(id, err);
      }
      throw err;
    }
    premise.id = id;
    await writePremise(path, premise);
    return premise;
  }

  async delete(id) {
    const path = this.filePath("premises", id);
    let premise;
    try {
      premise = await readPremise(path);
    } catch (err) {
      if (err.code === "ENOENT") {
        throw missing(id, err);
      }
      throw err;
    }
    premise.id = id;
    premise.status = "dropped";
    const dropped = this.filePath("dropped", id);
    await writePremise(dropped, premise);
    await rm(path);
  }

  async search(query) {
    const all = await this.list("");
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
    repos: Array.isArray(input.repos) ? input.repos.slice() : [],
    status: input.status ? input.status : "active",
    source: input.source ?? "",
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

async function writePremise(path, premise) {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o755 });
  const tmp = join(dir, `.premise-${randomBytes(8).toString("hex")}`);
  try {
    await writeFile(tmp, formatPremise(premise), { mode: 0o644 });
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

async function readPremise(path) {
  const data = await readFile(path, "utf8");
  return parseFrontmatter(data);
}

function formatPremise(premise) {
  const lines = [
    "---",
    `id: ${quoteYAML(premise.id)}`,
    `text: ${quoteYAML(premise.text)}`,
    `strength: ${quoteYAML(premise.strength)}`,
    "repos:",
  ];
  for (const repo of premise.repos) {
    lines.push(`  - ${quoteYAML(repo)}`);
  }
  lines.push(`status: ${quoteYAML(premise.status)}`);
  lines.push(`source: ${quoteYAML(premise.source)}`);
  lines.push("---");
  return `${lines.join("\n")}\n`;
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
    repos: [],
    status: "",
    source: "",
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      continue;
    }
    const cut = line.indexOf(":");
    if (cut === -1) {
      throw new Error(`bad frontmatter line ${JSON.stringify(line)}`);
    }
    const key = line.slice(0, cut).trim();
    const val = line.slice(cut + 1).trim();
    if (key === "repos" && val === "") {
      for (let j = i + 1; j < lines.length; j++) {
        const item = listItem(lines[j]);
        if (item === null) {
          break;
        }
        premise.repos.push(parseScalar(item));
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
