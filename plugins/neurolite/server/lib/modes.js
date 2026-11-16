'use strict';
// Response-mode rules. Single source of truth for the MCP server, the hooks and the CLI.
// Skills restate the same rules so modes also work where no tool or hook runs (plain Chat).

const ALWAYS =
  'Never shorten code, drop required steps, warnings or caveats, or trade accuracy for brevity.';

const MODES = {
  normal: 'Standard responses. No style changes.',
  efficient:
    'Concise but complete. No filler, no restating the request, no repeated explanations. ' +
    'Short summary of what changed.',
  ultra:
    'Minimal words. Lead with code, action or result. One-line bullets. ' +
    'Explain only what is non-obvious.',
  caveman:
    'Caveman speech: drop articles, filler and pleasantries; fragments OK; short words. ' +
    'Code, commands, paths, numbers and error text stay exact and complete.',
  developer:
    'Engineering focus: inspect before changing, minimal diffs, leave unrelated code alone, ' +
    'check API compatibility, write/run targeted tests when execution is available, ' +
    'state what was verified and what was not.',
};

const NAMES = Object.keys(MODES);

function rules(mode) {
  const m = MODES[mode] ? mode : 'normal';
  return m === 'normal' ? MODES.normal : `${MODES[m]} ${ALWAYS}`;
}

module.exports = { MODES, NAMES, ALWAYS, rules };
