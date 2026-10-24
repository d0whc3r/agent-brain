import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// A Definition of Done (DoD) is a Markdown list. Each criterion names an outcome,
// a check, a pass condition, and the evidence that the check passed:
//
//   - [ ] Toggle off pauses the schedule
//     - check: `pnpm vitest run src/backups --run`
//     - pass: exit 0, "pauses schedule"
//     - evidence: ran 2026-10-24T10:40:00.000Z tree 1a2b3c4d5e6f crit 9f8e7d6c exit 0; found "pauses schedule"
//
// tree ties the evidence to the code, and crit ties it to the check and the pass condition.

const itemLine = /^[-*+] \[([ xX])\] (.*)$/;
const fieldLine = /^\s+[-*+] (check|pass|evidence):\s?(.*)$/;
const commandCheck = /^`([^`]+)`$/;
const exitCode = /\bexit (\d+)\b/;
const quoted = /"([^"]+)"/g;
const placeholder = /<[a-z][^>]*>/;
// A path starts after a space, so "and/or" is not a path.
const target = /https?:\/\/|(^|\s)\/[\w.-]|`[^`]+`/;
// A concrete condition names an exit code, a number, quoted text, a path, or a URL.
const concrete = /\bexit \d+\b|"[^"]+"|`[^`]+`|\d|(^|\s)\/[\w.-]|https?:\/\//;
// A date or a time measures nothing, so "done 2026-10-24" stays vague.
const dateOrTime = /\b\d{4}-\d{2}-\d{2}(t[\d:.]+z?)?\b|\b\d{1,2}:\d{2}\b/gi;
// A claim about the whole change, such as "everything works" or "que todo funcione", checks nothing.
const globalClaim = /^(que )?(everything|all( the)?( tests| checks)?|todo|todos( los)?( tests)?|toda|it|the (feature|change|code)|la feature|el cambio|el código)( is| are| está| esta| esté| este| están)? (work\w*|funcion\w*|done|hech[oa]s?|finish\w*|termin\w*|complet\w*|correct\w*|ok|list[oa]s?|ready|pass\w*|pasa\w*)( (fine|bien|well|correctly|correctamente|as expected|como se espera|properly))?$/i;
const bareClaim = /^(it |que )?(work\w*|funcion\w*|done|hech[oa]|list[oa]|termin\w*|finish\w*|complet\w*|ok|correct[oa]?)( (bien|fine|correctly|correctamente|as expected|como se espera))?$/i;
// A check that ends in "|| true", or only echoes, passes without the change.
const cannotFail = /(\|\|\s*true|;\s*true)\s*$|^(true|:|exit 0)$|^echo\b/;
// Checks run in a child shell, where the ask rules of the agent tool for git do not apply.
const guarded = /\bgit\s+(commit|push|reset\s+--hard|clean|branch\s+-D)\b/;
const runEvidence = /^ran \S+ tree ([0-9a-f]{12}) crit ([0-9a-f]{8}) exit (\S+?)(;|$)/;
const runTimeoutMs = 10 * 60 * 1000;

// scan reads the criteria. Any line with other text ends a criterion, so a field below that
// line cannot attach to the criterion above it.
function scan(text) {
  const criteria = [];
  const problems = [];
  let current = null;
  text.replaceAll("\r\n", "\n").split("\n").forEach((line, index) => {
    const item = line.match(itemLine);
    if (item) {
      current = { line: index + 1, last: index + 1, done: item[1] !== " ", outcome: item[2].trim(), check: "", pass: "", evidence: "", evidenceLine: 0 };
      criteria.push(current);
      return;
    }
    const field = line.match(fieldLine);
    if (field && !current) {
      problems.push(`line ${index + 1}: ${field[1]} has no criterion: start the criterion with - [ ] <outcome>`);
      return;
    }
    if (field) {
      const key = field[1];
      if (current[key] !== "" || (key === "evidence" && current.evidenceLine > 0)) {
        problems.push(`line ${index + 1}: second ${key} in one criterion`);
      }
      current[key] = field[2].trim();
      current.last = index + 1;
      if (key === "evidence") {
        current.evidenceLine = index + 1;
      }
      return;
    }
    if (line.trim() !== "") {
      current = null;
    }
  });
  return { criteria, problems };
}

export function parseDod(text) {
  return scan(text).criteria;
}

function commandOf(criterion) {
  return (criterion.check.match(commandCheck) ?? [])[1] ?? "";
}

function vague(text) {
  const claim = text.trim().replace(/[.!]+$/, "").replace(/\s+/g, " ");
  return globalClaim.test(claim) || bareClaim.test(claim);
}

