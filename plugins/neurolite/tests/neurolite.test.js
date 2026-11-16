'use strict';
// Run: node --test plugins/neurolite/tests
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { Store, resolveHome } = require('../server/lib/store');
const { findSecret } = require('../server/lib/secrets');
const F = require('../server/lib/files');
const { Tools } = require('../server/lib/tools');
const { makeServer } = require('../server/index');
const hook = require('../scripts/hook');
const { transcriptUsage } = require('../server/lib/usage');

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fixtureProject() {
  const dir = tmp('nl-proj-');
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies: { phaser: '3', lodash: '4', express: '4' }, devDependencies: { vitest: '1' }, scripts: { test: 'vitest' } }));
  fs.mkdirSync(path.join(dir, 'src'));
  const block = ['function update(dt) {', '  player.x += player.vx * dt;', '  player.y += player.vy * dt;', '  if (player.x < 0) player.x = 0;', '  if (player.y < 0) player.y = 0;', '  checkCollisions(player, enemies);', '  render(player);', '}'].join('\n');
  fs.writeFileSync(path.join(dir, 'src', 'game.js'), `import Phaser from 'phaser';\n${block}\n`);
  fs.writeFileSync(path.join(dir, 'src', 'copy.js'), `const express = require('express');\n${block}\n`);
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Notes\nAlways run the tests before committing any change.\nSee `src/missing.js` for the loader.\nAlways run the tests before committing any change.\n');
  fs.mkdirSync(path.join(dir, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'x', 'i.js'), 'resolveHome');
  return dir;
}

test('secrets are detected and plain text is not', () => {
  assert.ok(findSecret('key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123'));
  assert.ok(findSecret('password = hunter2hunter'));
  assert.ok(findSecret('postgres://user:pa55word@db.local/app'));
  assert.ok(findSecret('-----BEGIN RSA PRIVATE KEY-----'));
  assert.ok(findSecret('ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ'));
  assert.strictEqual(findSecret('Auth uses JWT tokens stored in httpOnly cookies; see src/auth.ts'), null);
  assert.strictEqual(findSecret('Phaser 3 game, entry src/main.ts, build with vite'), null);
});

test('data home: env wins, ignores unsubstituted placeholders', () => {
  assert.strictEqual(resolveHome({ NEUROLITE_HOME: '/x/y' }, 'linux'), path.resolve('/x/y'));
  assert.strictEqual(resolveHome({ NEUROLITE_HOME: '${user_config.data_folder}' }, 'linux'), path.join(os.homedir(), '.neurolite'));
  assert.strictEqual(resolveHome({ NEUROLITE_HOME: '' }, 'linux'), path.join(os.homedir(), '.neurolite'));
});

test('memory: add, duplicate detection, secret refusal, update history, recall ranking, forget', () => {
  const s = new Store(tmp('nl-home-'));
  const p = s.createProject('Game', null);
  const a = s.remember(p.id, { type: 'architecture', text: 'Phaser 3 game; scenes in src/scenes; physics uses arcade', tags: ['phaser'] });
  assert.ok(a.memory);
  s.remember(p.id, { type: 'bug', text: 'Player jitter caused by non-delta movement; fixed with dt scaling' });
  s.remember(p.id, { type: 'decision', text: 'Use Vite instead of webpack for faster builds' });
  const dup = s.remember(p.id, { type: 'architecture', text: 'Phaser 3 game; scenes in src/scenes; physics uses arcade engine' });
  assert.ok(dup.duplicateOf, 'near duplicate is caught');
  assert.throws(() => s.remember(p.id, { type: 'note', text: 'token ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ' }), /Refused/);
  const r = s.recall(p.id, { query: 'player jitter movement' });
  assert.match(r[0].text, /jitter/);
  assert.strictEqual(s.recall(p.id, { query: 'kubernetes' }).length, 0, 'irrelevant memories are not loaded');
  const u = s.updateMemory(p.id, a.memory.id, { text: 'Phaser 3.80 game; scenes in src/scenes' });
  assert.strictEqual(u.history[0].text, a.memory.text);
  assert.strictEqual(s.forget(p.id, [a.memory.id]), 1);
  assert.strictEqual(s.memories(p.id).length, 2);
});

test('projects are independent', () => {
  const s = new Store(tmp('nl-home-'));
  const a = s.createProject('A', null);
  const b = s.createProject('B', null);
  s.remember(a.id, { type: 'note', text: 'only in project A' });
  assert.strictEqual(s.memories(b.id).length, 0);
  s.setConfig({ activeProject: b.id });
  assert.strictEqual(s.resolve().id, b.id);
  s.deleteProject(a.id);
  assert.strictEqual(s.projects().length, 1);
});

test('path guard blocks paths outside allowed folders', () => {
  const dir = fixtureProject();
  assert.ok(F.guard([dir], 'src/game.js'));
  assert.throws(() => F.guard([dir], '../../etc/passwd'), /outside/);
  assert.throws(() => F.guard([], 'x'), /No folders/);
});

