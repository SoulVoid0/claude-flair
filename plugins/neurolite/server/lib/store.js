'use strict';
// Local, compact, file-based storage. No network, no dependencies.
//
// <home>/config.json                 { mode, activeProject }
// <home>/stats.json                  global counters
// <home>/projects/<id>/project.json  { id, name, root, created }
// <home>/projects/<id>/memories.json [memory]
// <home>/projects/<id>/handoff.md
// <home>/projects/<id>/index.json    file index
// <home>/sessions/<sid>.json         Claude Code hook state (read cache), pruned after 7 days

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { findSecret } = require('./secrets');
const { NAMES } = require('./modes');

const MEMORY_TYPES = ['architecture', 'decision', 'progress', 'bug', 'task', 'convention', 'note'];

function usable(v) {
  return typeof v === 'string' && v.trim() !== '' && !v.includes('${');
}

/** Data directory: NEUROLITE_HOME, else A:\Claude Workplace\NeuroLite\data on Windows when A: exists, else ~/.neurolite */
function resolveHome(env = process.env, platform = process.platform) {
  if (usable(env.NEUROLITE_HOME)) return path.resolve(env.NEUROLITE_HOME.trim());
  if (platform === 'win32') {
    try {
      if (fs.existsSync('A:\\')) return 'A:\\Claude Workplace\\NeuroLite\\data';
    } catch {}
  }
  return path.join(os.homedir(), '.neurolite');
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file); // atomic replace
}

function slug(s) {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'project'
  );
}

function normRoot(p) {
  if (!p) return null;
  let r = path.resolve(p);
  if (process.platform === 'win32') r = r.toLowerCase();
  return r.replace(/[\\/]+$/, '');
}

function words(s) {
  return String(s)
    .toLowerCase()
    .split(/[^a-z0-9_.]+/)
    .filter((w) => w.length > 2);
}

function jaccard(a, b) {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let i = 0;
  for (const w of A) if (B.has(w)) i++;
  return i / (A.size + B.size - i);
}

class Store {
  constructor(home = resolveHome()) {
    this.home = home;
    fs.mkdirSync(home, { recursive: true });
  }

  // ---------- config / mode ----------
  config() {
    return { mode: 'normal', activeProject: null, ...readJSON(path.join(this.home, 'config.json'), {}) };
  }
  setConfig(patch) {
    const c = { ...this.config(), ...patch };
    writeJSON(path.join(this.home, 'config.json'), c);
    return c;
  }
  mode() {
    return this.config().mode;
  }
  setMode(m) {
    if (!NAMES.includes(m)) throw new Error(`Unknown mode "${m}". Modes: ${NAMES.join(', ')}`);
    this.bump('mode_switches');
    return this.setConfig({ mode: m }).mode;
  }

  // ---------- stats ----------
  stats() {
    return readJSON(path.join(this.home, 'stats.json'), {});
  }
  bump(key, n = 1) {
    const f = path.join(this.home, 'stats.json');
    const s = readJSON(f, {});
    s[key] = (s[key] || 0) + n;
    if (!s.since) s.since = new Date().toISOString();
    writeJSON(f, s);
  }

