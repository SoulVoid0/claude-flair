'use strict';
// Reads real token usage from Claude Code transcripts (~/.claude/projects/<encoded cwd>/*.jsonl).
// This is the only token source NeuroLite reports. Nothing is estimated.

const fs = require('fs');
const os = require('os');
const path = require('path');

function projectsDir(env = process.env) {
  const base = env.CLAUDE_CONFIG_DIR && !env.CLAUDE_CONFIG_DIR.includes('${') ? env.CLAUDE_CONFIG_DIR : path.join(os.homedir(), '.claude');
  return path.join(base, 'projects');
}

function encodeCwd(cwd) {
  return path.resolve(cwd).replace(/[^A-Za-z0-9]/g, '-');
}

/** Sum usage in one transcript, deduped by message id. Also returns the latest context size. */
function transcriptUsage(file) {
  const seen = new Set();
  const u = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, messages: 0, context: 0 };
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  for (const line of text.split('\n')) {
    if (!line.includes('"usage"')) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.isSidechain) continue;
    const m = o.message;
    if (!m || !m.usage) continue;
    const ctx = (m.usage.input_tokens || 0) + (m.usage.cache_read_input_tokens || 0) + (m.usage.cache_creation_input_tokens || 0);
    u.context = ctx; // last assistant message = current context size
    if (m.id && seen.has(m.id)) continue;
    if (m.id) seen.add(m.id);
    u.messages++;
    u.input += m.usage.input_tokens || 0;
    u.output += m.usage.output_tokens || 0;
    u.cacheRead += m.usage.cache_read_input_tokens || 0;
    u.cacheWrite += m.usage.cache_creation_input_tokens || 0;
  }
  return u;
}

/** Latest session's usage for a working directory, or null when no transcript exists. */
function latestSessionUsage(cwd, env) {
  if (!cwd) return null;
  const dir = path.join(projectsDir(env), encodeCwd(cwd));
  let files;
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => [f, fs.statSync(path.join(dir, f)).mtimeMs])
      .sort((a, b) => b[1] - a[1]);
  } catch {
    return null;
  }
  if (!files.length) return null;
  const u = transcriptUsage(path.join(dir, files[0][0]));
  return u && { ...u, session: files[0][0].replace(/\.jsonl$/, ''), sessions: files.length };
}

function fmtUsage(u) {
  const k = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n));
  const totalIn = u.input + u.cacheRead + u.cacheWrite;
  const hit = totalIn ? ((u.cacheRead / totalIn) * 100).toFixed(1) : '0.0';
  return `input ${k(u.input)}, output ${k(u.output)}, cache read ${k(u.cacheRead)}, cache write ${k(u.cacheWrite)} over ${u.messages} responses; prompt-cache hit ${hit}% of input; current context ${k(u.context)} tokens`;
}

module.exports = { transcriptUsage, latestSessionUsage, fmtUsage, encodeCwd, projectsDir };
