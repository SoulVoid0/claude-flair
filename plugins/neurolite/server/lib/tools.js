'use strict';
// NeuroLite MCP tools. Outputs are plain compact text, never pretty-printed JSON.

const fs = require('fs');
const path = require('path');
const { MEMORY_TYPES } = require('./store');
const { NAMES, rules } = require('./modes');
const F = require('./files');
const { latestSessionUsage, fmtUsage } = require('./usage');

const P = { type: 'string', description: 'Project id or name. Default: active project.' };
const RO = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

const DEFS = [
  {
    name: 'nl_mode',
    description: `Get or set the NeuroLite response mode (${NAMES.join('|')}). Persists across chats. Returns the rules to follow.`,
    inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: NAMES } } },
    annotations: WR,
  },
  {
    name: 'nl_project',
    description: 'Manage independent projects. list | use (set active) | create | info | delete (needs confirm:true).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'use', 'create', 'info', 'delete'] },
        name: { type: 'string', description: 'Project id or name' },
        root: { type: 'string', description: 'Project folder (create). Must be inside an allowed folder to use file tools.' },
        confirm: { type: 'boolean' },
      },
      required: ['action'],
    },
    annotations: { ...WR, destructiveHint: true },
  },
  {
    name: 'nl_context',
    description: 'Start-of-task context: handoff summary, mode, and only the memories relevant to query. Call once per task instead of re-asking the user.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'What the task is about' }, project: P } },
    annotations: RO,
  },
  {
    name: 'nl_memory',
    description:
      `Project memory. add (type: ${MEMORY_TYPES.join('|')}; durable facts only, never secrets) | update (id) | search (query) | list | get (ids) | stale (ids) | forget (ids, deletes). ` +
      'Save architecture, decisions, conventions, bugs+fixes, open tasks. Not chit-chat or things derivable from code.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'update', 'search', 'list', 'get', 'stale', 'forget'] },
        type: { type: 'string', enum: MEMORY_TYPES },
        text: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        files: { type: 'array', items: { type: 'string' }, description: 'Related paths relative to project root' },
        id: { type: 'string' },
        ids: { type: 'array', items: { type: 'string' } },
        status: { type: 'string', enum: ['active', 'stale', 'done'] },
        query: { type: 'string' },
        limit: { type: 'number' },
        include_stale: { type: 'boolean' },
        force: { type: 'boolean', description: 'Add even if a near-duplicate exists' },
        project: P,
      },
      required: ['action'],
    },
    annotations: { ...WR, destructiveHint: true },
  },
  {
    name: 'nl_handoff',
    description: 'Get (no text) or replace (text) the compact handoff summary for the project: goal, state, next steps, gotchas. ≤4000 chars.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, project: P } },
    annotations: WR,
  },
  {
    name: 'nl_files',
    description: 'Project file index. build | summary (stack, languages, key files) | find (path substring) | changed (since last build).',
    inputSchema: {
      type: 'object',
      properties: { action: { type: 'string', enum: ['build', 'summary', 'find', 'changed'] }, query: { type: 'string' }, project: P },
      required: ['action'],
    },
    annotations: RO,
  },
  {
    name: 'nl_read',
    description: 'Read part of a file with line numbers: start/end range or grep regex with context. Reports when the same range is unchanged since last read instead of resending it.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        start: { type: 'number' },
        end: { type: 'number' },
        grep: { type: 'string' },
        context: { type: 'number' },
        force: { type: 'boolean', description: 'Resend even if unchanged' },
      },
      required: ['path'],
    },
    annotations: RO,
  },
  {
    name: 'nl_grep',
    description: 'Regex search across files (skips node_modules, .git, build output). Returns file:line hits only.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string', description: 'Folder or file. Default: project root' },
        glob: { type: 'string', description: 'e.g. *.ts,*.tsx' },
        max_results: { type: 'number' },
        context: { type: 'number' },
      },
      required: ['pattern'],
    },
    annotations: RO,
  },
  {
    name: 'nl_log',
    description: 'Triage a log locally: unique error lines with counts, line numbers and short stack traces. Give path or text.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        text: { type: 'string' },
        pattern: { type: 'string', description: 'Custom match regex' },
        warnings: { type: 'boolean' },
        tail: { type: 'number', description: 'Only the last N lines' },
      },
    },
    annotations: RO,
  },
  {
    name: 'nl_scan',
    description: 'Health scans. code (unused deps, duplicated blocks, huge files) | instructions (duplicate/outdated lines in CLAUDE.md etc.) | memory (stale, duplicate, missing-file memories).',
    inputSchema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['code', 'instructions', 'memory'] }, path: { type: 'string' }, project: P },
      required: ['kind'],
    },
    annotations: RO,
  },
  {
    name: 'nl_stats',
    description: 'Efficiency dashboard: mode, memory use, files indexed, read-cache hits, bytes kept out of context, suggestions, and real token usage when a Claude Code transcript exists.',
    inputSchema: { type: 'object', properties: { project: P } },
    annotations: RO,
  },
];