test('smartRead: ranges, grep, unchanged detection, change invalidates', () => {
  const dir = fixtureProject();
  const fp = path.join(dir, 'src', 'game.js');
  const cache = new Map();
  const r1 = F.smartRead(fp, { start: 2, end: 3 }, cache);
  assert.match(r1.out, /^2\| function update/);
  const r2 = F.smartRead(fp, { start: 2, end: 3 }, cache);
  assert.ok(r2.cached);
  assert.ok(!F.smartRead(fp, { start: 2, end: 3, force: true }, cache).cached);
  fs.appendFileSync(fp, '// changed\n');
  assert.ok(!F.smartRead(fp, { start: 2, end: 3 }, cache).cached, 'changed file is resent');
  assert.match(F.smartRead(fp, { grep: 'checkCollisions', context: 0 }, cache).out, /7\| +checkCollisions/);
});

test('grep skips node_modules and honors glob', () => {
  const dir = fixtureProject();
  const r = F.grepFiles([dir], dir, 'resolveHome|checkCollisions', { glob: '*.js' });
  assert.match(r.out, /game\.js:\d+/);
  assert.doesNotMatch(r.out, /node_modules/);
});

test('log triage groups repeats and keeps traces', () => {
  const log = [
    '2026-11-16T10:00:00Z INFO start',
    '2026-11-16T10:00:01Z ERROR Connection refused to 10.0.0.1:5432',
    '2026-11-16T10:00:02Z ERROR Connection refused to 10.0.0.1:5433',
    'TypeError: Cannot read properties of undefined (reading x)',
    '    at update (src/game.js:12:5)',
    '    at step (phaser.js:100:1)',
    '2026-11-16T10:00:03Z WARN slow frame 40ms',
    ...Array(500).fill('INFO tick'),
  ].join('\n');
  const out = F.triageLog(log, { warnings: true });
  assert.match(out, /×2: .*Connection refused/);
  assert.match(out, /at update \(src\/game\.js:12:5\)/);
  assert.match(out, /^W L7/m);
  assert.doesNotMatch(out, /tick/);
});

test('index + stack detection + diff', () => {
  const dir = fixtureProject();
  const idx = F.buildIndex(dir);
  assert.ok(idx.stack.includes('Phaser') && idx.stack.includes('Vitest') && idx.stack.includes('Node.js'));
  assert.ok(!idx.files.some((f) => f[0].includes('node_modules')));
  fs.writeFileSync(path.join(dir, 'src', 'new.js'), 'x');
  assert.deepStrictEqual(F.indexDiff(idx).added, ['src/new.js']);
});

test('code scan finds unused deps and duplicated blocks; instruction audit finds dupes and missing paths', () => {
  const dir = fixtureProject();
  const out = F.scanCode(dir);
  assert.match(out, /unused dependencies.*lodash/);
  assert.doesNotMatch(out, /unused dependencies.*phaser/);
  assert.doesNotMatch(out, /devDependencies: vitest/);
  assert.match(out, /Duplicated blocks/);
  const ins = F.auditInstructions(dir);
  assert.match(ins, /missing paths: src\/missing\.js/);
  assert.match(ins, /Duplicated instruction lines/);
});

test('tools: modes persist, context loads only relevant memories, stats never invent tokens', () => {
  const dir = fixtureProject();
  const store = new Store(tmp('nl-home-'));
  const t = new Tools({ store, roots: [dir], cwdRoot: dir });
  assert.match(t.call('nl_mode', { mode: 'ultra' }), /Mode: ultra \(saved\)/);
  assert.strictEqual(new Store(store.home).mode(), 'ultra');
  assert.throws(() => t.call('nl_mode', { mode: 'turbo' }), /Unknown mode/);
  t.call('nl_memory', { action: 'add', type: 'bug', text: 'Collision misses fast enemies; fixed with swept AABB', files: ['src/game.js'] });
  t.call('nl_memory', { action: 'add', type: 'decision', text: 'Save files use JSON with a version field' });
  const ctx = t.call('nl_context', { query: 'collision enemies' });
  assert.match(ctx, /swept AABB/);
  assert.doesNotMatch(ctx, /Save files/);
  t.call('nl_files', { action: 'build' });
  t.call('nl_read', { path: 'src/game.js', start: 1, end: 2 });
  t.call('nl_read', { path: 'src/game.js', start: 1, end: 2 });
  const st = t.call('nl_stats', {});
  assert.match(st, /Mode: ultra/);
  assert.match(st, /Files indexed: \d+/);
  assert.match(st, /Read cache: 1 unchanged/);
  assert.match(st, /Token usage: not available/);
  assert.match(t.call('nl_project', { action: 'delete', name: store.resolve(null, dir).id }), /confirm:true/);
});

