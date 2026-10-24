---
date: 2026-10-24
tool: claude-code
scope: "*"
repo: "*"
correction: A documentation file starts with a summary, adds a table of contents when it has four or more sections, and orders the sections from most to least important.
strength: always
evidence: The user asked for this rule explicitly, asked for research on similar principles first, and validated the draft. The user chose the MediaWiki threshold for the table of contents, scope "*", agent files after an assessment, and asked to apply the rule to the current documents of this repo.
status: open
---

The user asked for this rule explicitly, so it is an active premise: `docs-summary-first`.

Sources that state the same rule:

- Inverted pyramid: the most important information first, then detail in order of importance. [NN/g](https://www.nngroup.com/articles/inverted-pyramid/), [Veeam style guide](https://helpcenter.veeam.com/docs/styleguide/tw/inverted_pyramid.html).
- BLUF, bottom line up front, from Army Regulation 25-50: the conclusion and the action first. [Wikipedia](https://en.wikipedia.org/wiki/BLUF_(communication)).
- Minto pyramid principle: the answer first, then grouped arguments, then evidence. [Management Consulted](https://managementconsulted.com/the-pyramid-principle/).
- Wikipedia lead section: a summary that stands on its own comes before the first heading, and the table of contents follows it. [Manual of Style](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Lead_section).
- MediaWiki shows a table of contents when a page has four or more headings. [Help:Formatting](https://www.mediawiki.org/wiki/Help:Formatting).
- Microsoft Style Guide: lead with what is most important, and give a long document a table of contents. [Scannable content](https://learn.microsoft.com/en-us/style-guide/scannable-content/).

Exceptions: steps keep their order, and reference keeps the order of the product, after the summary. [Veeam](https://helpcenter.veeam.com/docs/styleguide/tw/inverted_pyramid.html), [Diataxis](https://diataxis.fr/reference/).

Agent files: an agent may read only the head of a file, so the summary first helps agents too. A table of contents in a short agent file costs tokens in each session and adds nothing, because the agent reads the whole file. Anthropic sets the line at 100 lines. [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices#structure-longer-reference-files-with-a-table-of-contents).
