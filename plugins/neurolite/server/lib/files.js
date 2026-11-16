'use strict';
// Local file operations that return only what is relevant: ranged reads, targeted search,
// log triage, project indexing and code-health scans. Read-only: nothing here writes to
// user files.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', '.next', '.nuxt', '.cache', 'coverage',
  '__pycache__', '.venv', 'venv', 'env', '.mypy_cache', '.pytest_cache', 'target', '.idea',
  '.vscode', 'Library', 'Temp', 'Obj', '.godot', '.import', 'vendor', '.turbo', '.parcel-cache',
]);

const LANG = {
  '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.jsx': 'JavaScript',
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.mts': 'TypeScript', '.cts': 'TypeScript',
  '.py': 'Python', '.html': 'HTML', '.htm': 'HTML', '.css': 'CSS', '.scss': 'CSS', '.sass': 'CSS',
  '.less': 'CSS', '.json': 'JSON', '.md': 'Markdown', '.cs': 'C#', '.gd': 'GDScript',
  '.lua': 'Lua', '.java': 'Java', '.kt': 'Kotlin', '.go': 'Go', '.rs': 'Rust', '.c': 'C',
  '.h': 'C/C++', '.cpp': 'C++', '.hpp': 'C++', '.sh': 'Shell', '.ps1': 'PowerShell',
  '.glsl': 'GLSL', '.hlsl': 'HLSL', '.shader': 'Shader', '.vue': 'Vue', '.svelte': 'Svelte',
  '.yml': 'YAML', '.yaml': 'YAML', '.toml': 'TOML',
};
const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.py', '.cs', '.gd', '.lua', '.java', '.kt', '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.vue', '.svelte', '.html', '.css', '.scss']);

// ---------- path guard ----------

/** Allowed roots from args/env. Returns absolute paths. */
function parseRoots(list) {
  const sep = process.platform === 'win32' ? /;/ : /[;:]/;
  return (list || [])
    .flatMap((r) => String(r).split(sep))
    .map((r) => r.trim())
    .filter((r) => r && !r.includes('${'))
    .map((r) => path.resolve(r));
}

function within(root, p) {
  const rel = path.relative(root, p);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Resolve p against base and ensure it is inside an allowed root (symlinks resolved). */
function guard(roots, p, base) {
  if (!roots.length) throw new Error('No folders are allowed. Set allowed folders in the NeuroLite extension settings.');
  const abs = path.resolve(base || roots[0], p || '.');
  let real = abs;
  try {
    real = fs.realpathSync(abs);
  } catch {}
  const ok = roots.some((r) => {
    let rr = r;
    try {
      rr = fs.realpathSync(r);
    } catch {}
    return within(rr, real) || within(r, abs);
  });
  if (!ok) throw new Error(`Path outside allowed folders: ${abs}`);
  return abs;
}

// ---------- walking ----------

function* walk(dir, { maxFiles = 20000, filter } = {}) {
  const stack = [dir];
  let n = 0;
  while (stack.length) {
    const d = stack.pop();
    let ents;
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) stack.push(fp);
      } else if (e.isFile()) {
        if (filter && !filter(fp)) continue;
        yield fp;
        if (++n >= maxFiles) return;
      }
    }
  }
}

function globFilter(glob) {
  if (!glob) return null;
  const parts = String(glob).split(',').map((g) => g.trim()).filter(Boolean);
  const res = parts.map(
    (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/\\\\]*').replace(/\u0000/g, '.*').replace(/\?/g, '.') + '$', 'i')
  );
  return (fp) => res.some((r) => r.test(path.basename(fp)) || r.test(fp.replace(/\\/g, '/')));
}

function isBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function readText(fp, maxBytes = 5 * 1024 * 1024) {
  const st = fs.statSync(fp);
  if (st.size > maxBytes) throw new Error(`File is ${st.size} bytes; over the ${maxBytes}-byte limit. Use nl_grep or a line range.`);
  const buf = fs.readFileSync(fp);
  if (isBinary(buf)) throw new Error('Binary file; not shown.');
  return { text: buf.toString('utf8'), st, hash: crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12) };
}

function numbered(lines, start) {
  const w = String(start + lines.length).length;
  return lines.map((l, i) => `${String(start + i).padStart(w)}| ${l}`).join('\n');
}

// ---------- read ----------

