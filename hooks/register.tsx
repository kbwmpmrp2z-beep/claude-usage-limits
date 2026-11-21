import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface, SessionRateLimit } from 'claude-code'

import type { Reading, RemoteState } from '../types'

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

// Remote Control: the desktop app's toolbar switch, reached through its own MCP server
const APP = 'ccd_session_mgmt'
const remote = atom({ plugin: 'usage-limits', key: 'remote' } as const, null)

const STATES = ['on', 'off', 'connecting', 'unavailable'] as const

// the app answers JSON ({ remoteControlState } or { state }) or a sentence naming the state
export function parseRemote(text: string): RemoteState {
  try {
    const j = JSON.parse(text)
    const v = j?.remoteControlState ?? j?.state
    if ((STATES as readonly string[]).includes(v)) return v
  } catch {}
  const m = text.match(/\b(on|off|connecting|unavailable)\b/)
  return m ? (m[1] as RemoteState) : null
}

function textOf(r: { content: { type: string; text?: string }[] }): string {
  return r.content.map(c => (c.type === 'text' ? (c.text ?? '') : '')).join('\n')
}

// null where the app's server is missing (the terminal): the switch is then not drawn
async function readRemote($: EngineInterface): Promise<RemoteState> {
  try {
    const r = await $.mcp.call(APP, 'get_session', { session_id: 'self' })
    return r.isError ? null : parseRemote(textOf(r))
  } catch {
    return null
  }
}

// plain writes, not update(): a compare-and-set that loses to the 15 s sync must not swallow a press
const REMOTE_REF = { plugin: 'usage-limits', key: 'remote' } as const

async function syncRemote($: EngineInterface) {
  await $.state.set(REMOTE_REF, await readRemote($))
}

async function toggleRemote($: EngineInterface) {
  try {
    // the state as the app has it now, not as the drawing last saw it
    const before = await readRemote($)
    const enabled = before !== 'on' && before !== 'connecting'
    await $.state.set(REMOTE_REF, 'connecting')
    const r = await $.mcp.call(APP, 'set_remote_control', { session_id: 'self', enabled })
    if (r.isError) $.ui.toast(`Remote Control: ${textOf(r).slice(0, 160)}`, { timeoutMs: 8_000 })
  } catch (err) {
    $.ui.toast(`Remote Control nejde přepnout: ${String(err).slice(0, 160)}`, { timeoutMs: 8_000 })
  }
  await syncRemote($)
}

// the switch: one button whose label carries the state, coloured by its dot
// (a desktop button takes plain text only); a press anywhere on it flips it
const RC_LABEL: Record<string, string> = {
  on: '🟢 Remote: ZAPNUTO',
  off: '⚪ Remote: VYPNUTO',
  connecting: '🟡 Remote: připojuji…',
  unavailable: '🔴 Remote: nedostupné',
}

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
    // the toolbar switch can change it too: read it now and then
    void syncRemote($)
    $.clock.every(15_000, () => void syncRemote($))
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (windows(e.rateLimits).length > 0) await $.store.set('last', e.rateLimits)
    await refresh($, e.rateLimits)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    void syncRemote($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, reading)
    const rc = await read($, remote)
    const shown = windows(r.limits)
    if (e.props.hasSurvey || (shown.length === 0 && rc === null)) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const width = e.props.bodyColumns >= 90 ? 16 : 8

    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={4}>
        {rc !== null && RC_LABEL[rc] ? (
          <Button
            key="remote-toggle"
            label={RC_LABEL[rc]}
            variant={rc === 'on' ? 'primary' : undefined}
            onPress={() => void toggleRemote($)}
          />
        ) : null}
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
