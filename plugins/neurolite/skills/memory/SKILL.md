---
name: memory
description: "Inspect, search, edit or delete project memories."
argument-hint: "[list | search <text> | add <type> <text> | edit <id> <text> | forget <id...> | audit]"
disable-model-invocation: true
---

Manage project memory with the `nl_memory` tool. Request: `$ARGUMENTS` (empty → `list`).

- `list` → `nl_memory` `{"action":"list"}`
- `search <text>` → `{"action":"search","query":"<text>"}`
- `add <type> <text>` → `{"action":"add","type":"<type>","text":"<text>"}` (types: architecture, decision, progress, bug, task, convention, note)
- `edit <id> <text>` → `{"action":"update","id":"<id>","text":"<text>"}`
- `done <id>` → `{"action":"update","id":"<id>","status":"done"}`
- `forget <id...>` → show the memories with `get` first, ask the user to confirm, then `{"action":"forget","ids":[...]}`
- `audit` → `nl_scan` `{"kind":"memory"}` and propose fixes; apply only what the user approves.

Show results as the tool returns them. Memory is stored as JSON on this computer (`nl_project info` shows the folder); the user can also edit that file directly. If `nl_memory` is not available, say memory needs the NeuroLite desktop extension or Claude Code / Cowork plugin connector.