function measurable(text) {
  return concrete.test(text.replace(dateOrTime, ""));
}

function wantedExit(criterion) {
  return (criterion.pass.match(exitCode) ?? [])[1] ?? "0";
}

// critHash ties evidence to the check and the pass condition it was written for.
function critHash(criterion) {
  return createHash("sha256").update(`${criterion.check}\n${criterion.pass}`).digest("hex").slice(0, 8);
}

// lintDod returns one problem per line. options.standing lists the standing criteria of the
// repo, which the task DoD must keep. options.tree is the current tree fingerprint; with
// options.done, each criterion must be checked with evidence for that tree.
export function lintDod(text, options = {}) {
  const { criteria, problems } = scan(text);
  if (criteria.length === 0 && problems.length === 0) {
    return ["no criteria: add one line per outcome as - [ ] <outcome>"];
  }
  for (const c of criteria) {
    const at = `line ${c.line}`;
    for (const key of ["outcome", "check", "pass", "evidence"]) {
      // Code such as Array<string> in backticks is not a placeholder.
      if (placeholder.test(c[key].replace(/`[^`]*`/g, ""))) {
        problems.push(`${at}: fill the placeholder in ${key}`);
      }
    }
    if (vague(c.outcome) || c.outcome.split(/\s+/).length < 3) {
      problems.push(`${at}: outcome is vague: name a subject and the behavior you can observe`);
    }
    const command = commandOf(c);
    if (c.check === "") {
      problems.push(`${at}: no check: add check: \`<command>\` or check: manual: <tool and target>`);
    } else if (command === "" && !c.check.startsWith("manual:")) {
      problems.push(`${at}: check must be one command in backticks, or start with manual:`);
    } else if (command === "" && !target.test(c.check)) {
      problems.push(`${at}: manual check names no target: add the URL, page path, or endpoint`);
    } else if (cannotFail.test(command.trim())) {
      problems.push(`${at}: check cannot fail: run the test or the tool that proves the outcome`);
    } else if (guarded.test(command)) {
      problems.push(`${at}: a check must not commit, push, reset, clean, or delete a branch`);
    }
    if (c.pass === "") {
      problems.push(`${at}: no pass condition: add pass: with an exit code, a number, or quoted text`);
    } else if (vague(c.pass) || !measurable(c.pass)) {
      problems.push(`${at}: pass condition is vague: name an exit code, a number, or quoted text`);
    } else if (command !== "" && !exitCode.test(c.pass)) {
      problems.push(`${at}: a command check needs exit N in pass`);
    }
    if (options.done) {
      problems.push(...doneProblems(c, command, options.tree ?? "", at));
    }
  }
  const checks = new Set(criteria.map((c) => c.check));
  for (const s of options.standing ?? []) {
    if (!checks.has(s.check)) {
      problems.push(`standing criterion missing: ${s.outcome} (${s.check})`);
    }
  }
  return problems;
}

function doneProblems(c, command, tree, at) {
  const problems = [];
  if (!c.done) {
    problems.push(`${at}: not checked: the criterion has no passing evidence`);
  }
  if (c.evidence === "") {
    problems.push(`${at}: no evidence`);
    return problems;
  }
  if (command === "") {
    if (vague(c.evidence) || !measurable(c.evidence)) {
      problems.push(`${at}: manual evidence is vague: name what you saw, with a path, a number, or quoted text`);
    } else if (!c.evidence.includes(`tree ${tree}`)) {
      problems.push(`${at}: manual evidence has no current tree: check again, and write the tree line of brain dod run`);
    }
    return problems;
  }
  const run = c.evidence.match(runEvidence);
  if (!run) {
    problems.push(`${at}: command evidence must come from brain dod run`);
  } else if (run[1] !== tree) {
    problems.push(`${at}: evidence is stale: the code changed after the run. Run brain dod run again`);
  } else if (run[2] !== critHash(c)) {
    problems.push(`${at}: evidence is stale: the check or the pass condition changed after the run. Run brain dod run again`);
  } else if (run[3] !== wantedExit(c) || /; missing |changed the tree/.test(c.evidence)) {
    problems.push(`${at}: evidence shows a failed run`);
  }
  return problems;
}

function git(cwd, args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return "";
  }
}

// dodPath is the DoD file of the current branch. It lives in the git dir, so it is never
// committed, each worktree has its own, and it goes away with the worktree.
export function dodPath(cwd) {
  const gitDir = git(cwd, ["rev-parse", "--absolute-git-dir"]).trim();
  if (gitDir === "") {
    return "";
  }
  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).trim() || "HEAD";
  return join(gitDir, "brain-dod", `${branch}.md`);
}

