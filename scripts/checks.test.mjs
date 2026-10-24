import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// These tests run each check script, and sync-references.sh, in a fixture folder that holds
// a copy of the script and only the files that the case needs.

const repo = fileURLToPath(new URL("..", import.meta.url));
const snippetPath = join("mcp", "snippets", "chrome-devtools.json");
const referencesBase = "https://raw.githubusercontent.com/addyosmani/agent-skills/main/references";

async function fixture(t, script, files = {}) {
  const root = await mkdtemp(join(await realpath(tmpdir()), "brain-check-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"));
  await copyFile(join(repo, "scripts", script), join(root, "scripts", script));
  await writeFiles(root, files);
  return root;
}

async function writeFiles(root, files) {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
}

function check(root, script, env = {}) {
  const result = spawnSync("/bin/bash", [join(root, "scripts", script)], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function assertFails(result, message, ok) {
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.ok(result.stderr.includes(message), `stderr lacks ${JSON.stringify(message)}:\n${result.stderr}`);
  assert.ok(!result.stdout.includes(ok));
}

test("TestCheckPathsPassesWithoutHomePaths", async (t) => {
  const root = await fixture(t, "check-paths.sh", {
    "AGENTS.md": "Run brain root. Use ~/.claude and $HOME/.codex.\n",
    "docs/guide.md": "plain text\n",
    // Only instruction files count, so a home path in code is out of scope.
    "lib/tool.mjs": "const path = '/Users/alice/x';\n",
  });

  const result = check(root, "check-paths.sh");

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "paths ok\n");
  assert.equal(result.stderr, "");
});

test("TestCheckPathsFindsEachHomePath", async (t) => {
  const root = await fixture(t, "check-paths.sh", {
    "AGENTS.md": "see /Users/alice/notes\n",
    "docs/guide.md": "ok\nsee /home/bob/x\n",
    "skills/active/brain-x/SKILL.md": "/Users/carol/y\n",
    "memory/premises/rule.md": "fine\n",
  });

  const result = check(root, "check-paths.sh");

  assertFails(result, "absolute home path found", "paths ok");
  for (const hit of [
    "AGENTS.md:1:see /Users/alice/notes",
    "docs/guide.md:2:see /home/bob/x",
    "skills/active/brain-x/SKILL.md:1:",
  ]) {
    assert.ok(result.stdout.includes(hit), hit);
  }
});

test("TestCheckPathsFailsWhenFoldersAreMissing", async (t) => {
  const root = await fixture(t, "check-paths.sh", { "AGENTS.md": "see /Users/alice/notes\n" });

  assertFails(check(root, "check-paths.sh"), "absolute home path found", "paths ok");
});

test("TestCheckPathsFailsWithoutFiles", async (t) => {
  const root = await fixture(t, "check-paths.sh");

  assertFails(check(root, "check-paths.sh"), "no instruction files", "paths ok");
});

async function snippetsFixture(t, text) {
  const files = text === null ? {} : { [snippetPath]: text };
  const root = await fixture(t, "check-snippets.sh", files);
  execFileSync("git", ["-C", root, "init", "-q"]);
  return root;
}

test("TestCheckSnippetsPassesTheRepoSnippet", async (t) => {
  const root = await snippetsFixture(t, await readFile(join(repo, snippetPath), "utf8"));
  await writeFile(join(root, "mcp", "snippets", "obsidian.key"), "secret");

  const result = check(root, "check-snippets.sh");

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "snippets ok\n");
});