function fmtMem(m) {
  const extra = [m.tags && m.tags.length ? `#${m.tags.join(' #')}` : '', m.files && m.files.length ? `files: ${m.files.join(', ')}` : '', m.status !== 'active' ? `[${m.status}]` : '']
    .filter(Boolean)
    .join(' ');
  return `[${m.id}] ${m.type}: ${m.text}${extra ? ' — ' + extra : ''}`;
}

class Tools {
  /** ctx: { store, roots: string[], cwdRoot: string|null } */
  constructor(ctx) {
    this.store = ctx.store;
    this.roots = ctx.roots || [];
    this.cwdRoot = ctx.cwdRoot || null;
    this.readCache = new Map();
  }

  list() {
    return DEFS;
  }

  project(id) {
    return this.store.resolve(id, this.cwdRoot);
  }

  base(id) {
    try {
      const p = this.project(id);
      if (p.root) return p.root;
    } catch {}
    return this.cwdRoot || this.roots[0];
  }

  measure(kind, src, out) {
    this.store.bump(`${kind}_calls`);
    this.store.bump('bytes_scanned', src);
    this.store.bump('bytes_returned', out);
  }

  call(name, a = {}) {
    const fn = this[name];
    if (!fn || !DEFS.find((d) => d.name === name)) throw new Error(`Unknown tool ${name}`);
    return fn.call(this, a);
  }

  nl_mode({ mode }) {
    if (mode) this.store.setMode(mode);
    const m = this.store.mode();
    return `Mode: ${m}${mode ? ' (saved)' : ''}. Rules: ${rules(m)}`;
  }

  nl_project({ action, name, root, confirm }) {
    const s = this.store;
    if (action === 'list') {
      const act = s.config().activeProject;
      const ps = s.projects();
      if (!ps.length) return 'No projects yet. Create one with action "create".';
      return ps.map((p) => `${p.id === act ? '*' : ' '} ${p.id} — ${p.name}${p.root ? ` (${p.root})` : ''}, ${s.memories(p.id).length} memories`).join('\n');
    }
    if (action === 'create') {
      if (!name) throw new Error('name required');
      if (root) {
        F.guard(this.roots.length ? this.roots : [path.resolve(root)], root);
        const ex = s.findByRoot(root);
        if (ex) {
          s.setConfig({ activeProject: ex.id });
          return `Project for that folder already exists: ${ex.id}. Now active.`;
        }
      }
      const p = s.createProject(name, root);
      s.setConfig({ activeProject: p.id });
      return `Created and activated project ${p.id}${p.root ? ` at ${p.root}` : ''}.`;
    }
    if (action === 'use') {
      const p = s.resolve(name);
      s.setConfig({ activeProject: p.id });
      return `Active project: ${p.id}`;
    }
    if (action === 'info') {
      const p = this.project(name);
      const mem = s.memories(p.id);
      const idx = s.index(p.id);
      const h = s.handoff(p.id);
      return [
        `${p.id} — ${p.name}`,
        `Root: ${p.root || 'none'}`,
        `Memories: ${mem.filter((m) => m.status === 'active').length} active, ${mem.filter((m) => m.status !== 'active').length} stale/done`,
        `Index: ${idx ? `${idx.count} files, built ${idx.built}` : 'not built'}`,
        `Handoff: ${h ? `${h.text.length} chars, updated ${h.updated}` : 'none'}`,
        `Storage: ${s.pdir(p.id)}`,
      ].join('\n');
    }
    if (action === 'delete') {
      const p = s.resolve(name);
      if (!confirm) return `This permanently deletes project ${p.id} and its ${s.memories(p.id).length} memories. Ask the user, then call again with confirm:true.`;
      s.deleteProject(p.id);
      return `Deleted project ${p.id}.`;
    }
    throw new Error('action must be list|use|create|info|delete');
  }

