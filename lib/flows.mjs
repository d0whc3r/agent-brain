import { execFileSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { git, ifMissing } from "./io.mjs";
import { resolveRepo } from "./scope.mjs";
import { readFields } from "./stats.mjs";

// The signals a flow can require in its frontmatter. Every listed signal must match.
// YAML reads dirty and behind as booleans, so matches compares them as text.
const signals = ["scopes", "repos", "kinds", "branch", "dirty", "pr", "behind"];

// loadFlows reads flows/*.md. The body holds the steps.
export async function loadFlows(brain) {
  const dir = join(brain, "flows");
  const names = (await ifMissing(readdir(dir), [])).filter((n) => n.endsWith(".md") && n !== "README.md").sort();
  const flows = [];
  for (const name of names) {
    const fields = await readFields(join(dir, name));
    flows.push({ ...fields, name: fields.name || basename(name, ".md"), file: `flows/${name}` });
  }
  return flows;
}

const kindByExt = { go: "go", py: "python", proto: "proto", ts: "ui", tsx: "ui", jsx: "ui", js: "ui", md: "docs" };

// kindsOf maps changed paths to the flow kinds: go, python, proto, ui, migration, docs, test, deps.
export function kindsOf(paths) {
  const kinds = new Set();
  for (const path of paths) {
    if (/(^|\/)(alembic\/versions|migrations)\//.test(path)) {
      kinds.add("migration");
    }
    // Dependency manifests and lockfiles.
    if (
      /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|go\.mod|go\.sum|pyproject\.toml|uv\.lock|poetry\.lock|requirements[\w.-]*\.txt)$/.test(
        path,
      )
    ) {
      kinds.add("deps");
    }
    if (/(_test\.go|\.test\.[jt]sx?|\.spec\.[jt]sx?|(^|\/)tests?\/)/.test(path)) {
      kinds.add("test");
    }
    const kind = kindByExt[path.split(".").pop()];
    if (kind) {
      kinds.add(kind);
    }
  }
  return [...kinds].sort();
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
  const entries = (git(top, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]) ?? "")
    .split("\0")
    .filter(Boolean);
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
  const counts = (git(top, ["rev-list", "--left-right", "--count", `${base}...HEAD`]) ?? "0\t0")
    .split(/\s+/)
    .map(Number);
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
    worktrees: (git(top, ["worktree", "list", "--porcelain"]) ?? "")
      .split("\n")
      .filter((l) => l.startsWith("worktree ")).length,
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
      return String(want) === String(ctx.dirty);
    case "pr":
      return (Array.isArray(want) ? want : [want]).includes(ctx.pr);
    case "behind":
      return String(want) === String(ctx.behind > 0);
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
