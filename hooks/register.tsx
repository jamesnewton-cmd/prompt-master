import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Saved, Scored } from '../types'
import { IMPROVE_SYSTEM, scorePrompt } from './score'

const PANE = 'prompt-master'
const STORE_KEY = 'library'

const last = atom({ plugin: 'prompt-master', key: 'last' } as const, null, { shape: 'last-1' })
const library = atom({ plugin: 'prompt-master', key: 'library' } as const, [], { shape: 'library-1' })
const isBandHidden = atom({ plugin: 'prompt-master', key: 'isBandHidden' } as const, false)
const isImproving = atom({ plugin: 'prompt-master', key: 'isImproving' } as const, false)

const COMMANDS = [
  { name: 'pm', description: 'Prompt Master: open the pane (score, tips, library)' },
  { name: 'pm-improve', description: 'Rewrite a rough prompt (or your draft) into a strong one', argumentHint: '[rough prompt]' },
  { name: 'pm-save', description: 'Save a prompt to your library (the last one sent if no text)', argumentHint: '<name> [text]' },
  { name: 'pm-use', description: 'Put a saved prompt in the prompt box', argumentHint: '<name>' },
  { name: 'pm-list', description: 'List your saved prompts' },
  { name: 'pm-delete', description: 'Delete a saved prompt', argumentHint: '<name>' },
] as const

const isSaved = (v: unknown): v is Saved =>
  typeof v === 'object' && v !== null &&
  typeof (v as Saved).name === 'string' && typeof (v as Saved).text === 'string'

const loadLibrary = async ($: EngineInterface): Promise<Saved[]> => {
  const raw = await $.store.get(STORE_KEY)
  return Array.isArray(raw) ? raw.filter(isSaved) : []
}

const saveLibrary = async ($: EngineInterface, list: Saved[]) => {
  await $.store.set(STORE_KEY, list)
  await update($, library, () => list)
}

const improve = async ($: EngineInterface, rough: string): Promise<string> => {
  await update($, isImproving, () => true)
  try {
    const r = await $.model.complete({
      model: 'haiku',
      system: IMPROVE_SYSTEM,
      prompt: `Rewrite this request:\n\n${rough}`,
      maxTokens: 800,
      timeoutMs: 30000,
    })
    if (!r.isAnswered) {
      return ''
    }
    return r.text.trim()
  } finally {
    await update($, isImproving, () => false)
  }
}

const improveIntoBox = async ($: EngineInterface, rough: string): Promise<string> => {
  if (!rough.trim()) {
    return 'Nothing to improve: type a draft first, or use /pm-improve <rough prompt>.'
  }
  const better = await improve($, rough)
  if (!better) {
    return 'Prompt Master could not reach the model just now. Try again in a moment.'
  }
  const filled = await $.prompt.fill({ text: better, mode: 'replace' })
  const after = scorePrompt(better)
  return filled.isFilled
    ? `Improved prompt is in your prompt box (${after.score}/100, ${after.grade}). Edit it, then press Enter.`
    : `Improved prompt (${after.score}/100):\n\n${better}`
}

