import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { git, readTextSync } from "./io.mjs";

// A Definition of Done (DoD) is a Markdown list. Each criterion names an outcome,
// a check, a pass condition, and the evidence that the check passed:
//
//   - [ ] Toggle off pauses the schedule
//     - check: `pnpm vitest run src/backups --run`
//     - pass: exit 0, "pauses schedule"
//     - evidence: ran 2026-10-24T10:40:00.000Z tree 1a2b3c4d5e6f crit 9f8e7d6c exit 0; found "pauses schedule"
//
// tree ties the evidence to the code, and crit ties it to the check and the pass condition.

const itemLine = /^[-*+] \[([ xX])\] (.*)$/u;
const fieldLine = /^\s+[-*+] (check|pass|evidence):\s?(.*)$/u;
const commandCheck = /^`([^`]+)`$/u;
const exitCode = /\bexit (\d+)\b/u;
const quoted = /"([^"]+)"/gu;
const placeholder = /<[a-z][^>]*>/u;
// A path starts after a space, so "and/or" is not a path.
const target = /https?:\/\/|(^|\s)\/[\w.-]|`[^`]+`/u;
// A concrete condition names an exit code, a number, quoted text, a path, or a URL.
const concrete = /\bexit \d+\b|"[^"]+"|`[^`]+`|\d|(^|\s)\/[\w.-]|https?:\/\//u;
// A date or a time measures nothing, so "done 2026-10-24" stays vague.
const dateOrTime = /\b\d{4}-\d{2}-\d{2}(t[\d:.]+z?)?\b|\b\d{1,2}:\d{2}\b/giu;
// A claim about the whole change, such as "everything works" or "que todo funcione", checks nothing.
const globalClaim =
  /^(que )?(everything|all( the)?( tests| checks)?|todo|todos( los)?( tests)?|toda|it|the (feature|change|code)|la feature|el cambio|el código)( is| are| está| esta| esté| este| están)? (work\w*|funcion\w*|done|hech[oa]s?|finish\w*|termin\w*|complet\w*|correct\w*|ok|list[oa]s?|ready|pass\w*|pasa\w*)( (fine|bien|well|correctly|correctamente|as expected|como se espera|properly))?$/iu;
const bareClaim =
  /^(it |que )?(work\w*|funcion\w*|done|hech[oa]|list[oa]|termin\w*|finish\w*|complet\w*|ok|correct[oa]?)( (bien|fine|correctly|correctamente|as expected|como se espera))?$/iu;
// A check that ends in "|| true", or only echoes, passes without the change.
const cannotFail = /(\|\|\s*true|;\s*true)\s*$|^(true|:|exit 0)$|^echo\b/u;
// Checks run in a child shell, where the ask rules of the agent tool for git do not apply.
const guarded = /\bgit\s+(commit|push|reset\s+--hard|clean|branch\s+-D)\b/u;
const runEvidence = /^ran \S+ tree ([0-9a-f]{12}) crit ([0-9a-f]{8}) exit (\S+?)(;|$)/u;
const runTimeoutMs = 10 * 60 * 1000;

function newCriterion(item, at) {
  const done = item[1] !== " ";
  const outcome = item[2].trim();
  return { line: at, last: at, done, outcome, check: "", pass: "", evidence: "", evidenceLine: 0 };
}

// setField stores a field line in the criterion and returns its problem, or "".
function setField(criterion, field, at) {
  const [, key, value] = field;
  const second = criterion[key] !== "" || (key === "evidence" && criterion.evidenceLine > 0);
  criterion[key] = value.trim();
  criterion.last = at;
  if (key === "evidence") {
    criterion.evidenceLine = at;
  }
  return second ? `line ${at}: second ${key} in one criterion` : "";
}

// scan reads the criteria. Any line with other text ends a criterion, so a field below that
// line cannot attach to the criterion above it.
function scan(text) {
  const criteria = [];
  const problems = [];
  let current = null;
  for (const [index, line] of text.replaceAll("\r\n", "\n").split("\n").entries()) {
    const item = line.match(itemLine);
    const field = line.match(fieldLine);
    if (item) {
      current = newCriterion(item, index + 1);
      criteria.push(current);
    } else if (field && !current) {
      problems.push(`line ${index + 1}: ${field[1]} has no criterion: start the criterion with - [ ] <outcome>`);
    } else if (field) {
      problems.push(setField(current, field, index + 1));
    } else if (line.trim() !== "") {
      current = null;
    }
  }
  return { criteria, problems: problems.filter(Boolean) };
}

