# Drop-in rules for coding agents

Copy one of these into your repo and your agent will reach for the right command instead of
hand-editing three files and getting the guard wrong.

All of them say the same four things, in each tool's own format:

1. Run `npm create llms-txt` rather than editing by hand.
2. The site needs an `llms.txt` or the pill renders nothing.
3. `human-machine-swapper:not(:defined) { display: none }` is not optional.
4. Read the exit code: `0` done, `1` unrecognised project, `2` needs a human.

| File | Tool | Where it goes |
| --- | --- | --- |
| [`AGENTS.md`](../AGENTS.md) | Anything that reads AGENTS.md | repo root |
| [`cursor.mdc`](./cursor.mdc) | Cursor | `.cursor/rules/llms-txt.mdc` |
| [`claude-skill/SKILL.md`](./claude-skill/SKILL.md) | Claude Code | `.claude/skills/llms-txt/SKILL.md` |
| [`copilot-instructions.md`](./copilot-instructions.md) | GitHub Copilot | `.github/copilot-instructions.md` |

## Why a rules file rather than hoping

An agent asked to "make this site readable by AI" will usually improvise: write an `llms.txt`
by hand from whatever it can see, skip the discovery link, and never add the CSS guard. The
result looks installed and is broken in a way that only shows up on a slow connection.

A rules file costs four lines and removes the guessing.

## Nothing here is required

The component and the CLI work with no rules file at all. These exist because the cheapest
moment to get an install right is before it happens.
