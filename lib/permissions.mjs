// The Claude Code permission rules that install.sh adds to ~/.claude/settings.json.

// Git commands that need a confirmation in Claude Code. They enforce the premises
// no-commit-push-unasked and no-schema-or-deploy-unasked for git, so the rule does not
// depend on the model reading it. After git-guardrails-claude-code in mattpocock/skills.
// brain home sync commits and pushes the home from node, where the git rules do not match.
export const guardRules = [
  "Bash(git commit:*)",
  "Bash(git push:*)",
  "Bash(git reset --hard:*)",
  "Bash(git clean:*)",
  "Bash(git branch -D:*)",
  "Bash(brain home sync:*)",
];

// The chrome-devtools server of the ecc plugin starts Chrome without the profile of the scope and
// keeps screenshots outside the screenshot folder, so Claude Code denies all of its tools.
export const chromeDeny = "mcp__plugin_ecc_chrome-devtools";

// setRules removes rules from permissions[key], then adds them back when add is true. Other rules
// stay.
function setRules(settings, { key, rules }, add) {
  const permissions = settings.permissions ?? {};
  const kept = (permissions[key] ?? []).filter((rule) => !rules.includes(rule));
  if (add) {
    kept.push(...rules);
  }
  const next = { ...permissions, [key]: kept };
  if (kept.length === 0) {
    delete next[key];
  }
  return { ...settings, permissions: next };
}

export const setGuards = (settings, add) => setRules(settings, { key: "ask", rules: guardRules }, add);
export const setChromeDeny = (settings, add) => setRules(settings, { key: "deny", rules: [chromeDeny] }, add);
