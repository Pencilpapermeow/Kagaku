import { beforeEach, describe, expect, it } from 'vitest'
import { KagakuDB, useDatabase, db } from '../db/db'
import { recordAttempt, streakFrom, localDate } from './progress'
import { setSetting } from '../db/settings'
import type { Question } from '../content/schema'

let n = 0
beforeEach(() => useDatabase(new KagakuDB(`progress-${n++}`)))

const q: Question = { id: 'q1', chapter: 'phy.thermodynamics', format: 'truefalse', stem: 's', answer: true, verified: 'official', tags: [] }
const right = { correct: true, partial: false, rightChosen: 0, attempted: true }
const wrong = { correct: false, partial: false, rightChosen: 0, attempted: true }
const go = (verdict: typeof right) => recordAttempt({ q, qid: q.id, verdict, response: { kind: 'bool', value: verdict.correct }, mode: 'practice', timeMs: 1000 })

describe('Galti Notebook', () => {
  it('adds wrong answers automatically and graduates after N correct in a row', async () => {
    await setSetting('graduateAfter', 3)
    await go(wrong)
    expect((await db.galti.get('q1'))!.status).toBe('active')
    await go(right)
    await go(right)
    await go(wrong) // streak resets
    await go(right)
    await go(right)
    expect((await db.galti.get('q1'))!.streak).toBe(2)
    const r = await go(right)
    expect(r.graduated).toBe(true)
    expect((await db.galti.get('q1'))!.status).toBe('graduated')
    expect((await db.galti.get('q1'))!.wrongCount).toBe(2)
  })
  it('does not add correct answers to Galti', async () => {
    await go(right)
    expect(await db.galti.count()).toBe(0)
    expect((await db.days.get(localDate()))!.answered).toBe(1)
  })
})

describe('streak', () => {
  it('counts consecutive days ending today or yesterday', () => {
    expect(streakFrom(new Set(['2026-10-19', '2026-10-20', '2026-10-21']), '2026-10-21')).toBe(3)
    expect(streakFrom(new Set(['2026-10-19', '2026-10-20']), '2026-10-21')).toBe(2)
    expect(streakFrom(new Set(['2026-10-18']), '2026-10-21')).toBe(0)
    expect(streakFrom(new Set(['2026-02-28', '2026-03-01']), '2026-03-01')).toBe(2)
  })
})
