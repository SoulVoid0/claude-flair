'use strict';
// Detects credentials so they are never written to memory. Conservative: false positives
// only cost a rejected save, false negatives would leak a secret to disk.

const PATTERNS = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['AWS access key', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['Anthropic/OpenAI key', /\bsk-(ant-)?[A-Za-z0-9_\-]{20,}/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_\-]{35}\b/],
  ['Stripe key', /\b[rs]k_(live|test)_[0-9A-Za-z]{16,}/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['connection string with password', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/i],
  [
    'password/secret assignment',
    /\b(pass(word|wd)?|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)\b\s*[:=]\s*["']?[^\s"']{6,}/i,
  ],
];

function entropy(s) {
  const f = {};
  for (const c of s) f[c] = (f[c] || 0) + 1;
  let e = 0;
  for (const k in f) {
    const p = f[k] / s.length;
    e -= p * Math.log2(p);
  }
  return e;
}

/** Returns the kind of secret found, or null. */
function findSecret(text) {
  if (typeof text !== 'string') return null;
  for (const [kind, re] of PATTERNS) if (re.test(text)) return kind;
  // Long random-looking tokens (hex/base64) with mixed classes and high entropy.
  for (const tok of text.match(/[A-Za-z0-9+/_\-]{32,}={0,2}/g) || []) {
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/].filter((r) => r.test(tok)).length;
    if (classes >= 3 && entropy(tok) > 4.2 && !/^[a-z]+(-[a-z]+)+$/i.test(tok)) {
      return 'high-entropy token';
    }
  }
  return null;
}

module.exports = { findSecret };
