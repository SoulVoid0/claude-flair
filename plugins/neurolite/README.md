# NeuroLite: Intelligent AI Efficiency System

NeuroLite makes Claude waste fewer tokens, keep project context between sessions, and work in a more organized way. Everything runs locally: no network calls, no telemetry, no npm dependencies.

It ships in two parts:

| Part | File | What it gives you | Where it works |
| --- | --- | --- | --- |
| **Plugin** | this folder (marketplace `SoulVoid0/claude-flair`, or `neurolite-plugin.zip`) | `/neurolite:*` commands, the efficiency and smart-coding skills, Claude Code hooks, and a local connector | Skills/commands: Desktop Chat, Cowork, Claude Code. Connector: Claude Code, and Cowork sessions on your computer. Hooks: Claude Code (and Cowork where it runs plugin hooks) |
| **Desktop extension** | `neurolite.mcpb` | The same local MCP server for **Claude Desktop Chat**: memory, saved modes, file tools, stats | Claude Desktop (Chat and Cowork) |

Install the plugin everywhere, and add the extension if you use Desktop Chat. Both read the same data folder on the same computer.

## Features

**Response modes:** `/neurolite:normal`, `/neurolite:efficient`, `/neurolite:ultra`, `/neurolite:caveman`, `/neurolite:developer`. Each mode keeps code, commands, paths, numbers and error text complete, and never trades correctness for shorter output. With the connector or extension the mode is saved (`nl_mode`) and restored in later sessions. In Claude Code a hook injects it at session start and again after compaction.

**Project memory:** per-project JSON (`memories.json`) with types architecture, decision, progress, bug, task, convention and note.
- Only memories relevant to the task are loaded (`nl_context`, `nl_memory search`), never the whole history.
- Near-duplicates are caught, and updates keep the previous 3 versions.
- `nl_scan memory` flags memories that point at deleted files, have gone stale, or duplicate each other.
- Secrets (API keys, tokens, private keys, passwords, connection strings, high-entropy strings) are refused.
- Projects are fully independent. In Claude Code the project follows the working folder automatically.
- `/neurolite:memory` inspects, edits and deletes memories. You can also edit the JSON file directly or use the CLI.

**Token-efficient file tools:**
- `nl_read`: line ranges or grep with context. A range you already read is answered with "unchanged" instead of being resent.
- `nl_grep`: targeted search that skips `node_modules`, `.git` and build output.
- `nl_log`: triages a log locally and returns unique errors with counts, line numbers and short traces.
- `nl_files`: project index with stack detection (React, Next, Vue, Express, Phaser, Three.js, Pixi, Electron, Vite, Jest/Vitest, Django, Flask, FastAPI, Pygame, Godot, Unity and more) and a "changed since" view.
- `nl_scan code`: possibly unused npm and Python dependencies, duplicated code blocks, oversized files.
- `nl_scan instructions`: duplicated or outdated lines in CLAUDE.md, AGENTS.md and similar files.

**Context management:**
- `nl_handoff` and `/neurolite:handoff` keep a compact handoff summary.
- In Claude Code a hook reads the real context size from the session transcript and suggests `/compact` once it passes 150k tokens (set `NEUROLITE_COMPACT_AT` to change that).
- A `PreToolUse` hook blocks a whole-file `Read` of a file that hasn't changed since it was read earlier in the session. A repeat of the same Read is allowed, and the cache resets after `/compact` or `/clear`.

**Dashboard:** `/neurolite:stats` (`nl_stats`) shows:
- mode, project memory use, files indexed
- read-cache hits and operations optimized
- bytes scanned locally versus bytes returned to Claude (measured bytes, not tokens)
- suggestions
- real token usage, only where a source exists: the Claude Code session transcript (input, output, cache read/write, prompt-cache hit rate, current context size)

Desktop Chat exposes no token counts to extensions, so there the dashboard says "not available" and does not estimate.

**Skills loaded automatically when relevant:** `efficiency` covers search-before-read, single-tool choice, scripts for repetitive work, no unnecessary subagents or background processes, no destructive actions without approval, short progress reports, and what to save to memory. `smart-coding` covers recall of known bugs, stack detection, minimal fixes, API compatibility checks, targeted tests, and checklists for JS, TS, Node, Python, HTML/CSS and game development.

The plugin's always-on cost in Claude Code is about 455 tokens, measured with `claude plugin details neurolite@flair`. Mode commands load only when you run them.

