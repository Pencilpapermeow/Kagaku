// Answer checking and marking schemes. JA changes its scheme from year to year, so every
// test carries its own scheme; these presets are just starting points.

import { ASSERTION_CODES, type MarkingScheme, type Question, type QuestionFormat, type SchemeRule } from '../content/schema'

export type Response =
  | { kind: 'options'; ids: string[] }
  | { kind: 'number'; value: number; raw?: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'match'; pairs: Record<string, string[]> }
  | { kind: 'order'; ids: string[] }

export interface Verdict {
  correct: boolean
  /** Multiple-correct only: some right options, no wrong ones. */
  partial: boolean
  /** Correct options chosen (multiple-correct partial marking). */
  rightChosen: number
  attempted: boolean
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

export function isEmpty(r: Response | undefined): boolean {
  if (!r) return true
  switch (r.kind) {
    case 'options':
    case 'order':
      return r.ids.length === 0
    case 'number':
      return !Number.isFinite(r.value)
    case 'bool':
      return false
    case 'match':
      return Object.values(r.pairs).every((v) => v.length === 0)
  }
}

/** The answer actually used for checking: a fixed key (from "Key was wrong → fix") wins. */
export function effectiveAnswer(q: Question, fixed?: unknown): Question['answer'] {
  return (fixed ?? q.answer) as Question['answer']
}

export function check(q: Question, r: Response | undefined, fixed?: unknown): Verdict {
  const none: Verdict = { correct: false, partial: false, rightChosen: 0, attempted: false }
  if (!r || isEmpty(r)) return none
  const answer = effectiveAnswer(q, fixed)
  const v = (correct: boolean, partial = false, rightChosen = 0): Verdict => ({ correct, partial, rightChosen, attempted: true })

  switch (q.format) {
    case 'single':
      return r.kind === 'options' ? v(r.ids.length === 1 && r.ids[0] === answer) : v(false)
    case 'assertion':
      return r.kind === 'options' ? v(r.ids.length === 1 && r.ids[0] === answer) : v(false)
    case 'multiple': {
      if (r.kind !== 'options') return v(false)
      const key = answer as string[]
      const right = r.ids.filter((id) => key.includes(id)).length
      const wrong = r.ids.length - right
      if (wrong === 0 && right === key.length) return v(true, false, right)
      return v(false, wrong === 0 && right > 0, right)
    }
    case 'integer':
      return r.kind === 'number' ? v(Math.round(r.value) === r.value && r.value === answer) : v(false)
    case 'numerical': {
      if (r.kind !== 'number') return v(false)
      const tol = q.tolerance ?? 0.01
      return v(Math.abs(r.value - (answer as number)) <= tol + 1e-9)
    }
    case 'truefalse':
      return r.kind === 'bool' ? v(r.value === answer) : v(false)
    case 'match': {
      if (r.kind !== 'match') return v(false)
      const key = answer as Record<string, string | string[]>
      const ok = Object.entries(key).every(([l, want]) => sameSet(r.pairs[l] ?? [], Array.isArray(want) ? want : [want]))
      return v(ok)
    }
    case 'ordering':
      return r.kind === 'order' ? v(r.ids.length === (answer as string[]).length && r.ids.every((id, i) => id === (answer as string[])[i])) : v(false)
  }
}

export function score(rule: SchemeRule | undefined, verdict: Verdict): number {
  if (!rule) return verdict.correct ? 1 : 0
  if (!verdict.attempted) return rule.unattempted
  if (verdict.correct) return rule.correct
  if (rule.partial && verdict.partial) return verdict.rightChosen
  return rule.wrong
}

export function ruleFor(scheme: MarkingScheme, format: QuestionFormat): SchemeRule | undefined {
  return scheme.rules[format] ?? scheme.rules.single
}

export function maxMarks(scheme: MarkingScheme, format: QuestionFormat): number {
  return ruleFor(scheme, format)?.correct ?? 1
}

const r = (correct: number, wrong: number, partial = false): SchemeRule => ({ correct, wrong, unattempted: 0, partial })

export const SCHEME_PRESETS: MarkingScheme[] = [
  {
    id: 'ja',
    name: 'JEE Advanced (common pattern)',
    rules: {
      single: r(3, -1),
      assertion: r(3, -1),
      multiple: r(4, -2, true),
      integer: r(4, 0),
      numerical: r(4, 0),
      match: r(3, -1),
      truefalse: r(3, -1),
      ordering: r(3, -1),
    },
  },
  {
    id: 'main',
    name: 'JEE Main',
    rules: { single: r(4, -1), assertion: r(4, -1), multiple: r(4, -1), integer: r(4, -1), numerical: r(4, -1), match: r(4, -1), truefalse: r(4, -1), ordering: r(4, -1) },
  },
  {
    id: 'practice',
    name: 'No negative (+1 / 0)',
    rules: { single: r(1, 0), assertion: r(1, 0), multiple: r(1, 0, false), integer: r(1, 0), numerical: r(1, 0), match: r(1, 0), truefalse: r(1, 0), ordering: r(1, 0) },
  },
]

export function resolveScheme(s: string | MarkingScheme | undefined): MarkingScheme {
  if (s && typeof s === 'object') return s
  return SCHEME_PRESETS.find((p) => p.id === s) ?? SCHEME_PRESETS[0]
}

export const ASSERTION_TEXT: Record<(typeof ASSERTION_CODES)[number], string> = {
  'both-explains': 'Both A and R are true, and R is the correct explanation of A',
  'both-not-explains': 'Both A and R are true, but R is NOT the correct explanation of A',
  'a-only': 'A is true, but R is false',
  'r-only': 'A is false, but R is true',
  neither: 'Both A and R are false',
}

/** The correct answer written out for the result screen. */
export function describeAnswer(q: Question, fixed?: unknown): string {
  const a = effectiveAnswer(q, fixed)
  switch (q.format) {
    case 'single':
      return String(a)
    case 'multiple':
      return (a as string[]).join(', ')
    case 'integer':
    case 'numerical':
      return String(a)
    case 'truefalse':
      return a ? 'True' : 'False'
    case 'assertion':
      return ASSERTION_TEXT[a as (typeof ASSERTION_CODES)[number]]
    case 'match':
      return Object.entries(a as Record<string, string | string[]>)
        .map(([l, rr]) => `${l} → ${Array.isArray(rr) ? rr.join(', ') : rr}`)
        .join('; ')
    case 'ordering': {
      const items = q.format === 'ordering' ? q.items : []
      return (a as string[]).map((id) => items.find((i) => i.id === id)?.text ?? id).join(' → ')
    }
  }
}
