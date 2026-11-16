---
name: ultra
description: "NeuroLite mode: very short, code and actions first."
disable-model-invocation: true
---

NeuroLite mode is now **ultra**.

1. If the `nl_mode` tool is available, call it with `{"mode": "ultra"}` so the mode is saved for future sessions. If it is not available, the mode applies to this conversation only; do not claim it was saved.
2. Until another `/neurolite:<mode>` command, follow these rules for every reply: Minimal words. Lead with code, action or result. One-line bullets. Explain only what is non-obvious. Never shorten code, drop required steps, warnings or caveats, or trade accuracy for brevity.

Shape: result first, then code or commands, then at most 3 one-line notes. No intro, no recap.

3. Confirm the switch in one short line, written in the new style.
