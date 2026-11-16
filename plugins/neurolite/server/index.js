#!/usr/bin/env node
'use strict';
// NeuroLite MCP server: stdio JSON-RPC 2.0, zero dependencies, no network access.
//
// Usage: node index.js [--use-cwd] [allowedFolder ...]
//   --use-cwd       allow the working directory and use it as the project root (Claude Code / Cowork)
//   allowedFolder   folders the file tools may read (Claude Desktop extension settings)
// Env:  NEUROLITE_HOME   data directory      NEUROLITE_ROOTS  extra allowed folders (; separated)

const readline = require('readline');
const { Store } = require('./lib/store');
const { Tools } = require('./lib/tools');
const { parseRoots } = require('./lib/files');
const pkg = require('./package.json');

const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

function makeServer({ argv = process.argv.slice(2), env = process.env, cwd = process.cwd() } = {}) {
  const useCwd = argv.includes('--use-cwd');
  const roots = parseRoots([...argv.filter((a) => !a.startsWith('--')), ...(env.NEUROLITE_ROOTS ? [env.NEUROLITE_ROOTS] : []), ...(useCwd ? [cwd] : [])]);
  const store = new Store(require('./lib/store').resolveHome(env));
  const tools = new Tools({ store, roots, cwdRoot: useCwd ? cwd : null });

  function handle(msg) {
    const { id, method, params } = msg;
    const ok = (result) => ({ jsonrpc: '2.0', id, result });
    const err = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
    if (id === undefined || id === null) return null; // notifications need no reply
    switch (method) {
      case 'initialize': {
        const want = params && params.protocolVersion;
        return ok({
          protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'neurolite', version: pkg.version },
          instructions:
            'NeuroLite: local project memory and token-efficient file tools. At the start of a task call nl_context once. ' +
            'Use nl_read ranges / nl_grep / nl_log instead of whole files. Save durable facts with nl_memory add; never secrets.',
        });
      }
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools: tools.list() });
      case 'tools/call': {
        const name = params && params.name;
        try {
          const text = tools.call(name, (params && params.arguments) || {});
          return ok({ content: [{ type: 'text', text: String(text) }] });
        } catch (e) {
          return ok({ content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
        }
      }
      case 'resources/list':
        return ok({ resources: [] });
      case 'prompts/list':
        return ok({ prompts: [] });
      default:
        return err(-32601, `Method not found: ${method}`);
    }
  }
  return { handle, store, tools, roots };
}

function main() {
  const server = makeServer();
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
      return;
    }
    const batch = Array.isArray(msg) ? msg : [msg];
    for (const m of batch) {
      const res = server.handle(m);
      if (res) process.stdout.write(JSON.stringify(res) + '\n');
    }
  });
  rl.on('close', () => process.exit(0));
  process.on('uncaughtException', (e) => process.stderr.write(`neurolite: ${e.stack}\n`));
}

if (require.main === module) main();
module.exports = { makeServer };