  nl_context({ query, project }) {
    const s = this.store;
    const p = this.project(project);
    const out = [`Project: ${p.id}${p.root ? ` (${p.root})` : ''} | Mode: ${s.mode()} — ${rules(s.mode())}`];
    const h = s.handoff(p.id);
    if (h) out.push(`Handoff (updated ${h.updated.slice(0, 10)}):\n${h.text.trim()}`);
    const mems = query ? s.recall(p.id, { query, limit: 10 }) : [];
    const open = s.memories(p.id).filter((m) => m.status === 'active' && ['task', 'bug'].includes(m.type)).slice(-6);
    const shown = new Set();
    const lines = [];
    for (const m of [...mems, ...open]) if (!shown.has(m.id)) shown.add(m.id) && lines.push(fmtMem(m));
    if (!query) {
      for (const m of s.memories(p.id).filter((m) => m.status === 'active' && ['architecture', 'convention', 'decision'].includes(m.type)).slice(-8))
        if (!shown.has(m.id)) shown.add(m.id) && lines.push(fmtMem(m));
    }
    out.push(lines.length ? `Relevant memories:\n${lines.join('\n')}` : 'No matching memories.');
    const total = s.memories(p.id).length;
    if (total > shown.size) out.push(`(${total - shown.size} other memories not loaded; use nl_memory search.)`);
    const idx = s.index(p.id);
    if (idx) out.push(`Stack: ${idx.stack.join(', ') || 'unknown'}; ${idx.count} files indexed.`);
    s.bump('context_loads');
    return out.join('\n\n');
  }

  nl_memory(a) {
    const s = this.store;
    const p = this.project(a.project);
    switch (a.action) {
      case 'add': {
        const r = s.remember(p.id, { type: a.type || 'note', text: a.text, tags: a.tags || [], files: a.files || [], force: a.force });
        if (r.duplicateOf) return `Not saved: near-duplicate of ${fmtMem(r.duplicateOf)}\nUse action "update" with id ${r.duplicateOf.id}, or force:true.`;
        return `Saved ${fmtMem(r.memory)}`;
      }
      case 'update': {
        if (!a.id) throw new Error('id required');
        return `Updated ${fmtMem(s.updateMemory(p.id, a.id, { text: a.text, type: a.type, status: a.status, tags: a.tags, files: a.files }))}`;
      }
      case 'search': {
        const r = s.recall(p.id, { query: a.query || '', type: a.type, limit: a.limit || 8, includeStale: a.include_stale });
        return r.length ? r.map(fmtMem).join('\n') : 'No matching memories.';
      }
      case 'list': {
        const all = s.memories(p.id).filter((m) => (a.include_stale || m.status !== 'stale') && (!a.type || m.type === a.type));
        const lim = a.limit || 50;
        return all.length ? all.slice(-lim).map(fmtMem).join('\n') + (all.length > lim ? `\n(${all.length - lim} older not shown)` : '') : 'No memories.';
      }
      case 'get': {
        const ids = a.ids || (a.id ? [a.id] : []);
        const r = s.memories(p.id).filter((m) => ids.includes(m.id));
        return r.length ? r.map((m) => fmtMem(m) + `\n  created ${m.created}, updated ${m.updated}` + (m.history ? `\n  previous: ${m.history.map((h) => h.text).join(' | ')}` : '')).join('\n') : 'Not found.';
      }
      case 'stale': {
        const ids = a.ids || (a.id ? [a.id] : []);
        ids.forEach((id) => s.updateMemory(p.id, id, { status: 'stale' }));
        return `Marked stale: ${ids.join(', ')}`;
      }
      case 'forget': {
        const ids = a.ids || (a.id ? [a.id] : []);
        if (!ids.length) throw new Error('ids required');
        return `Deleted ${s.forget(p.id, ids)} memories.`;
      }
    }
    throw new Error('action must be add|update|search|list|get|stale|forget');
  }

