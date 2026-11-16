---
name: project
description: "List, switch, create or delete NeuroLite projects."
argument-hint: "[list | use <name> | create <name> [folder] | info | delete <name>]"
disable-model-invocation: true
---

Call `nl_project` for: `$ARGUMENTS` (empty → `list`).

- `create <name> [folder]` → `{"action":"create","name":"<name>","root":"<folder>"}`; the folder enables file tools and must be inside an allowed folder.
- `delete <name>` → the tool first reports what would be deleted; show that, get the user's explicit yes, then call again with `"confirm": true`.

Projects are fully independent: memories, handoff and file index are stored per project. In Claude Code the project follows the working folder automatically.
