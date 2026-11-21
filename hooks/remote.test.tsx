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

for (const [state, label] of [
  ['on', '🟢 Remote: ZAPNUTO'],
  ['off', '⚪ Remote: VYPNUTO'],
] as const) {
  test(`the switch shows ${state} by its dot`, async ($, on) => {
    // the engine's state: Remote Control as the app last reported it
    stateOf(on, state)
    const ui = await $.ui.mount({ ...BAND, props })

    const button = await ui.find({ type: 'Button', key: 'remote-toggle' })
    expect(button?.props.label).toBe(label)
    await ui.unmount()
  })
}

test('no switch where the app cannot say', async ($, on) => {
  stateOf(on, null)
  const ui = await $.ui.mount({ ...BAND, props })
  expect(await ui.find({ type: 'Button', key: 'remote-toggle' })).toBeUndefined()
  await ui.unmount()
})
