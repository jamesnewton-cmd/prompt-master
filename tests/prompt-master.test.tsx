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
  expect(row?.text).toContain('Vague')
  await ui.unmount()
})
