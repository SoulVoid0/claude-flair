import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

type E = EngineInterface

import type { ThemeId, TokenTotals } from '../types'

// ── Themes ────────────────────────────────────────────────────────────────
// Original styling only: colours, screentone, speed lines and the "menacing"
// katakana. No official artwork is bundled or fetched.

type Palette = {
  label: string
  tagline: string
  bg: string
  panel: string
  accent: string
  accent2: string
  text: string
  sfx: string
}

const THEMES: Record<Exclude<ThemeId, 'off'>, Palette> = {
  menacing: {
    label: 'Menacing',
    tagline: 'Purple and gold, maximum menace',
    bg: '#14081f',
    panel: '#23103a',
    accent: '#f5c518',
    accent2: '#c13cff',
    text: '#f3e9ff',
    sfx: 'ゴ',
  },
  diamond: {
    label: 'Diamond Heart',
    tagline: 'Pink and teal, unbreakable',
    bg: '#1f0a1c',
    panel: '#33112e',
    accent: '#ff6fb5',
    accent2: '#3fe0c5',
    text: '#ffeef8',
    sfx: 'ド',
  },
  golden: {
    label: 'Golden Breeze',
    tagline: 'Gold and orange, a dream to chase',
    bg: '#160f03',
    panel: '#2a1d06',
    accent: '#ffd700',
    accent2: '#ff8c1a',
    text: '#fff6dc',
    sfx: 'ゴ',
  },
}

const THEME_IDS: ThemeId[] = ['menacing', 'diamond', 'golden', 'off']
const isThemeId = (v: unknown): v is ThemeId =>
  typeof v === 'string' && (THEME_IDS as string[]).includes(v)
const themeLabel = (id: ThemeId) => (id === 'off' ? 'Off' : THEMES[id].label)

// ── State ─────────────────────────────────────────────────────────────────

const theme = atom({ plugin: 'flair', key: 'theme' } as const, 'menacing' as ThemeId, {
  shape: 'theme-1',
})
const totals = atom({ plugin: 'flair', key: 'totals' } as const, null as TokenTotals | null, {
  shape: 'totals-1',
})
const isScanning = atom({ plugin: 'flair', key: 'isScanning' } as const, false)

const PANE = 'flair-tokens'
const FILES_KEY = 'files-v1'

// ── Formatting ────────────────────────────────────────────────────────────

const full = (n: number) => Math.round(n).toLocaleString('en-US')
const compact = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(Math.round(n))
}
const sum = (t: TokenTotals) => t.input + t.output + t.cacheRead + t.cacheWrite
const bar = (pct: number, width = 16) => {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ── SVG art (generated, original) ─────────────────────────────────────────

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

function backdropSvg(p: Palette): string {
  const W = 1600
  const H = 1000
  const cx = W * 0.72
  const cy = H * 0.38
  const r = rng(7)
  const rays: string[] = []
  for (let i = 0; i < 48; i++) {
    const a0 = (i / 48) * Math.PI * 2
    const a1 = a0 + (Math.PI * 2) / 48 / 2.4
    const L = 2200
    const x0 = cx + Math.cos(a0) * L
    const y0 = cy + Math.sin(a0) * L
    const x1 = cx + Math.cos(a1) * L
    const y1 = cy + Math.sin(a1) * L
    rays.push(
      `<polygon points="${cx},${cy} ${x0.toFixed(0)},${y0.toFixed(0)} ${x1.toFixed(0)},${y1.toFixed(0)}" fill="${p.accent2}" opacity="${(0.05 + r() * 0.07).toFixed(3)}"/>`,
    )
  }
  const sfx: string[] = []
  const spots = [
    [120, 200, 150, -12], [300, 330, 110, -8], [180, 470, 130, -16],
    [1330, 640, 160, 10], [1480, 790, 120, 14], [1250, 860, 100, 6],
    [760, 120, 90, -4], [900, 930, 80, 8],
  ]
  spots.forEach(([x, y, size, rot], i) => {
    const delay = (i * 0.35).toFixed(2)
    sfx.push(
      `<text x="${x}" y="${y}" font-size="${size}" transform="rotate(${rot} ${x} ${y}) skewX(-14)" ` +
        `fill="${p.accent2}" stroke="${p.accent}" stroke-width="5" paint-order="stroke" ` +
        `font-family="'Hiragino Kaku Gothic StdN','Yu Gothic','Noto Sans JP','Noto Sans CJK JP',sans-serif" font-weight="900" opacity="0.5">` +
        `${xml(p.sfx)}<animate attributeName="opacity" values="0.25;0.7;0.25" dur="2.8s" begin="${delay}s" repeatCount="indefinite"/>` +
        `<animateTransform attributeName="transform" type="translate" additive="sum" values="0 0;4 -3;-3 2;0 0" dur="0.9s" begin="${delay}s" repeatCount="indefinite"/></text>`,
    )
  })
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
    `<defs>` +
    `<radialGradient id="g" cx="72%" cy="38%" r="85%"><stop offset="0" stop-color="${p.panel}"/><stop offset="1" stop-color="${p.bg}"/></radialGradient>` +
    `<pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="2.2" fill="${p.accent}" opacity="0.10"/></pattern>` +
    `<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<mask id="m"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>` +
    `</defs>` +
    `<rect width="${W}" height="${H}" fill="url(#g)"/>` +
    rays.join('') +
    `<rect width="${W}" height="${H}" fill="url(#dots)" mask="url(#m)"/>` +
    `<path d="M0 ${H - 90} L${W} ${H - 230} L${W} ${H} L0 ${H} Z" fill="${p.accent}" opacity="0.07"/>` +
    sfx.join('') +
    `</svg>`
  )
}