  // ---------- projects ----------
  pdir(id) {
    return path.join(this.home, 'projects', id);
  }
  projects() {
    const d = path.join(this.home, 'projects');
    if (!fs.existsSync(d)) return [];
    return fs
      .readdirSync(d)
      .map((id) => readJSON(path.join(d, id, 'project.json'), null))
      .filter(Boolean);
  }
  project(id) {
    return id ? readJSON(path.join(this.pdir(id), 'project.json'), null) : null;
  }
  createProject(name, root) {
    let id = slug(name);
    for (let n = 2; fs.existsSync(this.pdir(id)); n++) id = `${slug(name)}-${n}`;
    const p = { id, name: String(name), root: root ? path.resolve(root) : null, created: new Date().toISOString() };
    writeJSON(path.join(this.pdir(id), 'project.json'), p);
    writeJSON(path.join(this.pdir(id), 'memories.json'), []);
    return p;
  }
  findByRoot(root) {
    const r = normRoot(root);
    return this.projects().find((p) => normRoot(p.root) === r) || null;
  }
  /** Project for a working directory; creates one named after the folder if missing. */
  projectForRoot(root, create = true) {
    if (!root) return null;
    return this.findByRoot(root) || (create ? this.createProject(path.basename(path.resolve(root)), root) : null);
  }
  deleteProject(id) {
    if (!this.project(id)) throw new Error(`No project "${id}"`);
    fs.rmSync(this.pdir(id), { recursive: true, force: true });
    if (this.config().activeProject === id) this.setConfig({ activeProject: null });
  }
  /** Resolve the project for a call: explicit id > active project > cwd root. */
  resolve(id, cwdRoot) {
    if (id) {
      const p = this.project(id) || this.projects().find((x) => x.name.toLowerCase() === String(id).toLowerCase());
      if (!p) throw new Error(`No project "${id}". Use nl_project list/create.`);
      return p;
    }
    const a = this.project(this.config().activeProject);
    if (a) return a;
    const c = cwdRoot ? this.projectForRoot(cwdRoot, true) : null;
    if (c) return c;
    throw new Error('No active project. Call nl_project with action "use" or "create" first.');
  }