## What NeuroLite cannot do

- It cannot see or control Claude's context window, hidden reasoning or the model's token accounting. It only changes what Claude is told and which tools it has.
- Modes in plain Desktop Chat without the extension last for that conversation only. The skill says so instead of claiming the mode was saved.
- Hooks (read de-duplication, auto-injected context, compaction hints) need Claude Code or a host that runs plugin hooks. Desktop Chat does not run them.
- File tools only read inside the folders you allow. NeuroLite never writes to your project files. It writes only to its own data folder.

## Install: Claude Desktop (Chat + Cowork)

1. **Plugin:** open **Customize → Plugins → Add → Add marketplace**, enter `SoulVoid0/claude-flair`, then add **NeuroLite**. To install offline instead, use **Add → Upload plugin** and pick `neurolite-plugin.zip`.
2. **Extension, for memory and stats in Chat:** double-click `neurolite.mcpb`, or drag it into the Claude window, or go to **Settings → Extensions → Advanced settings → Install Extension…**.
   - **Allowed folders:** pick the folders NeuroLite may read, for example `A:\Claude Workplace`.
   - **Data folder:** leave it empty. On Windows with an A: drive it defaults to `A:\Claude Workplace\NeuroLite\data`, otherwise `~/.neurolite`. You can also pick any folder.
   Claude Desktop ships its own Node.js for extensions, so you don't need to install anything else.
3. In a chat, type `/neurolite:efficient` (or any mode). For a new project, say "create a NeuroLite project called MyGame at A:\Claude Workplace\MyGame".

If both the extension and the plugin connector show up in Cowork, you can disable one of them. They share the same tools and data.

## Install: Claude Code

```
/plugin marketplace add SoulVoid0/claude-flair
/plugin install neurolite@flair
```

From a shell: `claude plugin marketplace add SoulVoid0/claude-flair` then `claude plugin install neurolite@flair`.

The connector and hooks run `node`, which needs Node.js 18 or newer on your PATH. The Claude Code native installer doesn't include Node. To keep it on the A: drive on Windows (PowerShell):

```powershell
$v = "v22.11.0"
Invoke-WebRequest "https://nodejs.org/dist/$v/node-$v-win-x64.zip" -OutFile "A:\node.zip"
Expand-Archive "A:\node.zip" "A:\Tools" ; Rename-Item "A:\Tools\node-$v-win-x64" "A:\Tools\nodejs" ; Remove-Item "A:\node.zip"
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";A:\Tools\nodejs", "User")
```

To pin the data folder for Claude Code, set `NEUROLITE_HOME` (for example `setx NEUROLITE_HOME "A:\Claude Workplace\NeuroLite\data"`). Without it the A:-drive default above applies.

## Command line

`node <plugin>/scripts/neurolite.js mode caveman | stats | projects | mem list | mem search <q> | mem rm <id> | mem export | home`

## Update

- **Desktop plugin:** Customize → Plugins → the `flair` marketplace → **Check for updates** (or turn on **Sync automatically**).
- **Desktop extension:** install the new `neurolite.mcpb` over the old one. Your settings and data are kept.
- **Claude Code:** `claude plugin marketplace update flair` then `claude plugin update neurolite@flair` (or `/plugin` → Marketplaces → Update).

## Uninstall

- **Desktop plugin:** Customize → Plugins → NeuroLite → menu → **Remove**.
- **Desktop extension:** Settings → Extensions → NeuroLite → **Uninstall**.
- **Claude Code:** `claude plugin uninstall neurolite@flair`.
- **Data** is kept on purpose. Delete the data folder to remove all memories: `A:\Claude Workplace\NeuroLite\data` (or `~/.neurolite`). The CLI's `home` command prints the path.

## Develop

```
node --test plugins/neurolite/tests/*.test.js   # 16 tests: memory, secrets, file tools, MCP protocol, hooks, usage
claude plugin validate plugins/neurolite
bash plugins/neurolite/scripts/build.sh          # dist/neurolite.mcpb + dist/neurolite-plugin.zip
```

Layout: `server/` holds the zero-dependency MCP server (`index.js`, `lib/`), `skills/` the commands and skills, `hooks/hooks.json` with `scripts/hook.js` the Claude Code hooks, and `mcpb/manifest.json` the desktop extension manifest.
