---
name: remember
description: "Save a fact to project memory."
argument-hint: "<fact to remember>"
disable-model-invocation: true
---

Save this to project memory: `$ARGUMENTS`

Pick the best type (architecture, decision, progress, bug, task, convention, note), rewrite it as one clear sentence, add related file paths if known, and call `nl_memory` with `action: "add"`. If it is refused as a secret, tell the user it was not saved and why. If it is a near-duplicate, update the existing memory instead. Reply with one line: the saved id and text.
