import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Gate, Saved, Scored } from '../types'
import { IMPROVE_SYSTEM, scorePrompt } from './score'

const PANE = 'prompt-master'
const STORE_KEY = 'library'
const GATE_KEY = 'gate'
const DEFAULT_GATE: Gate = { isOn: true, threshold: 75 }
const IMPROVE = 'Improve it first'
const SEND = 'Send as is'

// The text of a rewrite the person has already seen, so sending it is never held again.
let approved = ''

const last = atom({ plugin: 'prompt-master', key: 'last' } as const, null, { shape: 'last-1' })
const draft = atom({ plugin: 'prompt-master', key: 'draft' } as const, null, { shape: 'draft-1' })
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
  { name: 'pm-gate', description: 'Ask before sending a low-scoring prompt: on, off, or a score threshold', argumentHint: '[on|off|0-100]' },
] as const

const isSaved = (v: unknown): v is Saved =>
  typeof v === 'object' && v !== null &&
  typeof (v as Saved).name === 'string' && typeof (v as Saved).text === 'string'

const loadLibrary = async ($: EngineInterface): Promise<Saved[]> => {
  const raw = await $.store.get(STORE_KEY)
  return Array.isArray(raw) ? raw.filter(isSaved) : []
}

const isGate = (v: unknown): v is Gate =>
  typeof v === 'object' && v !== null &&
  typeof (v as Gate).isOn === 'boolean' && typeof (v as Gate).threshold === 'number'

const loadGate = async ($: EngineInterface): Promise<Gate> => {
  const raw = await $.store.get(GATE_KEY)
  return isGate(raw) ? raw : DEFAULT_GATE
}

const describeGate = (g: Gate) =>
  g.isOn
    ? `Prompt Master asks before sending any prompt that scores below ${g.threshold}/100.`
    : 'Prompt Master sends every prompt without asking (the check is off).'

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

const scoreDraft = async ($: EngineInterface, text: string) => {
  const clean = text.trim()
  const next: Scored | null = clean && !clean.startsWith('/') ? scorePrompt(clean) : null
  const prev = await read($, draft)
  const isSame =
    prev === next ||
    (prev !== null && next !== null && prev.score === next.score && prev.tips[0] === next.tips[0])
  if (!isSame) {
    await update($, draft, () => next)
  }
}

type Hold = { drop: string; text?: undefined } | { drop?: undefined; text: string }

// Below the threshold, ask first. Returns null to send the prompt unchanged.
const holdIfWeak = async ($: EngineInterface, scored: Scored): Promise<Hold | null> => {
  if (scored.text === approved) {
    approved = ''
    return null
  }
  const gate = await loadGate($)
  if (!gate.isOn || scored.score >= gate.threshold) {
    return null
  }

  const tip = scored.tips[0] ? ` Top tip: ${scored.tips[0]}` : ''
  let choice: string
  try {
    choice = await $.ui.ask(
      `This prompt scores ${scored.score}/100 (${scored.grade}).${tip} Improve it before sending?`,
      { options: [IMPROVE, SEND], header: 'Prompt' },
    )
  } catch {
    return null // dismissed, or nobody to ask: send as typed
  }
  if (choice !== IMPROVE) {
    return null
  }

  const better = await improve($, scored.text)
  if (!better) {
    $.ui.toast('Prompt Master could not reach the model, so your prompt was sent as typed.')
    return null
  }
  approved = better.trim()
  const after = scorePrompt(better)

  const filled = await $.prompt.fill({ text: better, mode: 'replace' })
  if (filled.isFilled) {
    return {
      drop: `Not sent yet. The improved prompt (${after.score}/100) is in your prompt box: edit it if you like, then press Enter to send it.`,
    }
  }

  // No prompt box to fill (some apps): show the rewrite and let the person pick.
  let pick: string
  try {
    pick = await $.ui.ask(`Improved prompt (${after.score}/100):\n\n${better}\n\nSend this version?`, {
      options: ['Send improved', 'Send my original'],
      header: 'Prompt',
    })
  } catch {
    approved = ''
    return { drop: `Not sent. Improved prompt you can copy:\n\n${better}` }
  }
  approved = ''
  return pick === 'Send improved' ? { text: better } : null
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

  // Live scoring: score the draft as it is typed, recalled or filled.
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    await scoreDraft($, box.text)
    return box
  })

  on('prompt.change', async ($, e, next) => {
    const done = await next(e)
    await scoreDraft($, e.text)
    return done
  })

  // Score every prompt the person sends; never changes what is sent.
  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim()
    if (!e.command && !e.isMeta && e.origin?.kind !== 'plugin' && text && !text.startsWith('/')) {
      const scored: Scored = scorePrompt(text)
      await update($, last, () => scored)
      await update($, draft, () => null)
      await update($, isBandHidden, () => false)
      $.ui.status(`Prompt ${scored.score}/100 · ${scored.grade}`)

      const held = await holdIfWeak($, scored)
      if (held !== null) {
        return held.drop !== undefined ? held : next({ ...e, text: held.text })
      }
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

  on('command.run', { command: 'pm-gate' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const gate = await loadGate($)
    let chosen: Gate = gate
    if (arg === 'on') {
      chosen = { ...gate, isOn: true }
    } else if (arg === 'off') {
      chosen = { ...gate, isOn: false }
    } else if (/^\d{1,3}$/.test(arg) && Number(arg) <= 100) {
      chosen = { isOn: true, threshold: Number(arg) }
    } else if (arg !== '') {
      return { text: 'Usage: /pm-gate on | off | <score 0-100>', isTextDisplayOnly: true }
    }
    if (chosen !== gate) {
      await $.store.set(GATE_KEY, chosen)
    }
    return { text: describeGate(chosen), isTextDisplayOnly: true }
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
    const live = await read($, draft)
    const scored = live ?? (await read($, last))
    if (e.props.hasSurvey || scored === null || (await read($, isBandHidden))) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    const tip = scored.tips[0]
    const label = live ? 'Draft' : 'Last'

    return (
      <Box>
        <Text color={scored.score >= 65 ? 'green' : scored.score >= 45 ? 'yellow' : 'red'}>
          ✦ {label} {scored.score}/100 {scored.grade}
        </Text>
        <Text dimColor> {tip ? `· ${tip} ` : '· Nicely specified. '}</Text>
        <Button key="pane" label="Details" onPress={() => $.ui.open({ id: PANE, title: 'Prompt Master' })} />
        <Button key="hide" label="Hide" onPress={() => update($, isBandHidden, () => true)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const live = await read($, draft)
    const scored = live ?? (await read($, last))
    const list = await read($, library)
    const busy = await read($, isImproving)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>{live ? 'Your draft (live)' : 'Last prompt'}</Text>
          {scored === null ? (
            <Text dimColor>Start typing a prompt and it is scored here as you go.</Text>
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
                label={live ? 'Improve this draft' : 'Improve last prompt'}
                onPress={async () => {
                  if (busy) return
                  const text = live ? (await $.prompt.read()).text : scored.text
                  $.ui.toast(await improveIntoBox($, text))
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
