---
date: 2026-10-24
tool: claude-code
scope: "*"
repo: "*"
correction: The code explains itself first, and a comment holds only what the code cannot say.
strength: always
evidence: The user asked for this rule explicitly and asked for research on comment practices first. After the summary, the user chose to include doc comments on public APIs limited to the contract, to keep the rule in one premise so that no second file drifts, and to align section 6 of AGENTS.md.
status: open
---

The user asked for this rule explicitly, so it is an active premise: `comments-only-what-code-cannot-say`.

Adjustments to the first draft of the user, from the research:

- The trigger for a comment is information that the code cannot hold, not code that looks confusing. Confusing code gets a rename or an extracted function, not a comment.
- Doc comments on a public API are a separate class. Go asks for one on each exported name, and Rust asks for Errors, Panics, and Safety sections. They state the contract only.
- Three places hold the why: a comment holds the local reason, the commit message holds why the code changed, and an ADR holds an architecture decision with its alternatives. A comment does not narrate history.
- The compiler does not check comments, so a comment changes or goes in the same change as its code.

Sources:

- Comment only what the code cannot say, not what it does not say. [Henney, ACCU Overload 157](https://accu.org/journals/overload/28/157/henney_2796/).
- Comments explain why, not what. Unclear code gets simpler. Regular expressions and complex algorithms are exceptions. Doc comments of classes and functions are a different thing. [Google eng-practices](https://google.github.io/eng-practices/review/reviewer/looking-for.html).
- Nine rules: no duplicate of the code, no excuse for unclear code, explain unidiomatic code, link sources and references, TODO with an issue. [Spertus, Stack Overflow Blog](https://stackoverflow.blog/2021/12/23/best-practices-for-writing-code-comments/).
- Code tells how, comments tell why. [Atwood, Coding Horror](https://blog.codinghorror.com/code-tells-you-how-comments-tell-you-why/).
- A comment that explains a block is a smell. Extract a variable or a method, rename, or add an assertion. [Refactoring Guru, Comments](https://refactoring.guru/smells/comments).
- Put units in names or types instead of a comment. [Google Testing Blog](https://testing.googleblog.com/2017/07/code-health-to-comment-or-not-to-comment.html).
- Never explain how the code works in a comment. Do not add doc comments that repeat the signature. [Linux kernel coding style](https://www.kernel.org/doc/html/latest/process/coding-style.html).
- Interface comments state the contract, and implementation comments go only where the code is not obvious. Martin and Ousterhout agree that gratuitous comments harm. [Ousterhout and Martin](https://github.com/johnousterhout/aposd-vs-clean-code).
- Every exported name has a doc comment that says what it returns or does, not the algorithm. [Go Doc Comments](https://go.dev/doc/comment).
- Function docs include errors, panics, and safety. [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/documentation.html).
- The commit message holds why the code changed. [Beams](https://cbea.ms/git-commit/).
- An ADR holds one architecture decision with context, status, and consequences. [Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
- Changes that leave code and comment inconsistent are about 1.5 times more likely to introduce a bug. [Radmanesh et al. 2024](https://arxiv.org/abs/2409.10781v1).
- Code from LLM assistants is often heavily commented. [RealHumanEval 2024](https://arxiv.org/pdf/2404.02806).
