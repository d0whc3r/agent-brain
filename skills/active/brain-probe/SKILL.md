---
name: brain-probe
description: "Confirm which skill path a tool reads. Use before linking the other active skills. Ask the tool to list skills and record the path that shows brain-probe."
---

Link only this skill first. Ask Claude Code, OpenCode, and Codex to list skills.

Record the path that lists brain-probe. Link the other active skills only on that path.

Claude Code reads ~/.claude/skills. Link each active skill there.

OpenCode reads ~/.agents/skills when that directory exists. Skip ~/.config/opencode/skills when the agents path already lists this skill.

Codex reads ~/.codex/skills. Skip that link when Codex also reads ~/.agents/skills. Record the skip in the README.

Do not link skills/drafts. Do not link example-draft.
