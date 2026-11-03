import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'flair',
  component: 'Pane',
  requestId: 'flair-tokens',
  props: {
    title: 'Tokens',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const TOTALS = {
  input: 1000, output: 2000, cacheRead: 3000000, cacheWrite: 40000,
  messages: 12, files: 3, skipped: 0, today: 5000, week: 9000, scannedAt: 1,
}

test('the pane shows the lifetime total and themes on every surface', async ($, on) => {
  on('state.get', (_, e: any) => {
    if (e.key === 'totals') return { value: { value: { shape: 'totals-1', value: TOTALS }, version: 1 } }
    if (e.key === 'theme') return { value: { value: { shape: 'theme-1', value: 'menacing' }, version: 1 } }
    return { value: { value: undefined, version: 0 } }
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [{ kind: 'five_hour', percentUsed: 42 }], cost: { usd: 1.5 } } }))

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const total = await ui.find({ type: 'Text', text: /3,043,000 tokens/ })
    expect(total?.text).toBe('3,043,000 tokens')
    expect(await ui.find({ type: 'Text', text: /42%/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'theme-diamond' })).toBeTruthy()
    await ui.unmount()
  }
})

test('the band shows menacing text', async ($, on) => {
  on('state.get', (_, e: any) => {
    if (e.key === 'totals') return { value: { value: { shape: 'totals-1', value: TOTALS }, version: 1 } }
    if (e.key === 'theme') return { value: { value: { shape: 'theme-1', value: 'menacing' }, version: 1 } }
    return { value: { value: undefined, version: 0 } }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine band</Text>
  })
  const ui = await $.ui.mount({ plugin: 'flair', component: 'AbovePrompt', requestId: 'above', props: { hasSurvey: false } as any, surface: 'desktop' } as any)
  expect(await ui.find({ type: 'Text', text: /3\.0M TOKENS/ })).toBeTruthy()
  await ui.unmount()
})
