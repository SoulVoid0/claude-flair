#!/usr/bin/env node
'use strict';
// NeuroLite MCP server: stdio JSON-RPC 2.0, zero dependencies, no network access.
//
// Usage: node index.js [--use-cwd] [allowedFolder ...]
//   --use-cwd       allow the working directory and use it as the project root (Claude Code / Cowork)
//   allowedFolder   folders the file tools may read (Claude Desktop extension settings)
// Env:  NEUROLITE_HOME   data directory      NEUROLITE_ROOTS  extra allowed folders (; separated)

const { Store } = require('./lib/store');
const { Tools } = require('./lib/tools');
const { parseRoots } = require('./lib/files');
const pkg = require('./package.json');

const fs = require('fs');
const os = require('os');
const path = require('path');

// Diagnostics go to %TEMP%/neurolite-mcp.log (always writable, even for sandboxed hosts),
// never to stdout, which carries the protocol.
const LOG = path.join(os.tmpdir(), 'neurolite-mcp.log');
function log(msg) {
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > 256 * 1024) fs.renameSync(LOG, LOG + '.old');
    fs.appendFileSync(LOG, `${new Date().toISOString()} [${process.pid}] ${msg}\n`);
  } catch {}
}

/** Open the data store; fall back to ~/.neurolite, then the temp folder, so startup never fails. */
function openStore(env) {
  const { resolveHome } = require('./lib/store');
  for (const home of [resolveHome(env), path.join(os.homedir(), '.neurolite'), path.join(os.tmpdir(), 'neurolite')]) {
    try {
      const s = new Store(home);
      log(`data folder: ${home}`);
      return s;
    } catch (e) {
      log(`data folder ${home} unusable: ${e.message}`);
    }
  }
  throw new Error('No writable data folder');
}

const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

function makeServer({ argv = process.argv.slice(2), env = process.env, cwd = process.cwd() } = {}) {
  const useCwd = argv.includes('--use-cwd');
  const roots = parseRoots([...argv.filter((a) => !a.startsWith('--')), ...(env.NEUROLITE_ROOTS ? [env.NEUROLITE_ROOTS] : []), ...(useCwd ? [cwd] : [])]);
  const store = openStore(env);
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
  process.on('uncaughtException', (e) => log(`uncaught: ${e.stack}`));
  process.on('unhandledRejection', (e) => log(`unhandled: ${e && e.stack}`));
  log(`start node ${process.version} exec=${process.execPath} cwd=${process.cwd()} argv=${JSON.stringify(process.argv.slice(2))} home=${JSON.stringify(process.env.NEUROLITE_HOME || '')}`);
  let server;
  try {
    server = makeServer();
  } catch (e) {
    log(`startup failed: ${e.stack}`);
    process.exit(1);
  }
  const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
  const onLine = (raw) => {
    const line = raw.replace(/^\uFEFF/, '').trim();
    if (!line) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      log(`parse error: ${line.slice(0, 200)}`);
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    for (const m of Array.isArray(msg) ? msg : [msg]) {
      if (m.method === 'initialize' || m.method === 'tools/list') log(`recv ${m.method}`);
      let res;
      try {
        res = server.handle(m);
      } catch (e) {
        log(`handler error: ${e.stack}`);
        res = m.id != null ? { jsonrpc: '2.0', id: m.id, error: { code: -32603, message: e.message } } : null;
      }
      if (res) send(res);
    }
  };
  // Same newline-delimited framing the official SDK uses: raw 'data' events, manual split.
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      onLine(line);
    }
  });
  process.stdin.on('end', () => {
    if (buf.trim()) onLine(buf);
    log('stdin closed, exiting');
    process.exit(0);
  });
  process.stdin.resume();
}

if (require.main === module) main();
module.exports = { makeServer };
