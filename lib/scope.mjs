import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";

// A premise with this scope applies in every scope, and in repos with no scope.
export const anyScope = "*";

export function validScope(scope, config) {
  return scope === anyScope || Object.hasOwn(config.scopes, scope);
}

// loadConfig reads brain.config.json. Each scope lists origin owners and root directories.
// A missing file means no scopes, so every repo gets only the "*" premises.
export function loadConfig(brain) {
  let config = {};
  try {
    config = JSON.parse(readFileSync(join(brain, "brain.config.json"), "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
  const scopes = {};
  for (const [name, value] of Object.entries(config.scopes ?? {})) {
    scopes[name] = {
      description: value.description ?? "",
      owners: value.owners ?? [],
      roots: (value.roots ?? []).map(expandHome),
    };
  }
  return { scopes };
}

export function expandHome(path) {
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

// parseOrigin reads the owner and the repo name from a git remote URL:
// git@host:owner/repo.git, ssh://git@host/owner/repo.git, or https://host/owner/repo.
export function parseOrigin(url) {
  const match = url.trim().match(/[:/]([^/:]+)\/([^/]+?)(\.git)?\/?$/);
  if (!match) {
    return { owner: "", repo: "" };
  }
  return { owner: match[1], repo: match[2] };
}

function git(cwd, args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    }).trim();
  } catch {
    return "";
  }
}

function within(root, path) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}

// resolveRepo names the repo at cwd and its scope. The origin owner picks the scope.
// A repo with no origin takes the scope whose root holds it. A repo whose owner is in no
// scope, such as a third-party clone, gets the scope "" even inside a scope root.
export function resolveRepo(cwd, config, origin = (dir) => git(dir, ["remote", "get-url", "origin"])) {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]) || cwd;
  const { owner, repo } = parseOrigin(origin(top));
  const name = repo || basename(top);
  for (const [scope, value] of Object.entries(config.scopes)) {
    if (owner !== "" && value.owners.includes(owner)) {
      return { repo: name, owner, scope };
    }
  }
  if (owner !== "") {
    return { repo: name, owner, scope: "" };
  }
  for (const [scope, value] of Object.entries(config.scopes)) {
    if (value.roots.some((root) => within(root, top))) {
      return { repo: name, owner, scope };
    }
  }
  return { repo: name, owner, scope: "" };
}