test("TestCheckSnippetsReportsEachProblem", async (t) => {
  const snippet = await readFile(join(repo, snippetPath), "utf8");
  const cases = [
    ["missing file", null, `missing ${snippetPath}`],
    ["no statistics flag", snippet.replace('"--no-usage-statistics",', ""), "is missing: --no-usage-statistics"],
    ["no header redaction", snippet.replace('"--redact-network-headers",', ""), "is missing: --redact-network-headers"],
    ["other profile", snippet.replace("${HOME}/.local/share", "/tmp"), "is missing: ${HOME}/.local/share"],
    ["latest version", snippet.replace(/@\d[\d.]*/u, "@latest"), "uses @latest. Pin a version"],
    ["isolated", snippet.replace('"-y",', '"-y", "--isolated",'), "contains --isolated"],
    ["auto connect", snippet.replace('"-y",', '"-y", "--autoConnect",'), "contains --autoConnect"],
  ];
  for (const [name, text, message] of cases) {
    await t.test(name, async (st) => {
      assert.notEqual(text, snippet, "the case changes the snippet");
      const root = await snippetsFixture(st, text);
      assertFails(check(root, "check-snippets.sh"), message, "snippets ok");
    });
  }
});

test("TestCheckSnippetsRejectsTrackedKey", async (t) => {
  const root = await snippetsFixture(t, await readFile(join(repo, snippetPath), "utf8"));
  await writeFile(join(root, "mcp", "snippets", "obsidian.key"), "secret");
  execFileSync("git", ["-C", root, "add", "mcp/snippets/obsidian.key"]);

  assertFails(check(root, "check-snippets.sh"), "mcp/snippets/obsidian.key is tracked by git", "snippets ok");
});

// skillsFixture copies the files that check-skills.sh reads. A small .agents folder stands in
// for the vendored skills, with one reference link that resolves.
async function skillsFixture(t) {
  const root = await fixture(t, "check-skills.sh", {
    ".agents/skills/demo/SKILL.md": "See [the list](../../references/demo-list.md).\n",
    ".agents/references/demo-list.md": "list\n",
  });
  for (const dir of ["skills", "agents", "templates", "lib", join("scripts", "fixtures")]) {
    await cp(join(repo, dir), join(root, dir), { recursive: true, verbatimSymlinks: true });
  }
  await symlink(join(repo, "node_modules"), join(root, "node_modules"));
  return root;
}

