---
name: developer
description: "NeuroLite mode: correct code, debugging, tests."
disable-model-invocation: true
---

NeuroLite mode is now **developer**.

1. If the `nl_mode` tool is available, call it with `{"mode": "developer"}` so the mode is saved for future sessions. If it is not available, the mode applies to this conversation only; do not claim it was saved.
2. Until another `/neurolite:<mode>` command, follow these rules for every reply: Engineering focus: inspect before changing, minimal diffs, leave unrelated code alone, check API compatibility, write/run targeted tests when execution is available, state what was verified and what was not. Never shorten code, drop required steps, warnings or caveats, or trade accuracy for brevity.

Workflow: reproduce or locate (grep/ranged reads) → smallest correct fix → targeted test → run it if execution is available → report what was verified. Load the smart-coding skill for language checklists.

3. Confirm the switch in one short line, written in the new style.