function bannerSvg(p: Palette, title: string): string {
  const s = xml(p.sfx)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 64" width="360" height="64">` +
    `<rect width="360" height="64" rx="8" fill="${p.panel}"/>` +
    `<path d="M0 64 L60 0 L120 0 L60 64Z" fill="${p.accent2}" opacity="0.25"/>` +
    `<path d="M300 64 L360 0 L360 64Z" fill="${p.accent}" opacity="0.2"/>` +
    `<text x="16" y="46" font-size="38" font-weight="900" font-family="'Noto Sans JP',sans-serif" fill="${p.accent2}" stroke="${p.accent}" stroke-width="2" paint-order="stroke" transform="skewX(-12)">${s}${s}${s}</text>` +
    `<text x="140" y="42" font-size="24" font-weight="900" font-style="italic" font-family="Impact,'Arial Black',sans-serif" letter-spacing="1" fill="${p.accent}" stroke="#000" stroke-width="3" paint-order="stroke">${xml(title)}</text>` +
    `</svg>`
  )
}

// ── Token scanning ────────────────────────────────────────────────────────

type FileSum = {
  m: number
  s: number
  i: number
  o: number
  cr: number
  cw: number
  n: number
  days: Record<string, number>
}
type FileCache = Record<string, FileSum>

type Usage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

function newSum(m: number, s: number): FileSum {
  return { m, s, i: 0, o: 0, cr: 0, cw: 0, n: 0, days: {} }
}

function lineInto(line: string, acc: FileSum, seen: Set<string>) {
  if (!line.includes('"usage"') || !line.includes('"assistant"')) return
  let row: {
    type?: string
    uuid?: string
    timestamp?: string
    requestId?: string
    message?: { id?: string; usage?: Usage }
  }
  try {
    row = JSON.parse(line)
  } catch {
    return
  }
  const u = row.message?.usage
  if (row.type !== 'assistant' || !u) return
  // One API response is written as several rows (one per content block),
  // each carrying the same usage: count it once.
  const id = row.message?.id ?? row.requestId ?? row.uuid ?? line.slice(0, 80)
  if (seen.has(id)) return
  seen.add(id)
  const i = u.input_tokens ?? 0
  const o = u.output_tokens ?? 0
  const cr = u.cache_read_input_tokens ?? 0
  const cw = u.cache_creation_input_tokens ?? 0
  acc.i += i
  acc.o += o
  acc.cr += cr
  acc.cw += cw
  acc.n += 1
  const day = (row.timestamp ?? '').slice(0, 10)
  if (day) acc.days[day] = (acc.days[day] ?? 0) + i + o + cr + cw
}

let scanning = false
let again = false


async function configDir($: E): Promise<string> {
  const explicit = await $.env.get('CLAUDE_CONFIG_DIR')
  if (explicit) return explicit
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? '~'
  return `${home.replace(/[\\/]$/, '')}/.claude`
}

async function collect($: E, dir: string, depth: number, out: { path: string; m: number; s: number }[]) {
  let entries: { name: string; kind: string; size: number; mtimeMs: number }[]
  try {
    entries = await $.fs.list(dir)
  } catch {
    return
  }
  for (const ent of entries) {
    const path = `${dir}/${ent.name}`
    if (ent.kind === 'dir' && depth > 0) await collect($, path, depth - 1, out)
    else if (ent.kind === 'file' && ent.name.endsWith('.jsonl')) {
      out.push({ path, m: ent.mtimeMs, s: ent.size })
    }
  }
}