  nl_handoff({ text, project }) {
    const p = this.project(project);
    if (text) return `Handoff saved (${this.store.setHandoff(p.id, text)} chars).`;
    const h = this.store.handoff(p.id);
    return h ? `Updated ${h.updated}\n${h.text}` : 'No handoff yet.';
  }

  nl_files({ action, query, project }) {
    const p = this.project(project);
    if (!p.root) throw new Error('Project has no root folder. Create it with a root.');
    F.guard(this.roots, p.root);
    let idx = this.store.index(p.id);
    if (action === 'build' || !idx) {
      idx = F.buildIndex(p.root);
      this.store.saveIndex(p.id, idx);
      this.store.bump('index_builds');
      if (action === 'build') return `Indexed.\n${F.indexSummary(idx)}`;
    }
    if (action === 'summary') return F.indexSummary(idx);
    if (action === 'find') {
      const q = String(query || '').toLowerCase();
      const r = idx.files.filter((f) => f[0].toLowerCase().includes(q)).slice(0, 60);
      return r.length ? r.map((f) => `${f[0]} (${f[1]} B)`).join('\n') : 'No indexed path matches.';
    }
    if (action === 'changed') {
      const d = F.indexDiff(idx);
      const fmt = (k, l) => (l.length ? `${k} (${l.length}): ${l.slice(0, 40).join(', ')}` : '');
      return [fmt('Changed', d.changed), fmt('Added', d.added), fmt('Removed', d.removed)].filter(Boolean).join('\n') || `No changes since ${idx.built}.`;
    }
    throw new Error('action must be build|summary|find|changed');
  }

  nl_read(a) {
    const fp = F.guard(this.roots, a.path, this.base());
    const r = F.smartRead(fp, a, this.readCache);
    this.measure('read', r.sourceBytes, r.outBytes);
    if (r.cached) this.store.bump('read_cache_hits');
    return r.out;
  }

  nl_grep(a) {
    const r = F.grepFiles(this.roots, a.path ? F.guard(this.roots, a.path, this.base()) : this.base(), a.pattern, {
      glob: a.glob,
      maxResults: Math.min(a.max_results || 50, 500),
      context: Math.min(a.context || 0, 10),
    });
    this.measure('grep', r.sourceBytes, r.outBytes);
    return r.out;
  }

  nl_log(a) {
    let text = a.text;
    if (!text) {
      if (!a.path) throw new Error('path or text required');
      const fp = F.guard(this.roots, a.path, this.base());
      const st = fs.statSync(fp);
      if (st.size > 200 * 1024 * 1024) throw new Error('Log over 200 MB; use tail on a smaller copy.');
      text = fs.readFileSync(fp, 'utf8');
    }
    const out = F.triageLog(text, { pattern: a.pattern, warnings: a.warnings, tail: a.tail });
    this.measure('log', Buffer.byteLength(text), Buffer.byteLength(out));
    return out;
  }

