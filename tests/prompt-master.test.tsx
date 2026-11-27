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

const answer = (e: { questions: { question: string }[] }, label: string) => ({
  result: { questions: e.questions, answers: { [e.questions[0]!.question]: label } },
})

const base = (on: (event: never, hook: never) => void) => {
  const o = on as unknown as (event: string, hook: (...a: any[]) => unknown) => void
  o('command.register', () => ({ value: { command: 'pm' } }))
  o('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  o('store.get', () => ({ value: undefined }))
  o('ui.status', () => ({ value: undefined }))
  o('ui.toast', () => ({ value: undefined }))
  return o
}

test('a weak prompt is held, improved and put in the prompt box', async ($, on) => {
  const o = base(on as never)
  const sent: string[] = []
  const filled: string[] = []
  o('prompt.submit', (_: unknown, e: { text: string }) => {
    sent.push(e.text)
    return { text: e.text }
  })
  o('tool.call', (_: unknown, e: { questions: { question: string }[] }) => answer(e, 'Improve it first'))
  o('model.complete', () => ({ value: { isAnswered: true, text: 'Fix the login bug in `auth.ts`.' } }))
  o('prompt.fill', (_: unknown, e: { text: string }) => {
    filled.push(e.text)
    return { isFilled: true }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const r = (await $.prompt.submit({ text: 'fix it', wait: false } as never)) as { drop?: string }
  expect(r.drop ?? '').toContain('prompt box')
  expect(sent.length).toBe(0)
  expect(filled[0]).toBe('Fix the login bug in `auth.ts`.')

  // Sending the rewrite goes straight through, with no second question.
  await $.prompt.submit({ text: 'Fix the login bug in `auth.ts`.', wait: false } as never)
  expect(sent[0]).toBe('Fix the login bug in `auth.ts`.')
})

test('"Send as is" sends the original untouched', async ($, on) => {
  const o = base(on as never)
  const sent: string[] = []
  o('prompt.submit', (_: unknown, e: { text: string }) => {
    sent.push(e.text)
    return { text: e.text }
  })
  o('tool.call', (_: unknown, e: { questions: { question: string }[] }) => answer(e, 'Send as is'))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'fix it', wait: false } as never)
  expect(sent[0]).toBe('fix it')
})