const skill = (name, description = "Does one thing.") =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\nBody.\n`;

async function edit(root, path, change) {
  await writeFile(join(root, path), change(await readFile(join(root, path), "utf8")));
}

test("TestCheckSkillsPassesTheRepoSkills", async (t) => {
  const root = await skillsFixture(t);

  const result = check(root, "check-skills.sh");

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "skills ok\n");
});

test("TestCheckSkillsReportsEachProblem", async (t) => {
  const cases = [
    [
      "missing required file",
      (root) => rm(join(root, "templates", "agent-skill.md")),
      "missing templates/agent-skill.md",
    ],
    [
      "skill folder without SKILL.md",
      (root) => mkdir(join(root, "skills", "active", "brain-empty")),
      "missing skills/active/brain-empty/SKILL.md",
    ],
    [
      "skill without prefix",
      (root) => writeFiles(root, { "skills/active/review/SKILL.md": skill("review") }),
      "skills/active/review/SKILL.md: a brain skill name starts with brain-",
    ],
    [
      "third-party prefix",
      (root) => writeFiles(root, { "skills/active/brain-tp-x/SKILL.md": skill("brain-tp-x") }),
      "starts with brain- and not brain-tp-",
    ],
    [
      "name mismatch",
      (root) => writeFiles(root, { "skills/active/brain-x/SKILL.md": skill("brain-y") }),
      "name mismatch in skills/active/brain-x/SKILL.md: frontmatter is brain-y",
    ],
    [
      "no description",
      (root) => writeFiles(root, { "skills/active/brain-x/SKILL.md": "---\nname: brain-x\n---\n" }),
      "skills/active/brain-x/SKILL.md has no description",
    ],
    [
      "long description",
      (root) => writeFiles(root, { "skills/active/brain-x/SKILL.md": skill("brain-x", "a".repeat(1025)) }),
      "description is longer than 1024 characters",
    ],
    [
      "invalid YAML",
      (root) => writeFiles(root, { "skills/active/brain-x/SKILL.md": "---\nname: [brain-x\n---\n" }),
      "bad frontmatter in skills/active/brain-x/SKILL.md",
    ],
    [
      "agent without prefix",
      (root) => writeFiles(root, { "agents/reviewer.md": "---\nname: reviewer\n---\n" }),
      "agents/reviewer.md: an agent name starts with brain-",
    ],
    [
      "skill with an agent name",
      (root) => writeFiles(root, { "skills/active/brain-reviewer/SKILL.md": skill("brain-reviewer") }),
      "skills/active/brain-reviewer has the name of an agent",
    ],
    [
      "missing rule text",
      (root) => edit(root, "agents/brain-reviewer.md", (text) => text.replaceAll("premise_list", "list")),
      "agents/brain-reviewer.md is missing: premise_list",
    ],
    [
      "missing slash flag",
      (root) => edit(root, "skills/active/brain-learn/SKILL.md", (text) => text.replace('opencode/slash: "true"', "")),
      'skills/active/brain-learn/SKILL.md is missing: opencode/slash: "true"',
    ],
    [
      "write into active skills",
      (root) =>
        edit(root, "skills/active/brain-garden/SKILL.md", (text) => `${text}\nWrite the new skill to skills/active.\n`),
      "has write and skills/active on one line",
    ],
    [
      "missing reference",
      (root) => rm(join(root, ".agents", "references", "demo-list.md")),
      "missing .agents/references/demo-list.md: run scripts/sync-references.sh",
    ],
  ];
  for (const [name, change, message] of cases) {
    await t.test(name, async (st) => {
      const root = await skillsFixture(st);
      await change(root);
      assertFails(check(root, "check-skills.sh"), message, "skills ok");
    });
  }
});

// The curl stub writes the URL into the output file. It fails for a URL that ends with CURL_FAIL.
const curlStub = `#!/bin/sh
echo "curl $*" >> "$STUB_LOG"
if [ -n "$CURL_FAIL" ]; then
  case "$2" in
    *"$CURL_FAIL") exit 22 ;;
  esac
fi
printf 'from %s\\n' "$2" > "$4"
`;

async function syncFixture(t, files) {
  const root = await fixture(t, "sync-references.sh", files);
  await writeFiles(root, { "stubs/curl": curlStub });
  execFileSync("chmod", ["+x", join(root, "stubs", "curl")]);
  const env = { PATH: `${join(root, "stubs")}:/usr/bin:/bin`, STUB_LOG: join(root, "curl.log") };
  return { root, env };
}

const linking = {
  ".agents/skills/a/SKILL.md": "[x](../../references/x-list.md) and [x again](../../references/x-list.md)\n",
  ".agents/skills/b/notes/more.md": "[y](../../references/y-list.md)\n",
};

test("TestSyncReferencesDownloadsEachLinkOnce", async (t) => {
  const { root, env } = await syncFixture(t, linking);

  const result = check(root, "sync-references.sh", env);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "synced .agents/references/x-list.md\nsynced .agents/references/y-list.md\n");
  assert.equal(
    await readFile(join(root, ".agents", "references", "x-list.md"), "utf8"),
    `from ${referencesBase}/x-list.md\n`,
  );
  assert.equal((await readFile(join(root, "curl.log"), "utf8")).trim().split("\n").length, 2);
});

test("TestSyncReferencesNamesTheFailedDownload", async (t) => {
  const { root, env } = await syncFixture(t, linking);

  const result = check(root, "sync-references.sh", { ...env, CURL_FAIL: "y-list.md" });

  assertFails(result, `download failed: ${referencesBase}/y-list.md`, "y-list.md");
});

test("TestSyncReferencesWithoutLinksDownloadsNothing", async (t) => {
  const { root, env } = await syncFixture(t, { ".agents/skills/a/SKILL.md": "no links\n" });

  const result = check(root, "sync-references.sh", env);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.deepEqual(await readdir(join(root, ".agents", "references")), []);
});
