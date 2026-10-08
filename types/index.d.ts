export type Window = { kind: string; percentUsed: number; resetsAt?: string }
export type Reading = { limits: Window[]; now: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-limits': { reading: Reading }
  }
}
