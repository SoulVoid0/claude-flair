---
name: handoff
description: "Write and save a compact handoff summary."
disable-model-invocation: true
---

Write a handoff for this project in at most ~25 lines, using exactly these headings:

**Goal** · **Current state** (what works, what is verified) · **Next steps** (ordered) · **Key files** · **Gotchas** (traps, decisions and why)

Include only facts from this session or memory. No secrets. Then save it with `nl_handoff` `{"text": "..."}` and save any new durable facts with `nl_memory` `add`. If the tools are not available, print the handoff so the user can paste it into the next chat. Finish with one line saying where it was saved.
