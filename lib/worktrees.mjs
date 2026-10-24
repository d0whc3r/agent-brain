import { realpathSync } from "node:fs";

import { baseRef } from "./flows.mjs";
import { git } from "./io.mjs";

// parseWorktrees reads the output of git worktree list --porcelain.
export function parseWorktrees(text) {
  const out = [];
  let cur = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("worktree ")) {
      cur = {
        path: line.slice("worktree ".length),
        head: "",
        branch: "",
        detached: false,
        locked: false,
        prunable: false,
      };
      out.push(cur);
      continue;
    }
    if (cur) {
      applyLine(cur, line);
    }
  }
  return out;
}

// applyLine sets the field of worktree w that one porcelain line names.
function applyLine(w, line) {
  if (line.startsWith("HEAD ")) {
    w.head = line.slice("HEAD ".length);
  } else if (line.startsWith("branch ")) {
    w.branch = line.slice("branch ".length).replace(/^refs\/heads\//u, "");
  } else if (line === "detached") {
    w.detached = true;
  } else if (line.startsWith("locked")) {
    w.locked = true;
  } else if (line.startsWith("prunable")) {
    w.prunable = true;
  }
}

function real(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function isMain(branch) {
  return branch === "main" || branch === "master";
}

// listWorktrees returns each worktree of the repo at cwd with its state and parent.
// state: main, active, merged (no commit beyond the base and clean), gone (upstream deleted),
// detached, or prunable (the directory is missing).
// parent: the branch of another worktree that this branch stacks on, else the base.
export function listWorktrees(cwd) {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (top === null) {
    return null;
  }
  const base = baseRef(top);
  const items = parseWorktrees(git(top, ["worktree", "list", "--porcelain"]) ?? "");
  const stack = items.filter((w) => w.branch && !isMain(w.branch) && !w.prunable);
  return items.map((w) => describeWorktree(w, { top, base, stack }));
}

// describeWorktree adds the state, parent, and counts of one worktree. repo holds the top,
// the base, and the stack of worktree branches.
function describeWorktree(w, repo) {
  const out = {
    ...w,
    current: real(w.path) === real(repo.top),
    parent: repo.base,
    ahead: 0,
    behind: 0,
    changed: 0,
    state: "active",
  };
  if (w.prunable) {
    out.state = "prunable";
    return out;
  }
  if (!w.branch) {
    out.state = "detached";
    return out;
  }
  Object.assign(out, branchCounts(w, repo));
  if (isMain(w.branch)) {
    out.state = "main";
    return out;
  }
  out.state = branchState(out, repo.top);
  out.parent = parentOf(w, repo);
  return out;
}

// branchCounts counts the commits behind and ahead of the base, and the changed files.
function branchCounts(w, { top, base }) {
  const [behind, ahead] = (git(top, ["rev-list", "--left-right", "--count", `${base}...${w.branch}`]) ?? "0\t0")
    .split(/\s+/u)
    .map(Number);
  const changed = (git(w.path, ["status", "--porcelain"]) ?? "").split("\n").filter(Boolean).length;
  return { ahead: ahead || 0, behind: behind || 0, changed };
}

function branchState(w, top) {
  const track = git(top, ["for-each-ref", "--format=%(upstream:track)", `refs/heads/${w.branch}`]) ?? "";
  if (track.includes("gone")) {
    return "gone";
  }
  if (w.ahead === 0 && w.changed === 0) {
    return "merged";
  }
  return "active";
}

// parentOf returns the deepest other worktree branch whose tip is an ancestor of this
// branch, else the base.
function parentOf(w, { top, base, stack }) {
  let parent = base;
  let depth = 0;
  for (const other of stack) {
    if (other.branch === w.branch || other.head === w.head) {
      continue;
    }
    if (git(top, ["merge-base", "--is-ancestor", other.branch, w.branch]) === null) {
      continue;
    }
    const d = Number(git(top, ["rev-list", "--count", `${base}..${other.branch}`]) ?? 0);
    if (d > depth) {
      depth = d;
      parent = other.branch;
    }
  }
  return parent;
}

export function formatWorktree(w) {
  const mark = w.current ? "*" : " ";
  return `${mark} ${w.branch || "(detached)"}\t${w.state}\tparent ${w.parent}\tahead ${w.ahead}, behind ${w.behind}, ${w.changed} changed\t${w.path}`;
}