async function sumFile($: E, path: string, m: number, s: number): Promise<FileSum | null> {
  const acc = newSum(m, s)
  const seen = new Set<string>()
  if (s <= 4 * 1024 * 1024 - 1024) {
    try {
      const text: string = await $.fs.read(path)
      for (const line of text.split('\n')) lineInto(line, acc, seen)
      return acc
    } catch {
      // fall through to streaming
    }
  }
  // Bigger than one read allows: stream it through the system's cat/type.
  const isWin = /^[A-Za-z]:[\\/]/.test(path)
  const argv = isWin ? ['cmd', '/c', 'type', path.replace(/\//g, '\\')] : ['cat', path]
  try {
    let buf = ''
    for await (const chunk of $.process.spawn({ argv })) {
      if (chunk.stream !== 'stdout') continue
      buf += chunk.text
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) lineInto(line, acc, seen)
    }
    if (buf) lineInto(buf, acc, seen)
    return acc
  } catch {
    return null
  }
}

async function scan($: E) {
  if (scanning) {
    again = true
    return
  }
  scanning = true
  await update($, isScanning, () => true)
  try {
    do {
      again = false
      const root = `${await configDir($)}/projects`
      const files: { path: string; m: number; s: number }[] = []
      await collect($, root, 4, files)
      const old = ((await $.store.get(FILES_KEY)) ?? {}) as FileCache
      const next: FileCache = {}
      let skipped = 0
      for (const f of files) {
        const cached = old[f.path]
        if (cached && cached.m === f.m && cached.s === f.s) {
          next[f.path] = cached
          continue
        }
        const got = await sumFile($, f.path, f.m, f.s)
        if (got) next[f.path] = got
        else if (cached) next[f.path] = cached
        else skipped += 1
      }
      // Keep sums of transcripts that were deleted since (cleanupPeriodDays),
      // so the lifetime total never goes backwards.
      for (const [path, cached] of Object.entries(old)) {
        if (!next[path]) next[path] = cached
      }
      await $.store.set(FILES_KEY, next)

      const now = new Date(await $.clock.now())
      const today = now.toISOString().slice(0, 10)
      const weekAgo = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10)
      const t: TokenTotals = {
        input: 0, output: 0, cacheRead: 0, cacheWrite: 0, messages: 0,
        files: Object.keys(next).length, skipped, today: 0, week: 0,
        scannedAt: now.getTime(),
      }
      for (const f of Object.values(next)) {
        t.input += f.i
        t.output += f.o
        t.cacheRead += f.cr
        t.cacheWrite += f.cw
        t.messages += f.n
        for (const [day, n] of Object.entries(f.days)) {
          if (day === today) t.today += n
          if (day >= weekAgo) t.week += n
        }
      }
      await update($, totals, () => t)
      await applyStatus($)
    } while (again)
  } finally {
    scanning = false
    await update($, isScanning, () => false)
  }
}

async function applyStatus($: E) {
  const id = await read($, theme)
  const t = await read($, totals)
  if (!t) return
  const sfx = id === 'off' ? '' : `${THEMES[id].sfx.repeat(3)} `
  $.ui.status(`${sfx}${compact(sum(t))} tokens all-time · ${compact(t.today)} today`)
}

async function applyTheme($: E, id: ThemeId) {
  await update($, theme, () => id)
  await $.store.set('theme', id)
  if (id === 'off') await $.ui.backdrop(undefined)
  else await $.ui.backdrop({ id: `flair-${id}`, glass: { blur: 10, tint: THEMES[id].bg, opacity: 0.55 } })
  await applyStatus($)
}

