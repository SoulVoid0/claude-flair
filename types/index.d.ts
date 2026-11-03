export type ThemeId = 'menacing' | 'diamond' | 'golden' | 'off'

export type TokenTotals = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  messages: number
  files: number
  skipped: number
  today: number
  week: number
  scannedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'flair': {
      theme: Shaped<ThemeId>
      totals: Shaped<TokenTotals | null>
      isScanning: boolean
    }
  }
}
