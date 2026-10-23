---
name: grill-plan
description: Stress-test a plan, a design, or a decision before work starts.
skills: [brain-tp-grilling, brain-tp-doubt-driven-development]
model: opus
---

1. Name the plan or decision in one sentence. Read the ticket, the spec, or the files it touches.
2. Grill it with `brain-tp-grilling`. Ask the frontier questions one round at a time, each with a recommended answer. Look up facts with a subagent. Do not ask the user for a fact you can find.
3. For each decision that is hard to undo, run the adversarial check of `brain-tp-doubt-driven-development`.
4. Write the settled decisions as a short list. When a decision is a rule worth keeping, offer `/brain-learn`.

Done when no open question is left and the user confirms the shared understanding.
