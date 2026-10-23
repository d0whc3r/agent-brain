import { realpathSync } from "node:fs";

import { baseRef, git } from "./flows.mjs";

// parseWorktrees reads the output of git worktree list --porcelain.
export function parseWorktrees(text) {
  const out = [];
  let cur = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("worktree ")) {
      cur = { path: line.slice("worktree ".length), head: "", branch: "", detached: false, locked: false, prunable: false };
      out.push(cur);
      continue;
    }
    if (!cur) {
      continue;
    }
    if (line.startsWith("HEAD ")) {
      cur.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      cur.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    } else if (line === "detached") {
      cur.detached = true;
    } else if (line.startsWith("locked")) {
      cur.locked = true;
    } else if (line.startsWith("prunable")) {
      cur.prunable = true;
    }
  }
  return out;
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
  return items.map((w) => {
    const out = { ...w, current: real(w.path) === real(top), parent: base, ahead: 0, behind: 0, changed: 0, state: "active" };
    if (w.prunable) {
      out.state = "prunable";
      return out;
    }
    if (!w.branch) {
      out.state = "detached";
      return out;
    }
    const [behind, ahead] = (git(top, ["rev-list", "--left-right", "--count", `${base}...${w.branch}`]) ?? "0\t0").split(/\s+/).map(Number);
    out.ahead = ahead || 0;
    out.behind = behind || 0;
    out.changed = (git(w.path, ["status", "--porcelain"]) ?? "").split("\n").filter(Boolean).length;
    if (isMain(w.branch)) {
      out.state = "main";
      return out;
    }
    const track = git(top, ["for-each-ref", "--format=%(upstream:track)", `refs/heads/${w.branch}`]) ?? "";
    if (track.includes("gone")) {
      out.state = "gone";
    } else if (out.ahead === 0 && out.changed === 0) {
      out.state = "merged";
    }
    // The parent is the deepest other worktree branch whose tip is an ancestor of this branch.
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
        out.parent = other.branch;
      }
    }
    return out;
  });
}

export function formatWorktree(w) {
  const mark = w.current ? "*" : " ";
  return `${mark} ${w.branch || "(detached)"}\t${w.state}\tparent ${w.parent}\tahead ${w.ahead}, behind ${w.behind}, ${w.changed} changed\t${w.path}`;
}