export function parseDod(text) {
  return scan(text).criteria;
}

function commandOf(criterion) {
  return (criterion.check.match(commandCheck) ?? [])[1] ?? "";
}

function vague(text) {
  const claim = text
    .trim()
    .replace(/[.!]+$/u, "")
    .replaceAll(/\s+/gu, " ");
  return globalClaim.test(claim) || bareClaim.test(claim);
}

function measurable(text) {
  return concrete.test(text.replaceAll(dateOrTime, ""));
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
  const checks = new Set(criteria.map((c) => c.check));
  const missing = (options.standing ?? [])
    .filter((s) => !checks.has(s.check))
    .map((s) => `standing criterion missing: ${s.outcome} (${s.check})`);
  return [...problems, ...criteria.flatMap((c) => criterionProblems(c, options)), ...missing];
}

// criterionProblems lists the problems of one criterion, each with its line number.
function criterionProblems(c, options) {
  const command = commandOf(c);
  // Code such as Array<string> in backticks is not a placeholder.
  const placeholders = ["outcome", "check", "pass", "evidence"]
    .filter((key) => placeholder.test(c[key].replaceAll(/`[^`]*`/gu, "")))
    .map((key) => `fill the placeholder in ${key}`);
  const vagueOutcome = vague(c.outcome) || c.outcome.split(/\s+/u).length < 3;
  const found = [
    ...placeholders,
    vagueOutcome ? "outcome is vague: name a subject and the behavior you can observe" : "",
    checkProblem(c, command),
    passProblem(c, command),
    ...(options.done ? doneProblems(c, command, options.tree ?? "") : []),
  ];
  return found.filter(Boolean).map((problem) => `line ${c.line}: ${problem}`);
}

// checkProblem names the first problem of the check of a criterion, or returns "".
function checkProblem(c, command) {
  if (c.check === "") {
    return "no check: add check: `<command>` or check: manual: <tool and target>";
  }
  if (command === "" && !c.check.startsWith("manual:")) {
    return "check must be one command in backticks, or start with manual:";
  }
  if (command === "" && !target.test(c.check)) {
    return "manual check names no target: add the URL, page path, or endpoint";
  }
  if (cannotFail.test(command.trim())) {
    return "check cannot fail: run the test or the tool that proves the outcome";
  }
  if (guarded.test(command)) {
    return "a check must not commit, push, reset, clean, or delete a branch";
  }
  return "";
}

// passProblem names the first problem of the pass condition of a criterion, or returns "".
function passProblem(c, command) {
  if (c.pass === "") {
    return "no pass condition: add pass: with an exit code, a number, or quoted text";
  }
  if (vague(c.pass) || !measurable(c.pass)) {
    return "pass condition is vague: name an exit code, a number, or quoted text";
  }
  if (command !== "" && !exitCode.test(c.pass)) {
    return "a command check needs exit N in pass";
  }
  return "";
}

// doneProblems lists why a criterion is not done: no check mark, or evidence that is missing,
// vague, stale, or from a failed run.
function doneProblems(c, command, tree) {
  const unchecked = c.done ? "" : "not checked: the criterion has no passing evidence";
  if (c.evidence === "") {
    return [unchecked, "no evidence"];
  }
  return [unchecked, command === "" ? manualEvidenceProblem(c, tree) : runEvidenceProblem(c, tree)];
}

function manualEvidenceProblem(c, tree) {
  if (vague(c.evidence) || !measurable(c.evidence)) {
    return "manual evidence is vague: name what you saw, with a path, a number, or quoted text";
  }
  if (!c.evidence.includes(`tree ${tree}`)) {
    return "manual evidence has no current tree: check again, and write the tree line of brain dod run";
  }
  return "";
}

function runEvidenceProblem(c, tree) {
  const run = c.evidence.match(runEvidence);
  if (!run) {
    return "command evidence must come from brain dod run";
  }
  if (run[1] !== tree) {
    return "evidence is stale: the code changed after the run. Run brain dod run again";
  }
  if (run[2] !== critHash(c)) {
    return "evidence is stale: the check or the pass condition changed after the run. Run brain dod run again";
  }
  if (run[3] !== wantedExit(c) || /; missing |changed the tree/u.test(c.evidence)) {
    return "evidence shows a failed run";
  }
  return "";
}

// gitText runs git with no timeout, because a diff of a large tree can take longer than the
// default. A failure gives "", so a missing HEAD or a dir outside git hashes as empty.
function gitText(cwd, args) {
  return git(cwd, args, 0) ?? "";
}

// dodPath is the DoD file of the current branch. It lives in the git dir, so it is never
// committed, each worktree has its own, and it goes away with the worktree.
export function dodPath(cwd) {
  const gitDir = gitText(cwd, ["rev-parse", "--absolute-git-dir"]);
  if (gitDir === "") {
    return "";
  }
  const branch = gitText(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]) || "HEAD";
  return join(gitDir, "brain-dod", `${branch}.md`);
}

// treeFingerprint hashes HEAD and the content of each changed or untracked file, so it does
// not depend on the index: git add -N leaves it the same. --no-renames lists both paths of a
// rename, so a later delete of the old path changes the fingerprint.
export function treeFingerprint(cwd) {
  const top = gitText(cwd, ["rev-parse", "--show-toplevel"]);
  const hash = createHash("sha256").update(gitText(top, ["rev-parse", "HEAD"]));
  const changed = gitText(top, ["diff", "HEAD", "--name-only", "--no-renames", "-z"]).split("\0");
  const untracked = gitText(top, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0");
  for (const path of [...new Set([...changed, ...untracked])].filter(Boolean).toSorted()) {
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
  return readTextSync(join(brain, "dod", `${repo}.md`), "");
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
  const out = spawnSync(command, {
    cwd,
    shell: true,
    encoding: "utf8",
    timeout: runTimeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: out.error ? (out.error.code ?? "error") : out.status,
    output: `${out.stdout ?? ""}${out.stderr ?? ""}`,
  };
}

function runOne(criterion, command, top) {
  const texts = [...criterion.pass.matchAll(quoted)].map((m) => m[1]);
  if (guarded.test(command)) {
    return {
      criterion,
      status: "refused",
      missing: [],
      texts,
      tail: "refused: a check must not commit, push, reset, clean, or delete a branch",
      ok: false,
    };
  }
  const { status, output } = runShell(command, top);
  const missing = texts.filter((t) => !output.includes(t));
  const tail = output.trimEnd().split("\n").slice(-20).join("\n");
  return {
    criterion,
    status,
    missing,
    texts,
    tail,
    ok: String(status) === wantedExit(criterion) && missing.length === 0,
  };
}

// runDod runs each command check at the repo top and writes its evidence. A criterion is
// checked when the exit code matches and the output holds each quoted text of pass. When
// the checks change the tree, as a formatter does, no criterion is checked: run again.
function list(texts) {
  return texts.map((t) => `"${t}"`).join(", ");
}

// evidenceText is the evidence of one result: the run, the exit code, and the quoted texts.
function evidenceText(result, ran, stable) {
  const parts = [`${ran} crit ${critHash(result.criterion)} exit ${result.status}`];
  if (result.missing.length > 0) {
    parts.push(`missing ${list(result.missing)}`);
  } else if (result.texts.length > 0) {
    parts.push(`found ${list(result.texts)}`);
  }
  if (!stable) {
    parts.push("the checks changed the tree");
  }
  return parts.join("; ");
}

// runDod runs each command check at the repo top and writes its evidence. A criterion is
// checked when the exit code matches and the output holds each quoted text of pass. When
// the checks change the tree, as a formatter does, no criterion is checked: run again.
export function runDod(text, cwd, now = new Date()) {
  const top = gitText(cwd, ["rev-parse", "--show-toplevel"]) || cwd;
  const before = treeFingerprint(top);
  const results = parseDod(text)
    .filter((c) => commandOf(c) !== "")
    .map((c) => runOne(c, commandOf(c), top));
  const tree = treeFingerprint(top);
  const stable = tree === before;
  const ran = `ran ${now.toISOString()} tree ${tree}`;
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  // Edit from the end, so an inserted evidence line does not move the lines above it.
  for (const r of results.toReversed()) {
    const c = r.criterion;
    const evidence = `  - evidence: ${evidenceText(r, ran, stable)}`;
    lines[c.line - 1] = `- [${r.ok && stable ? "x" : " "}] ${c.outcome}`;
    if (c.evidenceLine > 0) {
      lines[c.evidenceLine - 1] = evidence;
    } else {
      lines.splice(c.last, 0, evidence);
    }
  }
  return { text: lines.join("\n"), results, stable, tree };
}
