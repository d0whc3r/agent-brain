import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { frontmatter } from "../lib/stats.mjs";

test("TestLayoutKeepsScreenshots", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "brain-layout-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const shots = join(root, "memory", "sessions", "screenshots");
  await mkdir(shots, { recursive: true });
  await mkdir(join(root, "scripts"));
  const script = join(root, "scripts", "check-layout.sh");
  await copyFile(fileURLToPath(new URL("./check-layout.sh", import.meta.url)), script);
  await writeFile(join(root, "AGENTS.md"), "Premises are rules. Skills are workflows. Engram is the session log.\n");
  await writeFile(join(root, ".gitignore"), "memory/sessions/screenshots/*\n");
  await writeFile(join(shots, "shot.png"), "existing screenshot");
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
  git("init", "-q");
  git("remote", "add", "origin", "https://example.invalid/personal/brain.git");

  execFileSync("bash", [script], { stdio: "pipe" });

  assert.equal(await readFile(join(shots, "shot.png"), "utf8"), "existing screenshot");
  assert.deepEqual(await readdir(shots), ["shot.png"]);
});

test("TestGitKeepsRulesAndSkipsCaptures", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "brain-memory-git-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await copyFile(fileURLToPath(new URL("../.gitignore", import.meta.url)), join(root, ".gitignore"));
  const shared = [
    "memory/premises/global-rule.md",
    "memory/premises/personal-rule.md",
    "memory/premises/work-rule.md",
    "memory/premises/candidate.md",
    "memory/premises/.gitkeep",
    "memory/decisions/.gitkeep",
    "memory/decisions/capture.md",
    "memory/dropped/.gitkeep",
    "memory/dropped/old-rule.md",
    "memory/patterns/.gitkeep",
    "memory/sessions/.gitkeep",
    "memory/sessions/screenshots/.gitkeep",
  ];
  const local = [
    "memory/patterns/draft.md",
    "memory/sessions/review.md",
    "memory/sessions/screenshots/shot.png",
    "memory/sessions/screenshots/nested/shot.png",
    "memory/workspace/audit.md",
    "memory/splits/plan.md",
    "memory/future/nested/note.md",
    "memory/note.md",
  ];
  for (const path of [...shared, ...local]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), path);
  }
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git("init", "-q");
  git("add", "memory");

  assert.deepEqual(git("ls-files", "-z", "memory").split("\0").filter(Boolean).toSorted(), shared.toSorted());
  for (const path of local) {
    assert.equal(await readFile(join(root, path), "utf8"), path);
  }
});

// A fresh clone has only what git keeps, so a source outside that set is a broken link there.
test("TestPremiseSourcesStayInGit", async () => {
  const repo = fileURLToPath(new URL("..", import.meta.url));
  const listed = execFileSync(
    "git",
    ["-C", repo, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "memory"],
    { encoding: "utf8" },
  );
  const kept = new Set(listed.split("\0"));
  const lost = [];
  for (const dir of ["memory/premises", "memory/dropped"]) {
    for (const name of await readdir(join(repo, dir))) {
      const { source } = frontmatter(await readFile(join(repo, dir, name), "utf8"));
      if (source && !kept.has(source)) {
        lost.push(`${dir}/${name}: ${source}`);
      }
    }
  }
  assert.deepEqual(lost, []);
});

