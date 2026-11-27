export type Scored = { text: string; score: number; grade: string; tips: string[] }
export type Saved = { name: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    'prompt-master': {
      last: Shaped<Scored | null>
      draft: Shaped<Scored | null>
      library: Shaped<Saved[]>
      isBandHidden: boolean
      isImproving: boolean
    }
  }
}
