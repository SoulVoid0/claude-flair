#!/usr/bin/env node
'use strict';
// NeuroLite command line: inspect and edit memory and settings outside Claude.
//   node neurolite.js home | mode [name] | stats [project] | projects
//   node neurolite.js mem list|search <q>|get <id>|rm <id...>|export [project]
//   Add --project <id> to target a project other than the active one.

const { Store } = require('../server/lib/store');
const { Tools } = require('../server/lib/tools');

const args = process.argv.slice(2);
const pi = args.indexOf('--project');
const project = pi >= 0 ? args.splice(pi, 2)[1] : undefined;
const store = new Store();
const tools = new Tools({ store, roots: [process.cwd()], cwdRoot: null });
const [cmd, sub, ...rest] = args;

function run() {
  switch (cmd) {
    case 'home':
      return store.home;
    case 'mode':
      return tools.nl_mode({ mode: sub });
    case 'stats':
      return tools.nl_stats({ project: sub || project });
    case 'projects':
      return tools.nl_project({ action: 'list' });
    case 'mem': {
      if (sub === 'list') return tools.nl_memory({ action: 'list', project, include_stale: true, limit: 1000 });
      if (sub === 'search') return tools.nl_memory({ action: 'search', query: rest.join(' '), project });
      if (sub === 'get') return tools.nl_memory({ action: 'get', ids: rest, project });
      if (sub === 'rm') return tools.nl_memory({ action: 'forget', ids: rest, project });
      if (sub === 'export') return JSON.stringify(store.memories(store.resolve(project).id), null, 2);
      break;
    }
  }
  return 'Usage: neurolite home | mode [normal|efficient|ultra|caveman|developer] | stats | projects | mem list|search <q>|get <id>|rm <id...>|export  [--project <id>]';
}

try {
  console.log(run());
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
