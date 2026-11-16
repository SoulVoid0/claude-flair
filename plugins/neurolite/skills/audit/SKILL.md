---
name: audit
description: "Find duplicate/outdated instructions, stale memories, unused deps, duplicate code."
disable-model-invocation: true
---

Run these and summarize findings as one short list per section, most useful first:

1. `nl_scan` `{"kind":"instructions"}` — duplicated or outdated lines in CLAUDE.md / AGENTS.md.
2. `nl_scan` `{"kind":"memory"}` — stale, duplicate, or missing-file memories.
3. `nl_scan` `{"kind":"code"}` — possibly unused dependencies, duplicated blocks, huge files.

Results are heuristics: verify a finding (e.g. grep a "unused" dependency) before recommending removal. Propose fixes; change nothing until the user approves. If `nl_scan` is not available, say the audit needs the NeuroLite tools.
