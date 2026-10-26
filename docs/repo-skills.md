# Repo skills and the brain

Many repos already ship skills. The brain does not replace those skills. A review loads the repo skill and the brain premise. When the same skill name exists in both places, the files must match. A different file is drift.

The live check is:

```bash
brain workspace check
```

It hashes `SKILL.md` in each repo of each scope root and compares the shared names with `.agents/skills/` in this repo. It also reports skill links with no readable `SKILL.md`. `pnpm skills:drift` runs the same command. Exit 1 means a line was printed.

Copy directories are out of scope. Do not learn rules from them.

## Where repo skills live

A workspace can keep skills in several places: a folder of shared vendor skills at the scope root, the `.agents/skills` and `.claude/skills` folders of each repo, and repos that publish skills for others. Keep a note of those places, and of what each one owns, in `memory/workspace/` of your brain home. `brain workspace check` scans every repo under the roots of each scope in `brain.config.json`.

## What a hash cannot see

A hash does not catch a rule conflict. These stay a chat review:

- A repo `AGENTS.md` says one ownership rule. A brain premise says another.
- A repo skill says how a part of the product works. A premise says never do that.
- Speckit skills in `.claude/skills` plan work. They do not override a premise.

When the user asks which rules disagree, read the repo `AGENTS.md`, the repo skills for that diff, and `premise_list`. Quote both sides. Ask which one wins. Do not edit either file unless the user asks.