export const register: Register = on => {
  // ── Lifecycle and commands ──────────────────────────────────────────────

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'tokens', description: 'Show the all-time token counter' })
    await $.command.register({
      name: 'jojo',
      description: 'Pick a theme: menacing, diamond, golden or off',
    })
    const saved = await $.store.get('theme')
    await applyTheme($, isThemeId(saved) ? saved : 'menacing')
    void $.ui.open({ id: PANE, title: 'ゴゴゴ Tokens' })
    void scan($)

    return started
  })

  on('command.run', { command: 'tokens' }, async $ => {
    await $.ui.open({ id: PANE, title: 'ゴゴゴ Tokens' })
    void scan($)

    return { text: 'Token counter opened.' }
  })

  on('command.run', { command: 'jojo' }, async ($, e) => {
    let pick = e.args.trim().toLowerCase()
    if (!pick) {
      const labels = THEME_IDS.map(themeLabel)
      try {
        const chosen = await $.ui.ask('Which theme?', {
          header: 'Theme',
          options: labels.map(label => ({ label, description: label === 'Off' ? 'No theme' : THEMES[THEME_IDS[labels.indexOf(label)] as Exclude<ThemeId, 'off'>].tagline })),
        } as any)
        pick = THEME_IDS[labels.indexOf(chosen)] ?? ''
      } catch {
        return { text: 'Theme unchanged.' }
      }
    }
    const match = THEME_IDS.find(id => id === pick || themeLabel(id).toLowerCase() === pick)
    if (!match) return { text: `Unknown theme "${pick}". Try: ${THEME_IDS.join(', ')}` }
    await applyTheme($, match)

    return { text: `Theme: ${themeLabel(match)}` }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void scan($)

    return done
  })

  // ── Drawing ─────────────────────────────────────────────────────────────

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.props.plugin !== 'flair') return next(e)
    const id = await read($, theme)
    if (id === 'off') return next(e)
    const ui = $.ui.resolve(e) as any
    if (!ui.Svg) return next(e)
    const Svg = ui.Svg

    return <Svg source={backdropSvg(THEMES[id])} alt="" isInteractive />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const id = await read($, theme)
    if (e.props.hasSurvey || id === 'off') return next(e)
    const p = THEMES[id]
    const t = await read($, totals)
    const { Box, Text } = $.ui.resolve(e)
    const s = p.sfx

    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box>
          <Text color={p.accent2} bold>{`${s} ${s} ${s} `}</Text>
          <Text color={p.accent} bold italic>
            {t ? `${compact(sum(t))} TOKENS` : 'COUNTING TOKENS…'}
          </Text>
          <Text color={p.accent2} bold>{` ${s} ${s} ${s}`}</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const id = await read($, theme)
    const t = await read($, totals)
    const busy = await read($, isScanning)
    const usage = await $.session.usage().catch(() => undefined)
    const ui = $.ui.resolve(e) as any
    const { Box, Text, Button } = ui
    const p: Palette =
      id === 'off'
        ? { label: 'Off', tagline: '', bg: 'transparent', panel: 'transparent', accent: 'claude', accent2: 'subtle', text: 'text', sfx: '' }
        : THEMES[id]

    const row = (label: string, value: string, color = p.text) => (
      <Box key={label}>
        <Box width={14}>
          <Text color={p.accent2}>{label}</Text>
        </Box>
        <Text color={color} bold>{value}</Text>
      </Box>
    )

    const limits = usage?.rateLimits ?? []

    return (
      <Box flexDirection="column" backgroundColor={id === 'off' ? undefined : p.bg} paddingX={1}>
        {ui.Svg && id !== 'off' ? (
          <ui.Svg source={bannerSvg(p, 'TOKEN COUNT')} alt="Token count banner" width={360} />
        ) : (
          <Text color={p.accent} bold italic>
            {p.sfx ? `${p.sfx.repeat(3)} TOKEN COUNT ${p.sfx.repeat(3)}` : 'Token count'}
          </Text>
        )}

        {!t ? (
          <Text color={p.text} dimColor>{busy ? 'Reading your transcripts…' : 'No data yet.'}</Text>
        ) : (
          <Box flexDirection="column">
            <Text color={p.accent} bold>{`${full(sum(t))} tokens`}</Text>
            <Text color={p.text} dimColor>all-time, every Claude Code session on this machine</Text>
            <Text> </Text>
            {row('Today', full(t.today))}
            {row('Last 7 days', full(t.week))}
            <Text> </Text>
            {row('Output', full(t.output))}
            {row('Input', full(t.input))}
            {row('Cache write', full(t.cacheWrite))}
            {row('Cache read', full(t.cacheRead))}
            {row('Responses', full(t.messages))}
            {row('Sessions', full(t.files))}
            {t.skipped > 0 && <Text color="warning">{`${t.skipped} transcript(s) could not be read`}</Text>}
          </Box>
        )}

        {(limits.length > 0 || usage?.cost) && <Text> </Text>}
        {limits.map(l => (
          <Box key={l.kind}>
            <Box width={14}>
              <Text color={p.accent2}>
                {l.kind === 'five_hour' ? '5-hour limit' : l.kind === 'seven_day' ? 'Weekly limit' : l.kind}
              </Text>
            </Box>
            <Text color={l.percentUsed >= 80 ? 'error' : p.accent}>{`${bar(l.percentUsed)} ${l.percentUsed}%`}</Text>
          </Box>
        ))}
        {usage?.cost && row('This session', `$${usage.cost.usd.toFixed(2)}`)}

        <Text> </Text>
        <Text color={p.accent2} bold>Theme</Text>
        <Box flexDirection="row" flexWrap="wrap">
          {THEME_IDS.map(tid => (
            <Button
              key={`theme-${tid}`}
              label={`${tid === id ? '● ' : ''}${themeLabel(tid)}`}
              onPress={() => applyTheme($, tid)}
            />
          ))}
        </Box>
        <Box>
          <Button key="refresh" label={busy ? 'Counting…' : 'Recount'} onPress={() => scan($)} />
        </Box>
      </Box>
    )
  })
}
