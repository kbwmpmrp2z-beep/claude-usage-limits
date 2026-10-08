import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface, SessionRateLimit } from 'claude-code'

import type { Reading } from '../types'

const LABELS: Record<string, string> = { five_hour: '5h', seven_day: 'týden' }

const reading = atom({ plugin: 'usage-limits', key: 'reading' } as const, { limits: [], now: 0 })

export function until(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const mins = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function windows(limits: SessionRateLimit[]): SessionRateLimit[] {
  return limits
    .filter(l => l.kind in LABELS)
    .sort((a, b) => (a.kind === 'five_hour' ? -1 : b.kind === 'five_hour' ? 1 : 0))
}

export function bar(percent: number, width: number): [string, string] {
  const filled = Math.min(width, Math.max(0, Math.round((percent / 100) * width)))
  return ['█'.repeat(filled), '░'.repeat(width - filled)]
}

export function tone(percent: number): 'success' | 'warning' | 'error' {
  return percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'success'
}

export const WARN_AT = 90

// one warning per window per reset period: the key changes when the window resets
export function toWarn(limits: SessionRateLimit[], warned: Set<string>): SessionRateLimit[] {
  return windows(limits).filter(
    l => l.percentUsed >= WARN_AT && !warned.has(`${l.kind}|${l.resetsAt ?? ''}`),
  )
}

const warned = new Set<string>()

// last reading from an earlier session: a window whose reset has passed starts over at 0 %
export function revive(stored: unknown, now: number): SessionRateLimit[] {
  if (!Array.isArray(stored)) return []
  return windows(stored as SessionRateLimit[]).map(l =>
    l.resetsAt && Date.parse(l.resetsAt) <= now ? { kind: l.kind, percentUsed: 0 } : l,
  )
}

async function refresh($: EngineInterface, limits?: SessionRateLimit[], warn = true) {
  const now = await $.clock.now()
  for (const l of limits && warn ? toWarn(limits, warned) : []) {
    warned.add(`${l.kind}|${l.resetsAt ?? ''}`)
    const reset = until(l.resetsAt, now)
    $.ui.toast(
      `⚠️ Limit ${LABELS[l.kind]} je na ${Math.round(l.percentUsed)} %${reset ? ` (reset za ${reset})` : ''}`,
      { timeoutMs: 10_000 },
    )
  }
  await update($, reading, (r: Reading) => ({ limits: limits ?? r.limits, now }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // the first version wrote to the status line; the band replaces it
    $.ui.status(undefined)
    const live = (await $.session.usage()).rateLimits
    if (windows(live).length > 0) await refresh($, live)
    // nothing measured yet: show the last known reading until the first response
    else await refresh($, revive(await $.store.get('last'), await $.clock.now()), false)
    // the reset countdown moves even when no response arrives
    $.clock.every(60_000, () => void refresh($))
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (windows(e.rateLimits).length > 0) await $.store.set('last', e.rateLimits)
    await refresh($, e.rateLimits)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, reading)
    const shown = windows(r.limits)
    if (e.props.hasSurvey || shown.length === 0) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const width = e.props.bodyColumns >= 90 ? 16 : 8

    return (
      <Box flexDirection="row" gap={4}>
        {shown.map(l => {
          const [full, empty] = bar(l.percentUsed, width)
          const reset = until(l.resetsAt, r.now)
          return (
            <Box key={l.kind} flexDirection="row" gap={1}>
              <Text bold>{LABELS[l.kind]}</Text>
              <Text>
                <Text color={tone(l.percentUsed)}>{full}</Text>
                <Text dimColor>{empty}</Text>
              </Text>
              <Text color={tone(l.percentUsed)}>{Math.round(l.percentUsed)}%</Text>
              {reset ? <Text dimColor>↻ {reset}</Text> : null}
            </Box>
          )
        })}
      </Box>
    )
  })
}