/**
 * Ranged / filtered read. cache: Map(path -> {hash, ranges:Set, at}) for unchanged detection.
 * Returns { out, sourceBytes, outBytes, cached }.
 */
function smartRead(fp, { start, end, grep, context = 2, maxLines = 400, force = false } = {}, cache) {
  const { text, st, hash } = readText(fp);
  const lines = text.split(/\r?\n/);
  const key = `${start || 1}-${end || ''}-${grep || ''}`;
  const prev = cache && cache.get(fp);
  if (!force && prev && prev.hash === hash && prev.ranges.has(key)) {
    const mins = Math.round((Date.now() - prev.at) / 60000);
    return {
      out: `[unchanged since you read it ${mins} min ago (sha ${hash}). If that content is not in your current context, call again with force:true.]`,
      sourceBytes: st.size,
      outBytes: 0,
      cached: true,
    };
  }
  let out;
  if (grep) {
    let re;
    try {
      re = new RegExp(grep, 'i');
    } catch (e) {
      throw new Error(`Bad regex: ${e.message}`);
    }
    const keep = new Set();
    lines.forEach((l, i) => {
      if (re.test(l)) for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep.add(k);
    });
    const idx = [...keep].sort((a, b) => a - b).slice(0, maxLines);
    const chunks = [];
    let prevI = -2;
    for (const i of idx) {
      if (i !== prevI + 1 && chunks.length) chunks.push('…');
      chunks.push(`${i + 1}| ${lines[i]}`);
      prevI = i;
    }
    out = chunks.length ? chunks.join('\n') : `[no lines match /${grep}/ in ${lines.length} lines]`;
  } else {
    const s = Math.max(1, start || 1);
    const e = Math.min(lines.length, end || s + maxLines - 1);
    out = numbered(lines.slice(s - 1, e), s);
    if (e < lines.length && !end) out += `\n[… ${lines.length - e} more lines; file has ${lines.length}. Use start/end.]`;
  }
  if (cache) {
    const entry = prev && prev.hash === hash ? prev : { hash, ranges: new Set() };
    entry.ranges.add(key);
    entry.at = Date.now();
    cache.set(fp, entry);
  }
  return { out, sourceBytes: st.size, outBytes: Buffer.byteLength(out), cached: false };
}

// ---------- grep ----------

