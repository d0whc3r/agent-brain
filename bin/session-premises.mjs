#!/usr/bin/env node

// SessionStart hook. Print the active premises for the repo in the session cwd.
// BRAIN_WORKSPACE is the directory that holds the repos. Claude Code adds the output
// to the session context. A cwd outside BRAIN_WORKSPACE prints nothing.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { brainRoot, open } from "../lib/premise.mjs";

// repoFor names the repo from its origin URL, so a copy or a worktree loads the
// premises of the repo it was cloned from. A directory with no origin uses its name.
export function repoFor(cwd, root = process.env.BRAIN_WORKSPACE ?? "", origin = originURL) {
  if (root === "") {
    return "";
  }
  const rel = relative(root, cwd);
  if (rel === "" || rel.startsWith("..")) {
    return "";
  }
  const url = origin(cwd);
  if (url !== "") {
    return basename(url).replace(/\.git$/, "");
  }
  return rel.split(sep)[0];
}

function originURL(cwd) {
  try {
    return execFileSync("git", ["-C", cwd, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    }).trim();
  } catch {
    return "";
  }
}

export async function premiseContext(cwd) {
  const repo = repoFor(cwd);
  if (repo === "") {
    return "";
  }
  const store = await open(brainRoot());
  const items = await store.list(repo);
  if (items.length === 0) {
    return "";
  }
  const lines = items.map((p) => `- [${p.strength}] ${p.text} (${p.id})`);
  return `Active brain premises for ${repo}. Apply every always and never premise. Quote each one you apply.\n${lines.join("\n")}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  process.stdout.write(await premiseContext(input.cwd ?? process.cwd()));
}
