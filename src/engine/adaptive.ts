// Adaptive practice for "To Remember" questions.
//
//  - Level: 2 right in a row → one level harder; 2 wrong (or skipped) in a row → one level easier.
//    A partly-right answer keeps the level. Only questions made from To Remember count.
//  - Repetition: a fact he gets wrong comes back 3–5 questions later, asked a different way,
//    up to twice per session. For table questions only the rows he actually got wrong come back.
//  - Questions are made when their turn comes, so they always use the level reached by then.

import type { Question, QuestionFormat, Remember } from '../content/schema'
import { generateOne, isGeneratedId, MAX_LEVEL, parseGeneratedId, type Level } from './generate'
import type { Response, Verdict } from './marking'
import type { Rng } from './rng'

export const LEVEL_UP_AFTER = 2
export const LEVEL_DOWN_AFTER = 2
export const MAX_REPEATS = 2

/** One place in a practice session: a stored question, or a fact asked about when reached. */
export type Slot = { type: 'question'; q: Question } | { type: 'fact'; r: Remember; rows: number[]; repeat?: number; avoid?: string[] }

export interface LevelState {
  level: Level
  rightRun: number
  wrongRun: number
}

export const startLevel = (level: Level): LevelState => ({ level, rightRun: 0, wrongRun: 0 })

export function stepLevel(s: LevelState, v: Verdict): { next: LevelState; change?: 'up' | 'down' } {
  if (v.correct) {
    const run = s.rightRun + 1
    if (run >= LEVEL_UP_AFTER && s.level < MAX_LEVEL) return { next: startLevel((s.level + 1) as Level), change: 'up' }
    return { next: { ...s, rightRun: Math.min(run, LEVEL_UP_AFTER), wrongRun: 0 } }
  }
  if (v.partial) return { next: { ...s, rightRun: 0, wrongRun: 0 } }
  const run = s.wrongRun + 1
  if (run >= LEVEL_DOWN_AFTER && s.level > 1) return { next: startLevel((s.level - 1) as Level), change: 'down' }
  return { next: { ...s, wrongRun: Math.min(run, LEVEL_DOWN_AFTER), rightRun: 0 } }
}

/** The question for a slot, at the given level. Undefined if the fact can't make one. */
export function materialize(slot: Slot, level: Level, rng: Rng, format?: QuestionFormat): Question | undefined {
  if (slot.type === 'question') return slot.q
  const q = generateOne(slot.r, { level, rng, rows: slot.rows.length ? slot.rows : undefined, avoid: slot.avoid, format })
  if (q && slot.repeat) return { ...q, tags: [...q.tags, 'repeat'] }
  return q
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

/** Table rows he got wrong in a generated question (all its rows if that can't be told). */
export function missedRows(q: Question, r: Response | undefined): number[] {
  const info = parseGeneratedId(q.id)
  if (!info) return []
  if (info.rows.length <= 1) return info.rows
  if (q.format === 'multiple' && q.options.every((o) => /^r\d+$/.test(o.id))) {
    const chosen = r?.kind === 'options' ? r.ids : []
    const key = q.answer
    const wrong = q.options.filter((o) => chosen.includes(o.id) !== key.includes(o.id)).map((o) => Number(o.id.slice(1)))
    return wrong.length ? wrong : info.rows
  }
  if (q.format === 'match' && q.left.length === info.rows.length) {
    const pairs = r?.kind === 'match' ? r.pairs : {}
    const wrong = q.left
      .map((l, i) => ({ l, row: info.rows[i] }))
      .filter(({ l }) => {
        const want = q.answer[l.id]
        return !sameSet(pairs[l.id] ?? [], Array.isArray(want) ? want : [want])
      })
      .map((x) => x.row)
    return wrong.length ? wrong : info.rows
  }
  return info.rows
}

/** The slot that brings a missed fact back, or undefined (not generated, or repeated enough). */
export function repeatOf(slot: Slot, q: Question, r: Response | undefined): Slot | undefined {
  if (slot.type !== 'fact' || !isGeneratedId(q.id)) return
  const repeat = (slot.repeat ?? 0) + 1
  if (repeat > MAX_REPEATS) return
  const info = parseGeneratedId(q.id)
  return { type: 'fact', r: slot.r, rows: missedRows(q, r), repeat, avoid: info ? [info.kind] : undefined }
}

/** Where the repeat goes: 3–5 questions after the current one (or at the end). */
export function repeatPosition(current: number, length: number, rng: Rng): number {
  return Math.min(length, current + 3 + Math.floor(rng() * 3))
}

/** Key under which the reached level is remembered (per chapter, or chapter set). */
export function levelKey(chapters: string[] | undefined): string {
  return chapters?.length ? [...chapters].sort().join(',') : 'all'
}
