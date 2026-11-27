import { expect, test } from 'claude-code/testing'

import { scorePrompt } from '../hooks/score'

test('a vague prompt scores low with tips; a rich one scores high', async () => {
  const vague = scorePrompt('help')
  expect(vague.score < 25).toBe(true)
  expect(vague.tips.length).toBe(6)

  const rich = scorePrompt(
    'Fix the crash in `src/auth.ts` because users are logged out after 5 minutes. ' +
      "Don't change the public API. Done when the tests pass and the output shows no errors.",
  )
  expect(rich.score >= 85).toBe(true)
  expect(rich.grade).toBe('Master')
})

test('a sent prompt shows its score in the band', async ($, on) => {
  on('command.register', () => ({ value: { command: 'pm' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('store.get', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'help', wait: false } as never)

  const ui = await $.ui.mount({
    plugin: 'prompt-master',
    component: 'AbovePrompt',
    surface: 'desktop',
    props: { hasSurvey: false },
  } as never)
  const row = await ui.find({ type: 'Text', text: /\/100/ })
  expect(row?.text).toContain('Last 0/100 Vague')
  await ui.unmount()
})

test('the band scores the draft live as it is typed', async ($, on) => {
  on('command.register', () => ({ value: { command: 'pm' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('store.get', () => ({ value: undefined }))
  on('prompt.change', (_, e) => ({ text: e.text }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // prompt.change is observe-only, so its typing omits a caller; the kit raises it all the same.
  const prompt = $.prompt as unknown as Record<string, (input: unknown) => Promise<unknown>>
  await prompt.change!({
    text: 'Fix the crash in `src/auth.ts` because users are logged out. Don\'t change the API. Done when tests pass.',
    cursor: 0,
    origin: { kind: 'history' },
  } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'prompt-master',
      component: 'AbovePrompt',
      surface,
      props: { hasSurvey: false },
    } as never)
    const row = await ui.find({ type: 'Text', text: /Draft/ })
    expect(row?.text).toContain('Master')
    await ui.unmount()
  }
})