test('MCP server speaks JSON-RPC over stdio', async () => {
  const home = tmp('nl-home-');
  const dir = fixtureProject();
  const p = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js'), dir], { env: { ...process.env, NEUROLITE_HOME: home } });
  const msgs = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nl_grep', arguments: { pattern: 'checkCollisions' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nl_memory', arguments: { action: 'list' } } },
    { jsonrpc: '2.0', id: 5, method: 'nope' },
  ];
  const out = await new Promise((res) => {
    let buf = '';
    p.stdout.on('data', (d) => (buf += d));
    p.on('close', () => res(buf.trim().split('\n').map((l) => JSON.parse(l))));
    p.stdin.end(msgs.map((m) => JSON.stringify(m)).join('\n') + '\n');
  });
  assert.strictEqual(out.length, 5, 'notification gets no reply');
  assert.strictEqual(out[0].result.protocolVersion, '2025-06-18');
  assert.strictEqual(out[1].result.tools.length, 11);
  assert.match(out[2].result.content[0].text, /game\.js/);
  assert.ok(out[3].result.isError, 'no active project in Desktop mode is a tool error, not a crash');
  assert.strictEqual(out[4].error.code, -32601);
});

test('Claude Code hook: blocks one unchanged whole-file re-read, allows retry, ranges and changed files', () => {
  const home = tmp('nl-home-');
  const dir = fixtureProject();
  const fp = path.join(dir, 'src', 'game.js');
  const run = (cmd, ev) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'hook.js'), cmd], { input: JSON.stringify(ev), env: { ...process.env, NEUROLITE_HOME: home } }).stdout.toString();
  const ev = { session_id: 's1', tool_name: 'Read', tool_input: { file_path: fp } };
  assert.strictEqual(run('pre-read', ev), '');
  assert.match(JSON.parse(run('pre-read', ev)).hookSpecificOutput.permissionDecision, /deny/);
  assert.strictEqual(run('pre-read', ev), '', 'retry goes through');
  assert.strictEqual(run('pre-read', { ...ev, tool_input: { file_path: fp, offset: 1, limit: 5 } }), '');
  fs.appendFileSync(fp, '\n// edit\n');
  assert.strictEqual(run('pre-read', ev), '', 'changed file reads normally');
  run('pre-read', ev);
  run('session-start', { session_id: 's1', source: 'compact', cwd: dir });
  assert.strictEqual(run('pre-read', ev), '', 'compaction resets the cache');
});

test('Claude Code hook: session-start injects mode and project context only when useful', () => {
  const home = tmp('nl-home-');
  const dir = fixtureProject();
  const run = (cmd, ev) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'hook.js'), cmd], { input: JSON.stringify(ev), env: { ...process.env, NEUROLITE_HOME: home } }).stdout.toString();
  assert.strictEqual(run('session-start', { session_id: 'a', source: 'startup', cwd: dir }), '', 'normal mode, no project → no tokens added');
  const s = new Store(home);
  s.setMode('caveman');
  const p = s.projectForRoot(dir);
  s.setHandoff(p.id, 'Goal: ship v1. Next: fix collisions.');
  s.remember(p.id, { type: 'task', text: 'Add pause menu' });
  const ctx = JSON.parse(run('session-start', { session_id: 'a', source: 'startup', cwd: dir })).hookSpecificOutput.additionalContext;
  assert.match(ctx, /mode: caveman/);
  assert.match(ctx, /ship v1/);
  assert.match(ctx, /Add pause menu/);
});

test('usage comes only from real transcript data and compaction hint uses it', () => {
  const dir = tmp('nl-tr-');
  const f = path.join(dir, 't.jsonl');
  const line = (id, i, o, cr) => JSON.stringify({ message: { id, usage: { input_tokens: i, output_tokens: o, cache_read_input_tokens: cr, cache_creation_input_tokens: 0 } } });
  fs.writeFileSync(f, [line('m1', 10, 5, 1000), line('m1', 10, 5, 1000), line('m2', 20, 7, 160000)].join('\n'));
  const u = transcriptUsage(f);
  assert.deepStrictEqual([u.input, u.output, u.cacheRead, u.messages, u.context], [30, 12, 161000, 2, 160020]);
  assert.strictEqual(hook.contextTokens(f), 160020);
  const home = tmp('nl-home-');
  const run = () => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'hook.js'), 'prompt'], { input: JSON.stringify({ session_id: 'z', transcript_path: f }), env: { ...process.env, NEUROLITE_HOME: home } }).stdout.toString();
  assert.match(run(), /160k tokens/);
  assert.strictEqual(run(), '', 'does not nag on every prompt');
});

test('plugin files are well-formed', () => {
  for (const f of ['.claude-plugin/plugin.json', '.mcp.json', 'hooks/hooks.json', 'mcpb/manifest.json']) JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const skills = fs.readdirSync(path.join(ROOT, 'skills'));
  for (const m of ['normal', 'efficient', 'ultra', 'caveman', 'developer', 'stats']) assert.ok(skills.includes(m), `/neurolite:${m} exists`);
  for (const s of skills) {
    const t = fs.readFileSync(path.join(ROOT, 'skills', s, 'SKILL.md'), 'utf8');
    const fm = t.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(fm, `${s} has frontmatter`);
    assert.match(fm[1], new RegExp(`^name: ${s}$`, 'm'));
    for (const l of fm[1].split('\n')) if (/^description: /.test(l)) assert.match(l, /^description: ".*"$/, `${s} description quoted`);
  }
});
