import { expect, test } from 'claude-code/testing'

const BAND = { plugin: 'usage-limits', surface: 'desktop', component: 'AbovePrompt' } as const
const props = {
  hasSurvey: false,
  isCollapsed: false,
  isWorking: false,
  maxRows: 3,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 3 },
  view: {},
}

// the engine beneath: the stored values, and no band of its own
function stateOf(on: any, remote: string | null) {
  on('state.get', (_: unknown, e: { key: string }) => ({
    value: { value: e.key === 'remote' ? remote : { limits: [], now: 0 }, version: 1 },
  }))
  on('ui.render', ($: any, e: unknown) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}

for (const [state, mark, color, action] of [
  ['on', '● ZAPNUTO', 'success', 'Vypnout'],
  ['off', '○ VYPNUTO', 'inactive', 'Zapnout'],
] as const) {
  test(`the switch shows ${state} in colour and names the press`, async ($, on) => {
    // the engine's state: Remote Control as the app last reported it
    stateOf(on, state)
    const ui = await $.ui.mount({ ...BAND, props })

    const text = await ui.find({ type: 'Text', text: mark })
    expect(text?.props.color).toBe(color)
    const button = await ui.find({ type: 'Button', key: 'remote-toggle' })
    expect(button?.props.label).toBe(action)
    await ui.unmount()
  })
}

test('no switch where the app cannot say', async ($, on) => {
  stateOf(on, null)
  const ui = await $.ui.mount({ ...BAND, props })
  expect(await ui.find({ type: 'Button', key: 'remote-toggle' })).toBeUndefined()
  await ui.unmount()
})