// Premise docs-summary-first: a doc with this many ## sections, or an agent file longer than
// agentFileLines, links every section from a table of contents above the first ## heading.
const minSections = 4;
const agentFileLines = 100;
const agentFile = /(^|\/)(SKILL|AGENTS|CLAUDE)\.md$|^agents\//u;
const fenceLine = /^ {0,3}(`{3,}|~{3,})(.*)$/u;
const anchorLink = /\]\(#([^)\s]+)\)/gu;

// sectionsOf returns the ## headings outside code fences and the lead text above the first one.
function sectionsOf(text) {
  const headings = [];
  const lead = [];
  let fence = "";
  for (const line of text.split("\n")) {
    const mark = line.match(fenceLine);
    if (mark && fence === "") {
      fence = mark[1];
    } else if (mark && mark[1][0] === fence[0] && mark[1].length >= fence.length && mark[2].trim() === "") {
      fence = "";
    } else if (fence === "" && line.startsWith("## ")) {
      headings.push(line.slice(3));
    }
    if (headings.length === 0) {
      lead.push(line);
    }
  }
  return { headings, lead: lead.join("\n") };
}

// slugsOf builds the GitHub anchors of the headings, with -1, -2 for a repeated heading.
function slugsOf(headings) {
  const seen = new Map();
  return headings.map((heading) => {
    const base = heading
      .trim()
      .toLowerCase()
      .replaceAll(/[^\p{L}\p{N}\s_-]/gu, "")
      .replaceAll(/\s/gu, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  });
}

function contentsProblems(path, text) {
  const { headings, lead } = sectionsOf(text);
  const long = text.split("\n").length > agentFileLines;
  if (agentFile.test(path) ? !long : headings.length < minSections) {
    return null;
  }
  const slugs = slugsOf(headings);
  const links = new Set([...lead.matchAll(anchorLink)].map((match) => match[1]));
  const missing = slugs.filter((slug) => !links.has(slug)).map((slug) => `${path}: no contents link to #${slug}`);
  const broken = [...links].filter((link) => !slugs.includes(link)).map((link) => `${path}: #${link} is no ## heading`);
  return [...missing, ...broken];
}

test("TestDocsLinkSectionsFromContents", async () => {
  assert.deepEqual(slugsOf(["2. Install once", "`brain next`", "Steps", "Steps"]), [
    "2-install-once",
    "brain-next",
    "steps",
    "steps-1",
  ]);
  const repo = fileURLToPath(new URL("..", import.meta.url));
  const listed = execFileSync(
    "git",
    ["-C", repo, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "*.md"],
    { encoding: "utf8" },
  );
  // The index still lists a file that the work tree deleted until someone stages the delete.
  const deleted = new Set(
    execFileSync("git", ["-C", repo, "ls-files", "-z", "--deleted", "--", "*.md"], { encoding: "utf8" }).split("\0"),
  );
  const paths = listed.split("\0").filter((path) => path !== "" && !path.startsWith(".agents/") && !deleted.has(path));
  const results = await Promise.all(
    paths.map(async (path) => contentsProblems(path, await readFile(join(repo, path), "utf8"))),
  );
  const checked = results.filter((problems) => problems !== null);

  assert.ok(checked.length > 0, "no file needs a table of contents, so the check tests nothing");
  assert.deepEqual(checked.flat(), []);
});

const premisesLine = "Premises are rules. Skills are workflows. Engram is the session log.\n";

async function layoutRoot(t, { agents = premisesLine, ignore = "memory/sessions/screenshots/*\n" } = {}) {
  // realpath, so the profile path and git rev-parse agree on macOS, where /var is a link.
  const root = await mkdtemp(join(await realpath(tmpdir()), "brain-layout-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"));
  await copyFile(
    fileURLToPath(new URL("./check-layout.sh", import.meta.url)),
    join(root, "scripts", "check-layout.sh"),
  );
  if (agents !== null) {
    await writeFile(join(root, "AGENTS.md"), agents);
  }
  await writeFile(join(root, ".gitignore"), ignore);
  execFileSync("git", ["-C", root, "init", "-q"]);
  return root;
}

function checkLayout(root, home = process.env.HOME) {
  return spawnSync("bash", [join(root, "scripts", "check-layout.sh")], {
    encoding: "utf8",
    env: { ...process.env, HOME: home },
  });
}

test("TestLayoutPrintsOk", async (t) => {
  const result = checkLayout(await layoutRoot(t));

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "layout ok\n");
});

test("TestLayoutReportsEachProblem", async (t) => {
  const cases = [
    ["AGENTS.md without the line", { agents: "# Agents\n" }, null, "AGENTS.md is missing the premises line"],
    ["no AGENTS.md", { agents: null }, null, "AGENTS.md is missing the premises line"],
    [
      "screenshots not ignored",
      { ignore: "" },
      null,
      "git check-ignore failed for memory/sessions/screenshots/check.png",
    ],
    ["Chrome profile inside the repo", {}, (root) => root, "the Chrome profile is inside the repo: "],
  ];
  for (const [name, options, homeOf, message] of cases) {
    await t.test(name, async (st) => {
      const root = await layoutRoot(st, options);

      const result = checkLayout(root, homeOf ? homeOf(root) : undefined);

      assert.equal(result.status, 1);
      assert.ok(result.stderr.includes(message), result.stderr);
      assert.equal(result.stdout, "");
    });
  }
});
