---
name: stats
description: "NeuroLite efficiency dashboard."
disable-model-invocation: true
---

Show the NeuroLite dashboard.

- If the `nl_stats` tool is available, call it once (pass `{"project": "$ARGUMENTS"}` only if a project was named) and show its output as a compact list. Add at most two concrete suggestions of your own, based only on that output.
- If it is not available, say: "NeuroLite tools not connected here: no saved stats. Install the NeuroLite desktop extension (Desktop Chat) or the plugin's local connector (Claude Code / Cowork)." Then show only what you actually know: the current mode from this conversation.

Never estimate or invent token counts or savings percentages. Numbers come only from the tool output.