  // ---------- memories ----------
  memories(pid) {
    return readJSON(path.join(this.pdir(pid), 'memories.json'), []);
  }
  saveMemories(pid, list) {
    writeJSON(path.join(this.pdir(pid), 'memories.json'), list);
  }
  /**
   * Add a memory. Rejects secrets. If a very similar active memory of the same type
   * exists, returns { duplicateOf } instead of saving (unless force).
   */
  remember(pid, { type = 'note', text, tags = [], files = [], force = false }) {
    if (!text || !String(text).trim()) throw new Error('text is required');
    if (!MEMORY_TYPES.includes(type)) throw new Error(`type must be one of ${MEMORY_TYPES.join(', ')}`);
    const blob = [text, ...tags, ...files].join(' ');
    const secret = findSecret(blob);
    if (secret) throw new Error(`Refused: looks like it contains a ${secret}. Secrets are never stored.`);
    const list = this.memories(pid);
    if (!force) {
      const dup = list.find((m) => m.status !== 'stale' && m.type === type && jaccard(m.text, text) >= 0.6);
      if (dup) return { duplicateOf: dup };
    }
    const now = new Date().toISOString();
    const m = {
      id: crypto.randomBytes(3).toString('hex'),
      type,
      text: String(text).trim().slice(0, 2000),
      tags: tags.map(String).slice(0, 10),
      files: files.map(String).slice(0, 10),
      status: 'active',
      created: now,
      updated: now,
    };
    list.push(m);
    this.saveMemories(pid, list);
    this.bump('memories_saved');
    return { memory: m };
  }
  /** Update fields; previous text kept in history (last 3) so updates are reversible. */
  updateMemory(pid, id, patch) {
    const list = this.memories(pid);
    const m = list.find((x) => x.id === id);
    if (!m) throw new Error(`No memory "${id}"`);
    if (patch.text !== undefined || patch.tags || patch.files) {
      const secret = findSecret([patch.text || '', ...(patch.tags || []), ...(patch.files || [])].join(' '));
      if (secret) throw new Error(`Refused: looks like it contains a ${secret}.`);
    }
    if (patch.text !== undefined && patch.text !== m.text) {
      m.history = [{ text: m.text, updated: m.updated }, ...(m.history || [])].slice(0, 3);
      m.text = String(patch.text).trim().slice(0, 2000);
    }
    if (patch.type) {
      if (!MEMORY_TYPES.includes(patch.type)) throw new Error('bad type');
      m.type = patch.type;
    }
    if (patch.status) {
      if (!['active', 'stale', 'done'].includes(patch.status)) throw new Error('status: active|stale|done');
      m.status = patch.status;
    }
    if (patch.tags) m.tags = patch.tags.map(String).slice(0, 10);
    if (patch.files) m.files = patch.files.map(String).slice(0, 10);
    m.updated = new Date().toISOString();
    this.saveMemories(pid, list);
    return m;
  }
  forget(pid, ids) {
    const list = this.memories(pid);
    const keep = list.filter((m) => !ids.includes(m.id));
    this.saveMemories(pid, keep);
    return list.length - keep.length;
  }
  /** Relevance-ranked recall. Only matching memories are returned, never the whole store. */
  recall(pid, { query = '', type, limit = 8, includeStale = false } = {}) {
    const q = words(query);
    const now = Date.now();
    const scored = [];
    for (const m of this.memories(pid)) {
      if (!includeStale && m.status === 'stale') continue;
      if (type && m.type !== type) continue;
      const hay = words([m.text, ...(m.tags || []), ...(m.files || [])].join(' '));
      const set = new Set(hay);
      let s = 0;
      for (const w of q) {
        if (set.has(w)) s += 2;
        else if (hay.some((h) => h.startsWith(w) || w.startsWith(h))) s += 1;
      }
      if (q.length && s === 0) continue;
      const ageDays = (now - Date.parse(m.updated)) / 864e5;
      s += Math.max(0, 1 - ageDays / 90); // mild recency boost
      if (m.status === 'done') s -= 0.5;
      scored.push([s, m]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const out = scored.slice(0, Math.max(1, Math.min(limit, 50))).map((x) => x[1]);
    if (out.length) this.bump('recalls');
    return out;
  }
  /** Flags memories whose files no longer exist, near-duplicates, and very old items. */
  audit(pid) {
    const p = this.project(pid);
    const list = this.memories(pid).filter((m) => m.status !== 'stale');
    const issues = [];
    for (const m of list) {
      if (p && p.root) {
        const missing = (m.files || []).filter((f) => !fs.existsSync(path.resolve(p.root, f)));
        if (missing.length) issues.push({ id: m.id, issue: `references missing file(s): ${missing.join(', ')}` });
      }
      const age = (Date.now() - Date.parse(m.updated)) / 864e5;
      if (age > 60 && ['progress', 'task', 'bug'].includes(m.type) && m.status === 'active')
        issues.push({ id: m.id, issue: `${m.type} not updated in ${Math.round(age)} days` });
    }
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        if (jaccard(list[i].text, list[j].text) >= 0.6)
          issues.push({ id: list[j].id, issue: `near-duplicate of ${list[i].id}` });
    return issues;
  }

  // ---------- handoff ----------
  handoff(pid) {
    const f = path.join(this.pdir(pid), 'handoff.md');
    if (!fs.existsSync(f)) return null;
    return { text: fs.readFileSync(f, 'utf8'), updated: fs.statSync(f).mtime.toISOString() };
  }
  setHandoff(pid, text) {
    const secret = findSecret(text);
    if (secret) throw new Error(`Refused: handoff looks like it contains a ${secret}.`);
    const t = String(text).trim().slice(0, 4000);
    fs.writeFileSync(path.join(this.pdir(pid), 'handoff.md'), t + '\n');
    this.bump('handoffs_saved');
    return t.length;
  }

  // ---------- file index ----------
  index(pid) {
    return readJSON(path.join(this.pdir(pid), 'index.json'), null);
  }
  saveIndex(pid, idx) {
    writeJSON(path.join(this.pdir(pid), 'index.json'), idx);
  }

  // ---------- Claude Code hook session state ----------
  session(sid) {
    return readJSON(path.join(this.home, 'sessions', `${slug(sid)}.json`), { reads: {} });
  }
  saveSession(sid, s) {
    writeJSON(path.join(this.home, 'sessions', `${slug(sid)}.json`), s);
  }
  pruneSessions(maxAgeDays = 7) {
    const d = path.join(this.home, 'sessions');
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      const fp = path.join(d, f);
      try {
        if (Date.now() - fs.statSync(fp).mtimeMs > maxAgeDays * 864e5) fs.unlinkSync(fp);
      } catch {}
    }
  }

  /** Bytes used on disk by a project's files. */
  projectBytes(pid) {
    let n = 0;
    try {
      for (const f of fs.readdirSync(this.pdir(pid))) n += fs.statSync(path.join(this.pdir(pid), f)).size;
    } catch {}
    return n;
  }
}

module.exports = { Store, resolveHome, MEMORY_TYPES, jaccard, slug };
