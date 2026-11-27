import type { Scored } from '../types'

type Check = { points: number; isMet: (t: string, words: number) => boolean; tip: string }

const CHECKS: Check[] = [
  {
    points: 20,
    isMet: (_, words) => words >= 12,
    tip: 'Say more: one short line rarely carries enough for a great answer.',
  },
  {
    points: 15,
    isMet: t =>
      /\b(make|build|write|fix|add|create|explain|refactor|review|find|summari[sz]e|compare|draft|design|test|debug|update|remove|rename|plan)\b/i.test(t),
    tip: 'Lead with a clear action verb (fix, write, explain, compare...).',
  },
  {
    points: 20,
    isMet: t => /`[^`]+`|[\w-]+\.[a-z]{1,5}\b|\/[\w.-]+\/|\b\d+\b|"[^"]+"/i.test(t),
    tip: 'Be specific: name the file, function, value or example you mean.',
  },
  {
    points: 15,
    isMet: t => /\b(because|so that|in order to|the goal|context|currently|right now|for (a|an|my|our|the)\b)/i.test(t),
    tip: 'Give context: why you need it, or what is happening now.',
  },
  {
    points: 15,
    isMet: t => /\b(must|should|don'?t|do not|without|only|avoid|keep|never|always|under|at most|at least)\b/i.test(t),
    tip: 'Add constraints: what to keep, avoid, or stay within.',
  },
  {
    points: 15,
    isMet: t => /\b(done when|expected|so i can|output|format|as a (list|table)|bullet|steps|return|example|test(s)? pass)\b/i.test(t),
    tip: 'Describe "done": the format you want or how success is checked.',
  },
]

const GRADES: [number, string][] = [
  [85, 'Master'],
  [65, 'Strong'],
  [45, 'Decent'],
  [25, 'Rough'],
  [0, 'Vague'],
]

export const scorePrompt = (text: string): Scored => {
  const clean = text.trim()
  const words = clean.split(/\s+/).filter(Boolean).length
  let score = 0
  const tips: string[] = []

  for (const check of CHECKS) {
    if (check.isMet(clean, words)) {
      score += check.points
    } else {
      tips.push(check.tip)
    }
  }

  const grade = GRADES.find(([min]) => score >= min)?.[1] ?? 'Vague'

  return { text: clean, score, grade, tips }
}

export const IMPROVE_SYSTEM = `You rewrite rough requests into excellent prompts for Claude, an AI coding and writing assistant.
Keep the person's intent and every fact they gave; never invent file names, numbers or requirements.
Where something important is unknown, add a short bracketed placeholder like [which file?] instead of guessing.
Structure: the goal in one sentence, then relevant context, then constraints, then what "done" looks like (format or check).
Be concise. Reply with the rewritten prompt only: no preamble, no quotes, no commentary.`
