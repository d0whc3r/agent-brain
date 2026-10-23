import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { resolveRepo } from "./scope.mjs";
import { frontmatter } from "./stats.mjs";

// The signals a flow can require in its frontmatter. Every listed signal must match.
const signals = ["scopes", "repos", "kinds", "branch", "dirty", "pr", "behind"];

// loadFlows reads flows/*.md. The body holds the steps.
export async function loadFlows(brain) {
  const dir = join(brain, "flows");
  let names;
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith(".md") && n !== "README.md").sort();
  } catch (err) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const flows = [];
  for (const name of names) {
    const text = await readFile(join(dir, name), "utf8");
    const fields = frontmatter(text);
    flows.push({ ...fields, name: fields.name || basename(name, ".md"), file: `flows/${name}` });
  }
  return flows;
}

// kindsOf maps changed paths to the flow kinds: go, python, proto, ui, migration, docs, test.
export function kindsOf(paths) {
  const kinds = new Set();
  for (const path of paths) {
    if (/(^|\/)(alembic\/versions|migrations)\//.test(path)) {
      kinds.add("migration");
    }
    if (/(_test\.go|\.test\.[jt]sx?|\.spec\.[jt]sx?|(^|\/)tests?\/)/.test(path)) {
      kinds.add("test");
    }
    const ext = path.split(".").pop();
    const byExt = { go: "go", py: "python", proto: "proto", ts: "ui", tsx: "ui", jsx: "ui", js: "ui", md: "docs" };
    if (byExt[ext]) {
      kinds.add(byExt[ext]);
    }
  }
  return [...kinds].sort();
}

export function git(cwd, args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
      // Keep status prefixes intact. NUL-terminated paths also keep trailing whitespace.
    }).trimEnd();
  } catch {
    return null;
  }
}

function prState(cwd) {
  try {
    const out = execFileSync("gh", ["pr", "view", "--json", "state,isDraft,reviewDecision,number"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 8000,
    });
    const pr = JSON.parse(out);
    if (pr.state !== "OPEN") {
      return "none";
    }
    if (pr.isDraft) {
      return "draft";
    }
    if (pr.reviewDecision === "CHANGES_REQUESTED") {
      return "changes_requested";
    }
    if (pr.reviewDecision === "APPROVED") {
      return "approved";
    }
    return "open";
  } catch {
    return "none";
  }
}

// repoContext reads the state of the repo at cwd. It returns null outside a git repo.
// opts.config is brain.config.json from loadConfig. It names the scope of the repo.
export function repoContext(cwd, opts = {}) {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (top === null) {
    return null;
  }
  const found = resolveRepo(top, opts.config ?? { scopes: {} });
  const branch = git(top, ["branch", "--show-current"]) ?? "";
  const entries = (git(top, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]) ?? "").split("\0").filter(Boolean);
  const status = [];
  for (let i = 0; i < entries.length; i++) {
    const code = entries[i].slice(0, 2);
    status.push({ code, path: entries[i].slice(3) });
    // With -z, a rename or copy gives the destination followed by the old path.
    if (/[RC]/.test(code)) {
      i++;
    }
  }
  const base = baseRef(top);
  const committed = (git(top, ["diff", "--name-only", "-z", `${base}...HEAD`]) ?? "").split("\0").filter(Boolean);
  const counts = (git(top, ["rev-list", "--left-right", "--count", `${base}...HEAD`]) ?? "0\t0").split(/\s+/).map(Number);
  const changed = [...new Set([...committed, ...status.map((entry) => entry.path)])].sort();
  const ticket = (branch.match(/[A-Za-z][A-Za-z0-9]+-\d+/) ?? [""])[0].toUpperCase();
  return {
    repo: found.repo,
    scope: found.scope,
    top,
    branch,
    ticket,
    onMain: branch === "main" || branch === "master",
    dirty: status.length > 0,
    untracked: status.filter((entry) => entry.code === "??").length,
    behind: counts[0] || 0,
    ahead: counts[1] || 0,
    changed,
    kinds: kindsOf(changed),
    pr: opts.pr === false ? "none" : prState(top),
    worktrees: (git(top, ["worktree", "list", "--porcelain"]) ?? "").split("\n").filter((l) => l.startsWith("worktree ")).length,
  };
}

// baseRef names the remote default branch that feature branches start from.
export function baseRef(top) {
  return git(top, ["rev-parse", "--verify", "--quiet", "origin/main"]) ? "origin/main" : "origin/master";
}

function matches(flow, key, ctx) {
  const want = flow[key];
  switch (key) {
    case "scopes":
      return want.includes("*") || want.includes(ctx.scope);
    case "repos":
      return want.includes("*") || want.includes(ctx.repo);
    case "kinds":
      return want.some((k) => ctx.kinds.includes(k));
    case "branch":
      return want === (ctx.onMain ? "main" : "feature");
    case "dirty":
      return want === String(ctx.dirty);
    case "pr":
      return (Array.isArray(want) ? want : [want]).includes(ctx.pr);
    case "behind":
      return want === String(ctx.behind > 0);
    default:
      return false;
  }
}

// matchFlows keeps each flow whose listed signals all match, most specific first.
export function matchFlows(flows, ctx) {
  const out = [];
  for (const flow of flows) {
    const keys = signals.filter((k) => flow[k] !== undefined && flow[k] !== "");
    if (keys.every((k) => matches(flow, k, ctx))) {
      out.push({ ...flow, score: keys.length });
    }
  }
  return out.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1));
}