function grepFiles(roots, dir, pattern, { glob, maxResults = 50, context = 0, maxFiles = 20000 } = {}) {
  let re;
  try {
    re = new RegExp(pattern, 'i');
  } catch (e) {
    throw new Error(`Bad regex: ${e.message}`);
  }
  const base = guard(roots, dir || '.');
  const files = fs.statSync(base).isFile() ? [base] : walk(base, { maxFiles, filter: globFilter(glob) });
  const hits = [];
  let scanned = 0;
  let filesScanned = 0;
  outer: for (const fp of files) {
    let buf;
    try {
      const st = fs.statSync(fp);
      if (st.size > 2 * 1024 * 1024) continue;
      buf = fs.readFileSync(fp);
    } catch {
      continue;
    }
    if (isBinary(buf)) continue;
    scanned += buf.length;
    filesScanned++;
    const lines = buf.toString('utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      const rel = path.relative(base, fp) || path.basename(fp);
      if (context > 0) {
        const s = Math.max(0, i - context);
        const e = Math.min(lines.length - 1, i + context);
        hits.push(`${rel}:${i + 1}\n` + numbered(lines.slice(s, e + 1).map((l) => l.slice(0, 300)), s + 1));
      } else hits.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 300)}`);
      if (hits.length >= maxResults) break outer;
    }
  }
  const out = hits.length
    ? hits.join('\n') + (hits.length >= maxResults ? `\n[stopped at ${maxResults} results; narrow the pattern or glob]` : '')
    : `[no matches in ${filesScanned} files]`;
  return { out, sourceBytes: scanned, outBytes: Buffer.byteLength(out), filesScanned };
}

// ---------- log triage ----------

const DEFAULT_LOG_RE = /\b(error|err!|exception|fail(ed|ure)?|fatal|panic|traceback|critical|uncaught|unhandled|denied|refused|timeout|cannot|could not|undefined is not|segfault)\b|^\s*E\s/i;
const WARN_RE = /\bwarn(ing)?\b/i;

function normalizeLine(l) {
  return l
    .replace(/\d{4}-\d{2}-\d{2}[T ][\d:.,]+Z?([+-]\d{2}:?\d{2})?/g, '<ts>')
    .replace(/\b\d{1,2}:\d{2}:\d{2}(\.\d+)?\b/g, '<time>')
    .replace(/0x[0-9a-f]+/gi, '<hex>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27}\b/gi, '<uuid>')
    .replace(/\d+/g, '<n>')
    .trim();
}

/** Returns unique error (and optionally warning) lines with counts, first line number and a short trace. */
function triageLog(text, { pattern, warnings = false, maxGroups = 30, traceLines = 6, tail } = {}) {
  let lines = text.split(/\r?\n/);
  let offset = 0;
  if (tail && lines.length > tail) {
    offset = lines.length - tail;
    lines = lines.slice(offset);
  }
  let re = DEFAULT_LOG_RE;
  if (pattern) {
    try {
      re = new RegExp(pattern, 'i');
    } catch (e) {
      throw new Error(`Bad regex: ${e.message}`);
    }
  }
  const groups = new Map();
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const isErr = re.test(l);
    if (!isErr && !(warnings && WARN_RE.test(l))) continue;
    const key = normalizeLine(l).slice(0, 240);
    let g = groups.get(key);
    if (!g) {
      const trace = [];
      for (let k = i + 1; k < lines.length && trace.length < traceLines; k++) {
        if (/^\s+(at |File "|\.\.\.|\^|~)|^\s{2,}\S|^Caused by|^\s*-->/.test(lines[k])) trace.push(lines[k].slice(0, 300));
        else break;
      }
      g = { line: i + 1 + offset, text: l.slice(0, 400), count: 0, level: isErr ? 'E' : 'W', trace };
      groups.set(key, g);
    }
    g.count++;
  }
  const all = [...groups.values()];
  const shown = all.sort((a, b) => (a.level === b.level ? a.line - b.line : a.level === 'E' ? -1 : 1)).slice(0, maxGroups);
  const total = all.reduce((n, g) => n + g.count, 0);
  if (!shown.length) return `[no matching lines in ${lines.length} lines]`;
  const head = `${total} matching lines in ${lines.length + offset} total, ${all.length} unique${all.length > shown.length ? `, showing ${shown.length}` : ''}:`;
  const body = shown
    .map((g) => `${g.level} L${g.line}${g.count > 1 ? ` ×${g.count}` : ''}: ${g.text.trim()}` + (g.trace.length ? '\n' + g.trace.join('\n') : ''))
    .join('\n');
  return `${head}\n${body}`;
}

// ---------- project index ----------

const FRAMEWORKS = {
  react: 'React', 'react-dom': 'React', next: 'Next.js', vue: 'Vue', nuxt: 'Nuxt', svelte: 'Svelte',
  '@sveltejs/kit': 'SvelteKit', '@angular/core': 'Angular', express: 'Express', fastify: 'Fastify',
  koa: 'Koa', '@nestjs/core': 'NestJS', electron: 'Electron', vite: 'Vite', webpack: 'webpack',
  typescript: 'TypeScript', jest: 'Jest', vitest: 'Vitest', mocha: 'Mocha', '@playwright/test': 'Playwright',
  phaser: 'Phaser', three: 'Three.js', pixi: 'PixiJS', 'pixi.js': 'PixiJS', 'babylonjs': 'Babylon.js',
  '@babylonjs/core': 'Babylon.js', kaboom: 'Kaboom', kaplay: 'KAPLAY', 'matter-js': 'Matter.js',
  'socket.io': 'Socket.IO', tailwindcss: 'Tailwind', prisma: 'Prisma', mongoose: 'Mongoose',
  'discord.js': 'discord.js', '@modelcontextprotocol/sdk': 'MCP SDK', '@anthropic-ai/sdk': 'Anthropic SDK',
};
const PY_FRAMEWORKS = {
  django: 'Django', flask: 'Flask', fastapi: 'FastAPI', pygame: 'Pygame', arcade: 'Arcade',
  pytest: 'pytest', numpy: 'NumPy', pandas: 'pandas', torch: 'PyTorch', tensorflow: 'TensorFlow',
  anthropic: 'Anthropic SDK', mcp: 'MCP SDK', panda3d: 'Panda3D', ursina: 'Ursina',
};
const KEY_FILES = /^(package\.json|tsconfig.*\.json|vite\.config\.\w+|webpack\.config\.\w+|next\.config\.\w+|pyproject\.toml|requirements.*\.txt|setup\.py|Cargo\.toml|go\.mod|project\.godot|index\.(html|js|ts)|main\.(js|ts|py|gd|cs)|app\.(js|ts|py)|server\.(js|ts)|README\.md|CLAUDE\.md|AGENTS\.md|Dockerfile|\.env\.example)$/i;

function readPkgDeps(file) {
  try {
    const p = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { deps: Object.keys(p.dependencies || {}), dev: Object.keys(p.devDependencies || {}), pkg: p };
  } catch {
    return null;
  }
}

function readPyDeps(root) {
  const out = new Set();
  for (const f of ['requirements.txt', 'requirements-dev.txt']) {
    try {
      for (const l of fs.readFileSync(path.join(root, f), 'utf8').split(/\r?\n/)) {
        const m = l.trim().match(/^([A-Za-z0-9_.\-]+)/);
        if (m && !l.trim().startsWith('#') && !l.trim().startsWith('-')) out.add(m[1].toLowerCase());
      }
    } catch {}
  }
  try {
    const t = fs.readFileSync(path.join(root, 'pyproject.toml'), 'utf8');
    const block = t.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (block) for (const m of block[1].matchAll(/["']([A-Za-z0-9_.\-]+)/g)) out.add(m[1].toLowerCase());
  } catch {}
  return [...out];
}

function detectStack(root) {
  const fw = new Set();
  const pkg = readPkgDeps(path.join(root, 'package.json'));
  if (pkg) {
    fw.add('Node.js');
    for (const d of [...pkg.deps, ...pkg.dev]) if (FRAMEWORKS[d]) fw.add(FRAMEWORKS[d]);
  }
  for (const d of readPyDeps(root)) if (PY_FRAMEWORKS[d]) fw.add(PY_FRAMEWORKS[d]);
  const exists = (f) => fs.existsSync(path.join(root, f));
  if (exists('project.godot')) fw.add('Godot');
  if (exists('ProjectSettings/ProjectVersion.txt')) fw.add('Unity');
  if (exists('Cargo.toml')) fw.add('Rust/Cargo');
  if (exists('go.mod')) fw.add('Go modules');
  if (exists('Dockerfile')) fw.add('Docker');
  return [...fw];
}

function buildIndex(root, { maxFiles = 20000 } = {}) {
  const files = [];
  const langs = {};
  const dirs = {};
  let bytes = 0;
  for (const fp of walk(root, { maxFiles })) {
    let st;
    try {
      st = fs.statSync(fp);
    } catch {
      continue;
    }
    const rel = path.relative(root, fp).replace(/\\/g, '/');
    const ext = path.extname(fp).toLowerCase();
    const lang = LANG[ext] || null;
    if (lang) langs[lang] = (langs[lang] || 0) + 1;
    const top = rel.includes('/') ? rel.split('/')[0] + '/' : '.';
    dirs[top] = (dirs[top] || 0) + 1;
    bytes += st.size;
    files.push([rel, st.size, Math.round(st.mtimeMs), lang]);
  }
  return {
    root,
    built: new Date().toISOString(),
    count: files.length,
    bytes,
    truncated: files.length >= maxFiles,
    langs,
    dirs,
    stack: detectStack(root),
    key: files.filter((f) => KEY_FILES.test(path.basename(f[0])) && f[0].split('/').length <= 3).map((f) => f[0]).slice(0, 40),
    files,
  };
}

function indexSummary(idx) {
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(', ');
  return [
    `Root: ${idx.root}`,
    `Files: ${idx.count}${idx.truncated ? '+ (truncated)' : ''}, ${(idx.bytes / 1024).toFixed(0)} KB, built ${idx.built}`,
    `Stack: ${idx.stack.join(', ') || 'unknown'}`,
    `Languages: ${top(idx.langs, 8) || 'none'}`,
    `Top dirs: ${top(idx.dirs, 10)}`,
    `Key files: ${idx.key.join(', ') || 'none'}`,
  ].join('\n');
}

/** Files changed on disk since the index was built (by mtime/size), plus added/removed. */
function indexDiff(idx) {
  const known = new Map(idx.files.map((f) => [f[0], f]));
  const changed = [];
  const added = [];
  const seen = new Set();
  for (const fp of walk(idx.root, { maxFiles: 20000 })) {
    const rel = path.relative(idx.root, fp).replace(/\\/g, '/');
    seen.add(rel);
    const k = known.get(rel);
    let st;
    try {
      st = fs.statSync(fp);
    } catch {
      continue;
    }
    if (!k) added.push(rel);
    else if (k[1] !== st.size || k[2] !== Math.round(st.mtimeMs)) changed.push(rel);
  }
  const removed = idx.files.map((f) => f[0]).filter((f) => !seen.has(f));
  return { changed, added, removed };
}

// ---------- code-health scan ----------

const NODE_BUILTINS = new Set(require('module').builtinModules);

function scanCode(root, { maxFiles = 5000, dupWindow = 6 } = {}) {
  const report = [];
  const code = [...walk(root, { maxFiles, filter: (f) => CODE_EXT.has(path.extname(f).toLowerCase()) })];

  // 1) Unused JS dependencies: declared in package.json, never imported/required/referenced.
  const pkg = readPkgDeps(path.join(root, 'package.json'));
  if (pkg) {
    const used = new Set();
    const importRe = /(?:require\(\s*|import\s*\(\s*|from\s+|import\s+)['"]([^'"./][^'"]*)['"]/g;
    for (const fp of code) {
      if (!/\.(m|c)?[jt]sx?$|\.vue$|\.svelte$/.test(fp)) continue;
      let t;
      try {
        t = fs.readFileSync(fp, 'utf8');
      } catch {
        continue;
      }
      for (const m of t.matchAll(importRe)) {
        const spec = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
        used.add(spec.replace(/^node:/, ''));
      }
    }
    // Config files and npm scripts often reference tooling without importing it.
    const scripts = JSON.stringify(pkg.pkg.scripts || {});
    let configText = '';
    try {
      for (const f of fs.readdirSync(root)) if (/config|rc(\.|$)|^\./.test(f) && fs.statSync(path.join(root, f)).isFile()) configText += fs.readFileSync(path.join(root, f), 'utf8').slice(0, 20000);
    } catch {}
    const unused = pkg.deps.filter((d) => !used.has(d) && !scripts.includes(d) && !configText.includes(d) && !d.startsWith('@types/'));
    const devUnused = pkg.dev.filter((d) => !used.has(d) && !scripts.includes(d) && !configText.includes(d) && !d.startsWith('@types/') && !/eslint|prettier|typescript|ts-node|tsx|nodemon|husky|lint-staged/.test(d));
    if (unused.length) report.push(`Possibly unused dependencies (not imported anywhere): ${unused.join(', ')}`);
    if (devUnused.length) report.push(`Possibly unused devDependencies: ${devUnused.join(', ')}`);
    const builtinsAsDeps = pkg.deps.filter((d) => NODE_BUILTINS.has(d));
    if (builtinsAsDeps.length) report.push(`Dependencies that shadow Node built-ins: ${builtinsAsDeps.join(', ')}`);
  }

  // 2) Unused Python requirements (heuristic: import name usually equals package name).
  const pyDeps = readPyDeps(root);
  if (pyDeps.length) {
    const imported = new Set();
    for (const fp of code) {
      if (!fp.endsWith('.py')) continue;
      let t;
      try {
        t = fs.readFileSync(fp, 'utf8');
      } catch {
        continue;
      }
      for (const m of t.matchAll(/^\s*(?:from|import)\s+([A-Za-z0-9_]+)/gm)) imported.add(m[1].toLowerCase());
    }
    const alias = { 'beautifulsoup4': 'bs4', 'pillow': 'pil', 'pyyaml': 'yaml', 'scikit-learn': 'sklearn', 'opencv-python': 'cv2', 'python-dotenv': 'dotenv' };
    const tools = /^(pytest|black|ruff|flake8|mypy|pylint|isort|coverage|pre-commit|setuptools|wheel|pip)/;
    const unusedPy = pyDeps.filter((d) => !imported.has((alias[d] || d).replace(/-/g, '_')) && !tools.test(d));
    if (unusedPy.length) report.push(`Possibly unused Python requirements (heuristic): ${unusedPy.join(', ')}`);
  }

  // 3) Duplicated code: identical normalized windows of N non-trivial lines across/within files.
  const seen = new Map();
  const dups = [];
  const dupSeen = new Set();
  for (const fp of code) {
    let t;
    try {
      const st = fs.statSync(fp);
      if (st.size > 512 * 1024) continue;
      t = fs.readFileSync(fp, 'utf8');
    } catch {
      continue;
    }
    if (/\.min\.|\.lock$|-lock\.json$/.test(fp)) continue;
    const rel = path.relative(root, fp).replace(/\\/g, '/');
    const lines = t.split(/\r?\n/).map((l, i) => [l.trim().replace(/\s+/g, ' '), i + 1]).filter(([l]) => l.length > 3 && !/^(\/\/|#|\*|\/\*|[{}()[\];,]+$|import |from |export \{|<\/?\w+>$)/.test(l));
    for (let i = 0; i + dupWindow <= lines.length; i++) {
      const win = lines.slice(i, i + dupWindow);
      const h = crypto.createHash('sha1').update(win.map((x) => x[0]).join('\n')).digest('hex');
      const here = `${rel}:${win[0][1]}`;
      const first = seen.get(h);
      if (!first) seen.set(h, here);
      else if (first.split(':')[0] !== rel || Math.abs(+first.split(':').pop() - win[0][1]) > dupWindow) {
        const k = `${first.split(':')[0]}|${rel}`;
        if (!dupSeen.has(k)) {
          dupSeen.add(k);
          dups.push(`${first} ≈ ${here}`);
        }
      }
    }
  }
  if (dups.length) report.push(`Duplicated blocks (${dupWindow}+ identical lines), first ${Math.min(dups.length, 15)} of ${dups.length}:\n  ` + dups.slice(0, 15).join('\n  '));

  // 4) Very large source files (candidates for splitting / targeted reads).
  const big = code
    .map((fp) => {
      try {
        return [path.relative(root, fp).replace(/\\/g, '/'), fs.statSync(fp).size];
      } catch {
        return null;
      }
    })
    .filter((x) => x && x[1] > 100 * 1024 && !/\.min\./.test(x[0]))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (big.length) report.push(`Large source files (read by range or grep): ${big.map(([f, s]) => `${f} ${(s / 1024).toFixed(0)}KB`).join(', ')}`);

  return `Scanned ${code.length} source files.\n` + (report.length ? report.join('\n') : 'No issues found by the heuristics.');
}

// ---------- instruction-file audit ----------

const INSTRUCTION_FILES = ['CLAUDE.md', 'CLAUDE.local.md', '.claude/CLAUDE.md', 'AGENTS.md', '.cursorrules', '.github/copilot-instructions.md'];

function auditInstructions(root) {
  const found = INSTRUCTION_FILES.map((f) => path.join(root, f)).filter((f) => fs.existsSync(f));
  if (!found.length) return 'No instruction files (CLAUDE.md, AGENTS.md, …) found.';
  const out = [];
  const lineMap = new Map();
  for (const f of found) {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    const t = fs.readFileSync(f, 'utf8');
    out.push(`${rel}: ${t.length} chars, ${t.split(/\r?\n/).length} lines`);
    t.split(/\r?\n/).forEach((l, i) => {
      const k = l.trim().toLowerCase().replace(/\s+/g, ' ');
      if (k.length < 25 || /^#|^```|^[-*|]\s*$/.test(k)) return;
      if (!lineMap.has(k)) lineMap.set(k, []);
      lineMap.get(k).push(`${rel}:${i + 1}`);
    });
    // Backticked paths that no longer exist → outdated instructions.
    const missing = new Set();
    for (const m of t.matchAll(/`([\w./\\-]+\/[\w./\\-]+|[\w-]+\.(?:js|ts|py|json|md|tsx|jsx|css|html|gd|cs))`/g)) {
      const p = m[1];
      if (/^https?:|^\w+:\/\//.test(p) || p.includes('*') || p.startsWith('~')) continue;
      if (!fs.existsSync(path.resolve(root, p))) missing.add(p);
    }
    if (missing.size) out.push(`  references missing paths: ${[...missing].slice(0, 15).join(', ')}`);
  }
  const dups = [...lineMap.entries()].filter(([, v]) => v.length > 1);
  if (dups.length) out.push(`Duplicated instruction lines (${dups.length}):\n  ` + dups.slice(0, 15).map(([k, v]) => `"${k.slice(0, 80)}" at ${v.join(', ')}`).join('\n  '));
  return out.join('\n');
}

module.exports = {
  parseRoots, guard, walk, smartRead, grepFiles, triageLog, buildIndex, indexSummary, indexDiff,
  scanCode, auditInstructions, detectStack, readText, LANG,
};
