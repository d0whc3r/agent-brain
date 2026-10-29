import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

import { isDefaultBranch } from "./flows.mjs";
import { git, ifMissing, readTextSync } from "./io.mjs";

// currentBranch is the branch at cwd, or HEAD when HEAD is detached. A rebase detaches HEAD,
// so during a rebase it reads the branch under rebase from the git dir.
function currentBranch(cwd, gitDir) {
  for (const state of ["rebase-merge", "rebase-apply"]) {
    const head = readTextSync(join(gitDir, state, "head-name"), "").trim();
    if (head.startsWith("refs/heads/")) {
      return head.slice("refs/heads/".length);
    }
  }
  return git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]) || "HEAD";
}

// taskProblem names why task cannot key a DoD, or returns "". A task is a valid branch name,
// so its file stays in the folder of the DoDs. The default branch is no task: each task on it
// needs its own DoD.
function taskProblem(cwd, task, branch) {
  if (task === "") {
    return isDefaultBranch(cwd, branch) ? `${branch} is the default branch: pass --task <slug>, one DoD per task` : "";
  }
  // check-ref-format expands @{-1} to a branch name, so only an unchanged name is valid.
  if (git(cwd, ["check-ref-format", "--branch", task]) !== task) {
    return `--task ${task} is not a valid branch name: use a slug such as SVL-1 or fix-login`;
  }
  if (isDefaultBranch(cwd, task)) {
    return `--task ${task} names the default branch: name the task`;
  }
  return "";
}

// dodPath resolves the DoD file of a task: task, or the branch at cwd. The file lives in the
// git dir, so it is never committed, each worktree has its own, and it goes away with the
// worktree. It returns dir, the folder of the DoDs, and path, or a problem.
export function dodPath(cwd, task = "") {
  const gitDir = git(cwd, ["rev-parse", "--absolute-git-dir"]);
  if (!gitDir) {
    return { dir: "", path: "", problem: `not a git repo: ${cwd}` };
  }
  const dir = join(gitDir, "brain-dod");
  const branch = currentBranch(cwd, gitDir);
  const problem = taskProblem(cwd, task, branch);
  return { dir, path: problem === "" ? join(dir, `${task || branch}.md`) : "", problem };
}

// listDods lists the DoDs in dir, newest first, each with its task, title, and change time.
export async function listDods(dir) {
  const entries = await ifMissing(readdir(dir, { recursive: true, withFileTypes: true }), []);
  const files = entries.filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => join(e.parentPath, e.name));
  const dods = await Promise.all(
    files.map(async (file) => ({
      task: relative(dir, file).slice(0, -".md".length),
      title: (await readFile(file, "utf8")).match(/^# DoD: (.*)$/mu)?.[1] ?? "",
      changed: (await stat(file)).mtime,
    })),
  );
  return dods.toSorted((a, b) => b.changed - a.changed);
}
