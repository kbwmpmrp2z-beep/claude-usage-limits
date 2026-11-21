import { expect, test } from 'claude-code/testing'

const BAND = { plugin: 'usage-limits', surface: 'desktop', component: 'AbovePrompt' } as const
const props = {
  hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 3, bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 3 }, view: {},
}

test('a press on the switch asks the app to turn it on', async ($, on) => {
  const calls: unknown[] = []
  const sets: unknown[] = []
  let remote: unknown = 'off'
  let version = 1
  on('state.get', (_: unknown, e: any) => ({
    value: { value: e.key === 'remote' ? remote : { limits: [], now: 0 }, version },
  }))
  on('state.set', (_: unknown, e: any) => {
    sets.push(e.value)
    if (e.key === 'remote') remote = e.value
    version += 1
    return { value: { isSet: true, version } } as any
  })
  on('mcp.call', (_: unknown, e: any) => {
    calls.push(e)
    const text = calls.length === 1 ? '{"remoteControlState":"off"}' : '{"remoteControlState":"on"}'
    return { value: { content: [{ type: 'text', text }], isError: false } } as any
  })
  on('ui.toast', (_: unknown, e: any) => { calls.push({ toast: e }); return { value: undefined } as any })
  on('ui.render', ($: any, e: unknown) => { const { Box } = $.ui.resolve(e); return <Box /> })

  const ui = await $.ui.mount({ ...BAND, props })
  await ui.press({ key: 'remote-toggle' })
  // the press runs its work detached: let it settle
  for (let i = 0; i < 50; i++) await Promise.resolve()
  expect(calls).toEqual([
    expect.objectContaining({ tool: 'get_session' }),
    expect.objectContaining({ tool: 'set_remote_control', args: { session_id: 'self', enabled: true } }),
    expect.objectContaining({ tool: 'get_session' }),
  ])
  expect(sets).toEqual(['connecting', 'on'])
  await ui.unmount()
})