// treeFingerprint hashes HEAD and the content of each changed or untracked file, so it does
// not depend on the index: git add -N leaves it the same. --no-renames lists both paths of a
// rename, so a later delete of the old path changes the fingerprint.
export function treeFingerprint(cwd) {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]).trim();
  const hash = createHash("sha256").update(git(top, ["rev-parse", "HEAD"]).trim());
  const changed = git(top, ["diff", "HEAD", "--name-only", "--no-renames", "-z"]).split("\0");
  const untracked = git(top, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0");
  for (const path of [...new Set([...changed, ...untracked])].filter(Boolean).sort()) {
    hash.update(`\0${path}\0`);
    try {
      hash.update(readFileSync(join(top, path)));
    } catch {
      hash.update("missing");
    }
  }
  return hash.digest("hex").slice(0, 12);
}

// readStanding reads dod/<repo>.md in the brain: the criteria every task of that repo keeps.
export function readStanding(brain, repo) {
  try {
    return readFileSync(join(brain, "dod", `${repo}.md`), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      return "";
    }
    throw err;
  }
}

const missingStanding = `- [ ] <the check of this repo passes>
  - check: <the check command of this repo, in backticks>
  - pass: exit 0`;

// newDod fills the template with the title and appends the standing criteria. With no
// standing file, a placeholder asks for the check of the repo, so lint fails until it is set.
export function newDod(template, title, standing) {
  const lines = standing.replaceAll("\r\n", "\n").split("\n");
  const start = lines.findIndex((line) => itemLine.test(line));
  const block = start < 0 ? missingStanding : lines.slice(start).join("\n").trimEnd();
  return `${template.replace("<title>", title).trimEnd()}\n${block}\n`;
}

// ponytail: at the timeout spawnSync kills the shell, not its children, so a leftover process
// can still write files after the run. Kill the process group if that happens in practice.
function runShell(command, cwd) {
  const out = spawnSync(command, { cwd, shell: true, encoding: "utf8", timeout: runTimeoutMs, maxBuffer: 64 * 1024 * 1024 });
  return { status: out.error ? (out.error.code ?? "error") : out.status, output: `${out.stdout ?? ""}${out.stderr ?? ""}` };
}

function runOne(criterion, command, top) {
  const texts = [...criterion.pass.matchAll(quoted)].map((m) => m[1]);
  if (guarded.test(command)) {
    return { criterion, status: "refused", missing: [], texts, tail: "refused: a check must not commit, push, reset, clean, or delete a branch", ok: false };
  }
  const { status, output } = runShell(command, top);
  const missing = texts.filter((t) => !output.includes(t));
  const tail = output.trimEnd().split("\n").slice(-20).join("\n");
  return { criterion, status, missing, texts, tail, ok: String(status) === wantedExit(criterion) && missing.length === 0 };
}

// runDod runs each command check at the repo top and writes its evidence. A criterion is
// checked when the exit code matches and the output holds each quoted text of pass. When
// the checks change the tree, as a formatter does, no criterion is checked: run again.
export function runDod(text, cwd, now = new Date()) {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]).trim() || cwd;
  const before = treeFingerprint(top);
  const results = [];
  for (const c of parseDod(text)) {
    const command = commandOf(c);
    if (command !== "") {
      results.push(runOne(c, command, top));
    }
  }
  const tree = treeFingerprint(top);
  const stable = tree === before;
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  // Edit from the end, so an inserted evidence line does not move the lines above it.
  for (const r of [...results].reverse()) {
    const c = r.criterion;
    lines[c.line - 1] = `- [${r.ok && stable ? "x" : " "}] ${c.outcome}`;
    let evidence = `ran ${now.toISOString()} tree ${tree} crit ${critHash(c)} exit ${r.status}`;
    if (r.missing.length > 0) {
      evidence += `; missing ${r.missing.map((t) => `"${t}"`).join(", ")}`;
    } else if (r.texts.length > 0) {
      evidence += `; found ${r.texts.map((t) => `"${t}"`).join(", ")}`;
    }
    if (!stable) {
      evidence += "; the checks changed the tree";
    }
    if (c.evidenceLine > 0) {
      lines[c.evidenceLine - 1] = `  - evidence: ${evidence}`;
    } else {
      lines.splice(c.last, 0, `  - evidence: ${evidence}`);
    }
  }
  return { text: lines.join("\n"), results, stable, tree };
}
