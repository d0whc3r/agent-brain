## Brain

A personal agent brain holds the rules of the user for every tool. Run `brain home` to find the rules and notes of the user, and `brain root` to find the brain code.

- At session start in a repo, run `brain scope`, then call `premise_list` with that repo and scope. Apply every `always` and `never` premise. Quote each one you apply.
- Save a lasting rule or correction as a premise with the `brain-learn` skill, not only in the memory of this tool, so every tool applies it.
- Ask `brain next` for the flows that fit the repo state. The `brain-next` skill runs them.
- Skills and agents whose name starts with `brain-` come from the brain. `brain-tp-` marks a third-party skill that the brain vendors.
