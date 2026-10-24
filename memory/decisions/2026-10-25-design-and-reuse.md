---
date: 2026-10-25
tool: claude-code
scope: "*"
repo: "*"
correction: Read and reuse before writing code, keep each rule in one place, add no abstraction without two concrete uses, and fail visibly instead of with a silent default.
strength: always, never
evidence: The user asked for a premise on clean code, good practices, design patterns, no repeated code, and analysis before implementation, and asked for research first. After the plan, the user chose the three proposed premises, added the optional fail-fast premise, chose scope "*", and asked to turn on sonarjs/no-identical-functions in this repo.
status: open
---

The user asked for these rules explicitly, so they are active premises: `read-and-reuse-first`, `one-place-per-rule`, `abstraction-needs-two-uses`, and `no-silent-fallback`.

Choices from the research:

- Four concrete rules replace one "write clean code" rule. Agent guides tell authors to leave out self-evident practices, and compliance falls as the number of rules grows.
- DRY applies to knowledge, not to identical text. The Rule of Three keeps it in line with "no abstraction with one caller".
- A design pattern needs a concrete use now. Refactor toward a pattern when the second use arrives.
- These stay out of premises, because they are contested or need judgment: "clean code" and KISS in general, SOLID as a whole, function length, the Law of Demeter, deep modules, and the boy scout rule. Lint limits and the simplify lens of `brain-reviewer` cover part of them. The boy scout rule conflicts with `stay-in-request-scope`, so a cleanup goes into a separate commit or a mention.
- A tool enforces what a tool can check. This repo turns on `sonarjs/no-identical-functions` in `.oxlintrc.json`. Other repos can use jscpd with `--baseline-from-ref origin/main --fail-on-new-clones 0`, `dupl` in golangci-lint, or pylint `duplicate-code` (R0801).

Sources:

- Every piece of knowledge has a single, unambiguous, authoritative representation within a system. [Don't repeat yourself](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself), from The Pragmatic Programmer.
- Duplication is far cheaper than the wrong abstraction. Inline a wrong abstraction back into each caller. [Metz](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction).
- Avoid hasty abstractions, and optimize for change first. [Dodds, AHA](https://kentcdodds.com/blog/aha-programming).
- Extract on the third copy. [Rule of three](https://en.wikipedia.org/wiki/Rule_of_three_(computer_programming)).
- Do not build a capability for a presumed future need. [Fowler, Yagni](https://martinfowler.com/bliki/Yagni.html).
- Passes the tests, reveals intention, no duplication, fewest elements. [Fowler, Beck Design Rules](https://martinfowler.com/bliki/BeckDesignRules.html).
- Very short methods become shallow and entangled. [Ousterhout and Martin](https://github.com/johnousterhout/aposd-vs-clean-code).
- Pattern knowledge led to over-engineering. Refactor toward a pattern when the code needs it. [Kerievsky](https://www.industriallogic.com/papers/StopOverEngineering.pdf).
- Fail immediately and visibly. A missing config value raises an error instead of returning a default. [Shore, Fail Fast](https://martinfowler.com/ieeeSoftware/failFast.pdf).
- Leave out self-evident practices such as "write clean code". Explore, plan, then implement. [Claude Code best practices](https://code.claude.com/docs/en/best-practices).
- Opus 4.5 and Opus 4.6 tend to over-engineer with extra files, abstractions, and unrequested flexibility. Never speculate about code you have not opened. [Claude prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices).
- Instruction-following accuracy falls as the number of instructions grows: Claude Sonnet 4 follows 100% of 10 instructions, 94.4% of 100, and 42.9% of 500. [IFScale](https://arxiv.org/abs/2507.11538).
- Context files do not generally improve task success, and they raise inference cost by over 20% on average. [Evaluating AGENTS.md](https://arxiv.org/abs/2602.11988).
- Cloned lines rose from 8.3% to 12.3%, and moved lines fell from 25% to under 10%. [GitClear 2025](https://www.gitclear.com/ai_assistant_code_quality_2025_research).
- DRY is about logic, not line counts. Reject helpers that differentiate callers with a bool flag. [franz-go CLAUDE.md](https://github.com/twmb/franz-go/blob/HEAD/pkg/kgo/CLAUDE.md).
- Inline helpers that only forward a call. A little duplication across separate responsibilities is fine. [vLLM AGENTS.md](https://github.com/vllm-project/vllm/blob/HEAD/rust/AGENTS.md).
- Reuse over duplication. Check whether existing implementations already handle the case. [torchtitan CLAUDE.md](https://github.com/pytorch/torchtitan/blob/HEAD/.claude/CLAUDE.md).
- Separate structural changes from behavior changes. [Beck, Tidy First, by Warne](https://henrikwarne.com/2024/01/10/tidy-first/).
