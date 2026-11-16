---
name: normal
description: "NeuroLite mode: standard responses."
disable-model-invocation: true
---

NeuroLite mode is now **normal**.

1. If the `nl_mode` tool is available, call it with `{"mode": "normal"}` so the mode is saved for future sessions. If it is not available, the mode applies to this conversation only; do not claim it was saved.
2. Until another `/neurolite:<mode>` command, follow these rules for every reply: Respond normally. Drop any earlier NeuroLite style rules.

3. Confirm the switch in one short line, written in the new style.
