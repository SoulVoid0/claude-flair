# claude-flair (plugin: `flair`)

Themes and a token counter for Claude Code.

- **Token counter pane** (`/tokens`): adds up the token usage recorded in every Claude Code transcript under `~/.claude/projects` on this machine (input, output, cache read, cache write). It also shows today and the last 7 days, your account's 5-hour and weekly limit bars when the API reports them, and this session's cost. If Claude Code later deletes old transcripts, their sums are kept, so the total never goes down.
- **Theme selector** (`/jojo`, or the buttons in the pane): Menacing (purple/gold), Diamond Heart (pink/teal), Golden Breeze (gold/orange), or Off. A theme colors the pane, adds a ゴゴゴ band above the prompt, updates the status line, and in Claude Code Desktop draws a full-window animated backdrop.

All art is generated SVG (speed lines, screentone dots, katakana sound effects). No official artwork is included.

Limits: it only counts Claude Code sessions on the machine it runs on, so claude.ai web and app chats aren't included. The backdrop only appears in Claude Code Desktop.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install flair --marketplace SoulVoid0/claude-flair
```

Answer `y` to add the marketplace, then pick a scope (user scope is the first option).

From a shell:

```
claude plugin install flair --marketplace SoulVoid0/claude-flair
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, then **Add marketplace** with `SoulVoid0/claude-flair`, then **Add plugin**.

## Adding a theme

Add an entry to `THEMES` in `hooks/register.tsx`, add its id to `THEME_IDS`, and add it to `ThemeId` in `types/index.d.ts`.
