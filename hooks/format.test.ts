import { test, expect } from 'claude-code/testing'
import { bar, tone, toWarn, until, windows } from './register'

const now = Date.parse('2026-10-08T10:00:00Z')

test('5h window comes first, other kinds are dropped', async () => {
  const kinds = windows([
    { kind: 'seven_day', percentUsed: 41 },
    { kind: 'spend_limit', percentUsed: 5 },
    { kind: 'five_hour', percentUsed: 23 },
  ]).map(l => l.kind)
  expect(kinds).toEqual(['five_hour', 'seven_day'])
})

test('bar fills in proportion and stays within its width', async () => {
  expect(bar(50, 10)).toEqual(['█████', '░░░░░'])
  expect(bar(130, 10)).toEqual(['██████████', ''])
})

test('colour turns at 70 and 90 percent', async () => {
  expect([tone(10), tone(75), tone(95)]).toEqual(['success', 'warning', 'error'])
})

test('countdown reads in days, hours or minutes', async () => {
  expect(until('2026-10-10T13:00:00Z', now)).toBe('2d 3h')
  expect(until('2026-10-08T12:15:00Z', now)).toBe('2h 15m')
  expect(until('2026-10-08T10:09:00Z', now)).toBe('9m')
})

test('warns once per window when it reaches 90 percent', async () => {
  const warned = new Set<string>()
  const limits = [
    { kind: 'five_hour', percentUsed: 91, resetsAt: '2026-10-08T12:00:00Z' },
    { kind: 'seven_day', percentUsed: 60, resetsAt: '2026-10-10T12:00:00Z' },
  ]
  expect(toWarn(limits, warned).map(l => l.kind)).toEqual(['five_hour'])
  warned.add('five_hour|2026-10-08T12:00:00Z')
  expect(toWarn(limits, warned)).toEqual([])
  // after the reset the same window can warn again
  const next = [{ kind: 'five_hour', percentUsed: 95, resetsAt: '2026-10-08T17:00:00Z' }]
  expect(toWarn(next, warned).map(l => l.kind)).toEqual(['five_hour'])
})
