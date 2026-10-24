import { execFileSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { git, ifMissing } from "./io.mjs";
import { resolveRepo } from "./scope.mjs";
import { readFields } from "./stats.mjs";

// The signals a flow can require in its frontmatter, each with its test against the repo
// state. Every listed signal must match. YAML reads dirty and behind as booleans, so the
// tests compare them as text.
const matchers = {
  scopes: (want, ctx) => want.includes("*") || want.includes(ctx.scope),
  repos: (want, ctx) => want.includes("*") || want.includes(ctx.repo),
  kinds: (want, ctx) => want.some((k) => ctx.kinds.includes(k)),
  branch: (want, ctx) => want === (ctx.onMain ? "main" : "feature"),
  dirty: (want, ctx) => String(want) === String(ctx.dirty),
  pr: (want, ctx) => (Array.isArray(want) ? want : [want]).includes(ctx.pr),
  behind: (want, ctx) => String(want) === String(ctx.behind > 0),
};
const signals = Object.keys(matchers);

// loadFlows reads flows/*.md. The body holds the steps.
export async function loadFlows(brain) {
  const dir = join(brain, "flows");
  const names = (await ifMissing(readdir(dir), [])).filter((n) => n.endsWith(".md") && n !== "README.md").toSorted();
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
    if (/(^|\/)(alembic\/versions|migrations)\//u.test(path)) {
      kinds.add("migration");
    }
    // Dependency manifests and lockfiles.
    if (
      /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|go\.mod|go\.sum|pyproject\.toml|uv\.lock|poetry\.lock|requirements[\w.-]*\.txt)$/u.test(
        path,
      )
    ) {
      kinds.add("deps");
    }
    if (/(_test\.go|\.test\.[jt]sx?|\.spec\.[jt]sx?|(^|\/)tests?\/)/u.test(path)) {
      kinds.add("test");
    }
    const kind = kindByExt[path.split(".").pop()];
    if (kind) {
      kinds.add(kind);
    }
  }
  return [...kinds].toSorted((a, b) => (a < b ? -1 : 1));
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
  const status = statusOf(top);
  const base = baseRef(top);
  const committed = (git(top, ["diff", "--name-only", "-z", `${base}...HEAD`]) ?? "").split("\0").filter(Boolean);
  const changed = [...new Set([...committed, ...status.map((entry) => entry.path)])].toSorted();
  return {
    repo: found.repo,
    scope: found.scope,
    top,
    branch,
    ticket: (branch.match(/[A-Za-z][A-Za-z0-9]+-\d+/u) ?? [""])[0].toUpperCase(),
    onMain: branch === "main" || branch === "master",
    dirty: status.length > 0,
    untracked: status.filter((entry) => entry.code === "??").length,
    ...behindAhead(top, base),
    changed,
    kinds: kindsOf(changed),
    pr: opts.pr === false ? "none" : prState(top),
    worktrees: (git(top, ["worktree", "list", "--porcelain"]) ?? "")
      .split("\n")
      .filter((l) => l.startsWith("worktree ")).length,
  };
}

// statusOf lists the changed and untracked paths of the work tree with their status code.
function statusOf(top) {
  const entries = (git(top, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]) ?? "")
    .split("\0")
    .filter(Boolean);
  const status = [];
  for (let i = 0; i < entries.length; i++) {
    const code = entries[i].slice(0, 2);
    status.push({ code, path: entries[i].slice(3) });
    // With -z, a rename or copy gives the destination followed by the old path.
    if (/[RC]/u.test(code)) {
      i++;
    }
  }
  return status;
}

// behindAhead counts the commits of base that HEAD lacks, and the commits of HEAD that base lacks.
function behindAhead(top, base) {
  const counts = (git(top, ["rev-list", "--left-right", "--count", `${base}...HEAD`]) ?? "0\t0")
    .split(/\s+/u)
    .map(Number);
  return { behind: counts[0] || 0, ahead: counts[1] || 0 };
}

// baseRef names the remote default branch that feature branches start from.
export function baseRef(top) {
  return git(top, ["rev-parse", "--verify", "--quiet", "origin/main"]) ? "origin/main" : "origin/master";
}

// matchFlows keeps each flow whose listed signals all match, most specific first.
export function matchFlows(flows, ctx) {
  const out = [];
  for (const flow of flows) {
    const keys = signals.filter((k) => flow[k] !== undefined && flow[k] !== "");
    if (keys.every((k) => matchers[k](flow[k], ctx))) {
      out.push({ ...flow, score: keys.length });
    }
  }
  return out.toSorted((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1));
}
