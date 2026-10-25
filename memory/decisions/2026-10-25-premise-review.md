---
date: 2026-10-25
tool: claude-code
scope: "*"
repo: "*"
correction: Each premise text is one sentence that an agent can apply literally under its strength, related premises use one model, and a safety rule does not wait for a repeat.
strength: always, never
evidence: The user asked for a review of the premises and their related documents, and then chose the fixes. The session hook and premise_list show only the text, so a never text with a positive second sentence forbade the right action, and exceptions in the body were invisible. The user chose to forbid git add, commit, and push without an explicit ask in every repo, to lint a new qdrant-cloud-ui file by its path instead of git add -N, to activate brain-dod, to keep no-schema-or-deploy-unasked from expiring, and asked for research to align the reuse premises.
status: open
---

The user asked for these changes explicitly, so they apply to active premises.

| Premise | Change | Reason |
| --- | --- | --- |
| `engine-repo-read-only`, `no-hard-wrapped-markdown`, `cloud-ui-no-prettier-no-dir-format` | The text keeps only the forbidden action. The positive instruction moved to the body. | Under `never`, a second sentence such as "Read it only." was forbidden too. |
| `new-rpc-in-cluster-service-go`, `proto-is-api-source`, `stay-in-request-scope` | Two sentences became one. | `premise_add` takes one sentence. |
| `no-silent-fallback`, `docs-summary-first`, `comments-only-what-code-cannot-say` | The text names the exception that changes the verdict. | Agents read only the text. A documented default, a table of contents in a short agent file, and a doc comment on a public API were false findings. |
| `no-commit-push-unasked` | The text forbids `git add` too. The body lists the commands that stage. | The user keeps one rule: no `git add`, commit, or push without an explicit ask, in every repo. Section 5 of `AGENTS.md` allowed a commit outside the qdrant scope. |
| `cloud-ui-lint-fix-branch` | A new untracked file is linted and formatted by its path, not after `git add -N`. | `git add -N` stages, and the user forbade it. `pnpm fix:branch` reads only the git diff. |
| `no-schema-or-deploy-unasked` | Candidate to active. | A rule about actions that are hard to undo must not wait for a repeat, and it would expire on 2026-11-22. |
| `engine-repo-read-only`, `proto-is-api-source` | `source` points to `2026-10-24-memory-tiers.md`. | That note says why they are active. |
| `verify-against-origin-main` | The text names the check, not a claim about the checkout. It stays a candidate. | "The local checkout is on a feature branch" was a fact of one day, and "read facts from origin/main" conflicted with a review of a branch. |
| `dod-before-done` | The text applies to a task that changes files in a git repo and names the `brain-dod` skill, which is now active. | The skill was a draft, so no tool listed it. The body lists the tasks that need no DoD. |
| `read-and-reuse-first`, `one-place-per-rule`, `abstraction-needs-two-uses` | One model, below. | The texts set two thresholds, two and three, and called every copy a structural blocker. |

The model for reuse, from the research below:

1. The same rule in two places goes to one place now. The test: one change of the rule must edit both copies.
2. Code that only looks alike stays apart. On the third copy, compare all three and extract only the part that follows one rule.
3. An existing helper for the same rule is called, never written again. A second version is a structural blocker.
4. A new seam, such as an interface, a pattern, an option, a flag, or a forwarding wrapper, needs two real variants now.
5. A test fake counts as a variant only when it replaces a dependency that a test cannot run for real: a network service, another process, the clock, randomness, or a slow system. This replaces "a real implementation and a test fake count as two" from `2026-10-25-design-and-reuse.md`.
6. Tests may repeat setup for readability.

Sources for the model, in addition to those of `2026-10-25-design-and-reuse.md`:

- DRY is duplication of knowledge, and two look-alike validators are a coincidence. [Hunt and Thomas, The Pragmatic Programmer, 20th anniversary edition](https://media.pragprog.com/titles/tpp20/dry.pdf).
- Wait for the third case when two cases do not show what is common. [Three strikes and you refactor](https://wiki.c2.com/?ThreeStrikesAndYouRefactor).
- An interface with one subclass, and code that only tests run, are smells. [Google Testing Blog, Eliminate YAGNI smells](https://testing.googleblog.com/2017/08/code-health-eliminate-yagni-smells.html).
- Do not define an interface on the implementor side for mocking. [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments#interfaces), [Google Go style decisions](https://google.github.io/styleguide/go/decisions#interfaces).
- Prefer real implementations, and use test doubles for slow, external, or nondeterministic dependencies. [Software Engineering at Google, chapter 13](https://abseil.io/resources/swe-book/html/ch13.html).
- Indirection added only for tests damages the design. [DHH, Test-induced design damage](https://dhh.dk/2014/test-induced-design-damage.html). The opposite view: [Martin, Design Damage](https://blog.cleancoder.com/uncle-bob/2014/05/01/Design-Damage.html).