  nl_scan({ kind, path: p, project }) {
    if (kind === 'memory') {
      const pr = this.project(project);
      const issues = this.store.audit(pr.id);
      return issues.length
        ? issues.map((i) => `[${i.id}] ${i.issue}`).join('\n') + '\nFix with nl_memory update/stale/forget after checking with the user if unsure.'
        : 'No stale or duplicate memories found.';
    }
    const root = p ? F.guard(this.roots, p, this.base(project)) : F.guard(this.roots, this.base(project));
    this.store.bump('scans');
    if (kind === 'code') return F.scanCode(root);
    if (kind === 'instructions') return F.auditInstructions(root);
    throw new Error('kind must be code|instructions|memory');
  }

  nl_stats({ project }) {
    const s = this.store;
    const st = s.stats();
    const out = [`NeuroLite stats (since ${st.since ? st.since.slice(0, 10) : 'now'})`, `Mode: ${s.mode()}`];
    let p = null;
    try {
      p = this.project(project);
    } catch {}
    if (p) {
      const mem = s.memories(p.id);
      const by = {};
      for (const m of mem) by[m.type] = (by[m.type] || 0) + 1;
      const idx = s.index(p.id);
      out.push(
        `Project: ${p.id}${p.root ? ` (${p.root})` : ''}`,
        `Memory: ${mem.length} items (${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ') || 'empty'}), ${mem.filter((m) => m.status === 'stale').length} stale, ${(s.projectBytes(p.id) / 1024).toFixed(1)} KB on disk`,
        `Files indexed: ${idx ? `${idx.count} (built ${idx.built.slice(0, 16).replace('T', ' ')})` : 'not built'}`
      );
    }
    out.push(`Projects: ${s.projects().length}`);
    const reads = st.read_calls || 0;
    const hits = (st.read_cache_hits || 0) + (st.hook_read_blocked || 0);
    const readAttempts = reads + (st.hook_reads_seen || 0);
    out.push(
      `Read cache: ${hits} unchanged re-reads avoided of ${readAttempts} reads${readAttempts ? ` (${((hits / readAttempts) * 100).toFixed(1)}%)` : ''}` +
        (st.hook_reads_seen ? ` [Claude Code hook: ${st.hook_read_blocked || 0} of ${st.hook_reads_seen}]` : '')
    );
    const scanned = st.bytes_scanned || 0;
    const ret = st.bytes_returned || 0;
    out.push(
      `Operations optimized: ${(st.grep_calls || 0)} searches, ${(st.read_calls || 0)} ranged reads, ${(st.log_calls || 0)} log triages, ${st.context_loads || 0} context loads, ${st.recalls || 0} memory recalls`,
      `Bytes kept out of context (measured, not tokens): scanned ${kb(scanned)}, returned ${kb(ret)}${scanned ? ` (${((1 - ret / scanned) * 100).toFixed(1)}% filtered locally)` : ''}`
    );
    const u = latestSessionUsage(this.cwdRoot || (p && p.root));
    out.push(u ? `Token usage (Claude Code transcript, latest session): ${fmtUsage(u)}` : 'Token usage: not available here (only Claude Code transcripts report it; Desktop Chat exposes no token counts to extensions).');
    const tips = [];
    if (p) {
      if (!s.index(p.id) && p.root) tips.push('Build the file index: nl_files build.');
      if (!s.handoff(p.id)) tips.push('Save a handoff summary (nl_handoff) so the next session starts warm.');
      else if (Date.now() - Date.parse(s.handoff(p.id).updated) > 7 * 864e5) tips.push('Handoff is over 7 days old; refresh it.');
      const issues = s.audit(p.id);
      if (issues.length) tips.push(`${issues.length} memory issues; run nl_scan memory.`);
      if (s.memories(p.id).length > 150) tips.push('Memory is large; mark finished tasks done/stale.');
    }
    if (u && u.context > 120000) tips.push(`Context is ${Math.round(u.context / 1000)}k tokens; consider /compact at a natural break.`);
    if (readAttempts > 20 && hits === 0) tips.push('Prefer nl_read ranges/grep over whole-file reads.');
    out.push(tips.length ? `Suggestions:\n- ${tips.join('\n- ')}` : 'Suggestions: none.');
    return out.join('\n');
  }
}

function kb(n) {
  return n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`;
}

module.exports = { Tools, DEFS };