const SLUG = /^[\w-]{1,40}$/

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    for (const spec of COMMANDS) {
      await $.command.register(spec)
    }
    const stored = await loadLibrary($)
    await update($, library, () => stored)

    return next(e)
  })

  // Score every prompt the person sends; never changes what is sent.
  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim()
    if (!e.command && !e.isMeta && e.origin?.kind !== 'plugin' && text && !text.startsWith('/')) {
      const scored: Scored = scorePrompt(text)
      await update($, last, () => scored)
      await update($, isBandHidden, () => false)
      $.ui.status(`Prompt ${scored.score}/100 · ${scored.grade}`)
    }

    return next(e)
  })

  on('command.run', { command: 'pm' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Prompt Master' })
    return { text: 'Prompt Master pane opened.', isTextDisplayOnly: true }
  })

  on('command.run', { command: 'pm-improve' }, async ($, e) => {
    const rough = e.args.trim() || (await $.prompt.read()).text
    return { text: await improveIntoBox($, rough), isTextDisplayOnly: true }
  })

  on('command.run', { command: 'pm-save' }, async ($, e) => {
    const [name = '', ...rest] = e.args.trim().split(/\s+/)
    if (!SLUG.test(name)) {
      return { text: 'Usage: /pm-save <name> [text]  (name: letters, digits, - or _)', isTextDisplayOnly: true }
    }
    const text = rest.join(' ').trim() || (await read($, last))?.text || ''
    if (!text) {
      return { text: 'Nothing to save yet: send a prompt first, or give the text.', isTextDisplayOnly: true }
    }
    const list = (await loadLibrary($)).filter(one => one.name !== name)
    await saveLibrary($, [...list, { name, text }])
    return { text: `Saved "${name}" to your Prompt Master library.`, isTextDisplayOnly: true }
  })

  on('command.run', { command: 'pm-use' }, async ($, e) => {
    const name = e.args.trim()
    const found = (await loadLibrary($)).find(one => one.name === name)
    if (!found) {
      return { text: `No saved prompt named "${name}". Try /pm-list.`, isTextDisplayOnly: true }
    }
    const filled = await $.prompt.fill({ text: found.text, mode: 'replace' })
    return {
      text: filled.isFilled ? `"${name}" is in your prompt box.` : found.text,
      isTextDisplayOnly: true,
    }
  })

  on('command.run', { command: 'pm-list' }, async $ => {
    const list = await loadLibrary($)
    if (list.length === 0) {
      return { text: 'Your library is empty. Save one with /pm-save <name>.', isTextDisplayOnly: true }
    }
    const lines = list.map(one => `• ${one.name} — ${one.text.length > 70 ? one.text.slice(0, 70) + '…' : one.text}`)
    return { text: `Saved prompts:\n${lines.join('\n')}`, isTextDisplayOnly: true }
  })

  on('command.run', { command: 'pm-delete' }, async ($, e) => {
    const name = e.args.trim()
    const list = await loadLibrary($)
    if (!list.some(one => one.name === name)) {
      return { text: `No saved prompt named "${name}".`, isTextDisplayOnly: true }
    }
    await saveLibrary($, list.filter(one => one.name !== name))
    return { text: `Deleted "${name}".`, isTextDisplayOnly: true }
  })

  // A quiet band above the prompt: the last prompt's score and its top tip.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const scored = await read($, last)
    if (e.props.hasSurvey || scored === null || (await read($, isBandHidden))) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    const tip = scored.tips[0]

    return (
      <Box>
        <Text color={scored.score >= 65 ? 'green' : scored.score >= 45 ? 'yellow' : 'red'}>
          ✦ {scored.score}/100 {scored.grade}
        </Text>
        <Text dimColor> {tip ? `· ${tip} ` : '· Nicely specified. '}</Text>
        <Button key="pane" label="Details" onPress={() => $.ui.open({ id: PANE, title: 'Prompt Master' })} />
        <Button key="hide" label="Hide" onPress={() => update($, isBandHidden, () => true)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const scored = await read($, last)
    const list = await read($, library)
    const busy = await read($, isImproving)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>Last prompt</Text>
          {scored === null ? (
            <Text dimColor>Send a prompt and it is scored here.</Text>
          ) : (
            <Box flexDirection="column">
              <Text color={scored.score >= 65 ? 'green' : scored.score >= 45 ? 'yellow' : 'red'}>
                {scored.score}/100 · {scored.grade}
              </Text>
              {scored.tips.length === 0 ? (
                <Text dimColor>All six checks met: goal, detail, specifics, context, constraints, done.</Text>
              ) : (
                scored.tips.map(tip => <Text>• {tip}</Text>)
              )}
            </Box>
          )}
        </Box>

        <Box flexDirection="column">
          <Text bold>Improve</Text>
          <Text dimColor>Rewrites the draft in your prompt box into a stronger prompt.</Text>
          <Box>
            <Button
              key="improve-draft"
              label={busy ? 'Improving…' : 'Improve my draft'}
              onPress={async () => {
                if (busy) return
                const msg = await improveIntoBox($, (await $.prompt.read()).text)
                $.ui.toast(msg)
              }}
            />
            {scored !== null && (
              <Button
                key="improve-last"
                label="Improve last prompt"
                onPress={async () => {
                  if (busy) return
                  $.ui.toast(await improveIntoBox($, scored.text))
                }}
              />
            )}
          </Box>
        </Box>

        <Box flexDirection="column">
          <Text bold>Library ({list.length})</Text>
          {list.length === 0 && <Text dimColor>Save one with /pm-save &lt;name&gt; [text].</Text>}
          {list.map(one => (
            <Box flexDirection="column">
              <Text>{one.name}</Text>
              <Text dimColor>{one.text.length > 90 ? one.text.slice(0, 90) + '…' : one.text}</Text>
              <Box>
                <Button
                  key={`use-${one.name}`}
                  label="Use"
                  onPress={() => $.prompt.fill({ text: one.text, mode: 'replace' })}
                />
                <Button
                  key={`del-${one.name}`}
                  label="Delete"
                  onPress={async () => saveLibrary($, (await loadLibrary($)).filter(x => x.name !== one.name))}
                />
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
