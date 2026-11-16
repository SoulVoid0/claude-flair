---
name: smart-coding
description: "NeuroLite coding workflow and checklists for JavaScript, TypeScript, Node.js, Python, HTML, CSS and game development. Use when fixing bugs, reviewing or changing code, adding tests, or checking dependencies and API compatibility."
---

# Smart coding

## Workflow
1. **Recall.** `nl_memory` `search` the error text or component name (type `bug`) — the fix may already be known.
2. **Detect stack** from the manifest files (`nl_files summary`, or package.json / pyproject / project.godot). Use the versions there.
3. **Locate precisely.** Grep the symbol or error message; read only the surrounding range; follow the call chain instead of reading whole files.
4. **Minimal fix.** Change the fewest lines that fix the root cause. Keep style, names and formatting. Don't touch unrelated code, don't reformat, don't rewrite files.
5. **Compatibility.** Before using an API, confirm it exists in the installed version (check `node_modules/<pkg>/package.json`, lockfile, `python -m pip show`, engine version, or the official docs). Say which version you checked. Don't invent functions.
6. **Test.** Add or adjust a targeted test for the bug. If execution is available, run just that test (and the nearest suite); otherwise give the exact command. Report what passed.
7. **Remember.** Save the bug + root cause + fix as one `nl_memory` (`type: bug`, `files`), and mark it `done` when verified.

`nl_scan code` finds possibly unused dependencies, duplicated blocks and oversized files. Treat results as leads to verify, not facts.

## Checklists
**JavaScript / Node.js:** `===`, null/undefined guards, awaited promises and unhandled rejections, `this` binding, mutation of shared objects, off-by-one, ESM vs CommonJS (`"type"` in package.json), Node version for APIs (`fetch` ≥18, `structuredClone` ≥17).
**TypeScript:** fix types rather than adding `any`/`as`; check `strict` flags in tsconfig; narrowing; generated `.d.ts` mismatches.
**Python:** mutable default args, `is` vs `==`, exception scope too broad, venv/interpreter version, blocking calls inside async, integer vs float division.
**HTML/CSS:** valid nesting, labels/alt text, specificity and cascade order, box-sizing, flex/grid overflow (`min-width: 0`), z-index stacking contexts, viewport units on mobile.
**Game development:** frame-rate independent movement (`* delta`), fixed timestep for physics, object pooling for spawns, not allocating in the update loop, input polled once per frame, collision layers/masks, asset load before use, save-file version compatibility. Engines: Phaser/Three.js/Pixi (JS), Pygame (Python), Godot (GDScript), Unity (C#) — check the engine version's API.

## Avoid
Rewriting working code for style, adding dependencies for small helpers, speculative refactors, changing public APIs without saying so, and "fixed" claims without a run or an explicit "not run".
