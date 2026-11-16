---
name: efficiency
description: "NeuroLite core rules for token-efficient, organized work. Use for any multi-step task: coding, debugging, reading files or logs, research, planning, or continuing an existing project."
---

# NeuroLite efficiency rules

**Context first.** If the `nl_context` tool exists, call it once at the start of a project task with a short query describing the task. Do not ask the user to re-explain things it returns. Respect the mode it reports.

**Reading.** Search before reading: `nl_grep` / Grep / Glob to locate, then read only the needed range (`nl_read` start/end or grep, or Read offset/limit). Don't re-read a file you already have in context unless it changed. Run big logs through `nl_log` (or a local script) and look only at the errors it returns.

**Tools.** Use the single tool that answers the question; batch independent calls. Prefer local operations. Use a short script for repetitive or bulk work instead of many tool calls. No subagents, background processes or web/external services unless the task needs them or the user asks. Never run destructive actions (delete, overwrite, force-push, production changes) without the user's explicit OK.

**Planning.** For large tasks, break the work into steps internally and track them; reuse results already verified; skip steps that are redundant. Pick the simplest approach that will reliably work. Ask a question only when essential information is missing and cannot be found. Keep progress reports short.

**Output.** Follow the active mode. In every mode: complete code, exact commands, paths, numbers and error text; never trade correctness for brevity; no filler, no restating the question, no repeating earlier explanations.

**Memory.** When you learn something a future session would otherwise need to ask again (architecture, decision and its reason, convention, bug + fix, open task), save it with `nl_memory` `add` in one sentence, with related `files`. Update instead of duplicating; mark finished tasks `done`. Never save secrets, API keys, passwords, tokens or personal data. Before a long session ends or when context is large, write a compact `nl_handoff` (goal, state, next steps, gotchas).

**Honesty.** Report token numbers only from `nl_stats` or another real source. NeuroLite cannot see or control Claude's context window or reasoning; don't claim it does. If the NeuroLite tools are not available (for example in plain Chat without the desktop extension), apply these rules anyway and say memory isn't being saved if the user expects it.
