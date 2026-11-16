#!/usr/bin/env node
'use strict';
// Claude Code hooks for NeuroLite. Each hook fails open: any error → no output, exit 0.
//   session-start   inject mode rules + compact project context; reset read cache after compact/clear
//   pre-read        block a whole-file Read of a file unchanged since this session last read it (once)
//   prompt          suggest /compact when the real context size (from the transcript) gets large

const fs = require('fs');
const path = require('path');
const { Store } = require('../server/lib/store');
const { rules } = require('../server/lib/modes');

function input() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
}

function sessionStart(ev, store) {
  const sid = ev.session_id || 'default';
  if (ev.source === 'compact' || ev.source === 'clear') {
    // Earlier file contents are no longer in context, so earlier reads must not block new ones.
    const s = store.session(sid);
    s.reads = {};
    store.saveSession(sid, s);
  }
  store.pruneSessions();
  const parts = [];
  const mode = store.mode();
  if (mode !== 'normal') parts.push(`NeuroLite mode: ${mode}. ${rules(mode)}`);
  const p = ev.cwd ? store.findByRoot(ev.cwd) : null;
  if (p) {
    const h = store.handoff(p.id);
    if (h) parts.push(`NeuroLite handoff for ${p.id} (updated ${h.updated.slice(0, 10)}):\n${h.text.trim().slice(0, 1500)}`);
    const open = store
      .memories(p.id)
      .filter((m) => m.status === 'active' && (m.type === 'task' || m.type === 'bug'))
      .slice(-6)
      .map((m) => `- [${m.id}] ${m.type}: ${m.text.slice(0, 160)}`);
    if (open.length) parts.push(`Open tasks/bugs:\n${open.join('\n')}`);
    const n = store.memories(p.id).length;
    if (n) parts.push(`${n} project memories available via nl_context / nl_memory search (not loaded).`);
  }
  if (parts.length) emit({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: parts.join('\n\n') } });
}

function preRead(ev, store) {
  const ti = ev.tool_input || {};
  const fp = ti.file_path;
  if (!fp) return;
  store.bump('hook_reads_seen');
  let st;
  try {
    st = fs.statSync(fp);
  } catch {
    return;
  }
  if (!st.isFile()) return;
  const sid = ev.session_id || 'default';
  const s = store.session(sid);
  const key = path.resolve(fp);
  const sig = `${st.size}:${Math.round(st.mtimeMs)}`;
  const whole = ti.offset === undefined && ti.limit === undefined && !ti.pages;
  const prev = s.reads[key];
  if (whole && prev && prev.sig === sig && prev.whole && !prev.blocked) {
    prev.blocked = true; // a retry of the same read is allowed through
    store.saveSession(sid, s);
    store.bump('hook_read_blocked');
    emit({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `NeuroLite: ${path.basename(fp)} is unchanged since you read it in full earlier in this session, so its content is already in your context. ` +
          'Use that, or read a specific range with offset/limit. If the earlier content is truly gone, repeat the same Read and it will be allowed.',
      },
    });
    return;
  }
  s.reads[key] = { sig, whole: whole || (prev && prev.sig === sig && prev.whole) || false, at: Date.now() };
  store.saveSession(sid, s);
}

/** Last assistant usage in the transcript tail = current context size. */
function contextTokens(transcript) {
  try {
    const fd = fs.openSync(transcript, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, 512 * 1024);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n').reverse();
    for (const l of lines) {
      if (!l.includes('"usage"')) continue;
      try {
        const o = JSON.parse(l);
        if (o.isSidechain) continue;
        const u = o.message && o.message.usage;
        if (u) return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      } catch {}
    }
  } catch {}
  return 0;
}

function prompt(ev, store) {
  if (!ev.transcript_path) return;
  const ctx = contextTokens(ev.transcript_path);
  const at = Number(process.env.NEUROLITE_COMPACT_AT) || 150000;
  if (ctx < at) return;
  const sid = ev.session_id || 'default';
  const s = store.session(sid);
  if (s.compactHintAt && ctx < s.compactHintAt + 40000) return; // don't nag every prompt
  s.compactHintAt = ctx;
  store.saveSession(sid, s);
  store.bump('compact_hints');
  emit({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: `NeuroLite: context is ${Math.round(ctx / 1000)}k tokens (from this session's transcript). At a natural break, save a handoff with nl_handoff and suggest the user run /compact.`,
    },
  });
}

function main() {
  const cmd = process.argv[2];
  const ev = input();
  try {
    const store = new Store();
    if (cmd === 'session-start') sessionStart(ev, store);
    else if (cmd === 'pre-read') preRead(ev, store);
    else if (cmd === 'prompt') prompt(ev, store);
  } catch (e) {
    if (process.env.NEUROLITE_DEBUG) process.stderr.write(String(e.stack));
  }
}

if (require.main === module) main();
module.exports = { sessionStart, preRead, prompt, contextTokens };
