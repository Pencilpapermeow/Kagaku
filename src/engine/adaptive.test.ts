import { beforeEach, describe, expect, it } from 'vitest'
import { levelKey, materialize, missedRows, repeatOf, repeatPosition, startLevel, stepLevel, type LevelState, type Slot } from './adaptive'
import { generateOne, parseGeneratedId } from './generate'
import { makeRng } from './rng'
import type { Verdict } from './marking'
import type { Remember } from '../content/schema'
import { KagakuDB, db, useDatabase } from '../db/db'
import { buildSlots } from './session'

const right: Verdict = { correct: true, partial: false, rightChosen: 0, attempted: true }
const wrong: Verdict = { correct: false, partial: false, rightChosen: 0, attempted: true }
const partial: Verdict = { correct: false, partial: true, rightChosen: 1, attempted: true }
const skipped: Verdict = { correct: false, partial: false, rightChosen: 0, attempted: false }

const run = (s: LevelState, ...vs: Verdict[]) => vs.reduce((st, v) => stepLevel(st, v).next, s)

describe('level rule', () => {
  it('goes up after 2 right in a row', () => {
    const one = stepLevel(startLevel(1), right)
    expect(one.change).toBeUndefined()
    const two = stepLevel(one.next, right)
    expect(two.change).toBe('up')
    expect(two.next.level).toBe(2)
    expect(run(startLevel(1), right, right, right, right, right, right).level).toBe(4)
  })
  it('a wrong answer breaks the run', () => {
    expect(run(startLevel(1), right, wrong, right).level).toBe(1)
  })
  it('stops at level 4', () => {
    expect(run(startLevel(4), right, right, right).level).toBe(4)
  })
  it('goes down after 2 wrong (or skipped) in a row, never below 1', () => {
    expect(run(startLevel(3), wrong, skipped).level).toBe(2)
    expect(run(startLevel(1), wrong, wrong, wrong).level).toBe(1)
  })
  it('a partly right answer holds the level', () => {
    expect(run(startLevel(2), right, partial, right).level).toBe(2)
    expect(run(startLevel(2), wrong, partial, wrong).level).toBe(2)
  })
})

const table: Extract<Remember, { kind: 'table' }> = {
  id: 'r.ions',
  chapter: 'chem.mole-concept',
  kind: 'table',
  title: 'Ions',
  keyColumn: 'ion',
  columns: [
    { key: 'ion', label: 'Ion', quiz: true },
    { key: 'name', label: 'Name', quiz: true },
  ],
  rows: [
    { ion: 'SO4', name: 'Sulphate' },
    { ion: 'SO3', name: 'Sulphite' },
    { ion: 'S2O3', name: 'Thiosulphate' },
    { ion: 'NO3', name: 'Nitrate' },
    { ion: 'NO2', name: 'Nitrite' },
    { ion: 'PO4', name: 'Phosphate' },
  ],
  verified: 'checked',
  tags: [],
}

describe('repetition', () => {
  it('brings back only the pairs he judged wrong', () => {
    for (let s = 1; s < 60; s++) {
      const q = generateOne(table, { level: 3, rng: makeRng(s), format: 'multiple' })
      if (!q || q.format !== 'multiple' || !q.id.includes(':pairs:')) continue
      const notChosen = q.answer[0]
      const missed = missedRows(q, { kind: 'options', ids: q.answer.slice(1) })
      expect(missed).toEqual([Number(notChosen.slice(1))])
      return
    }
    throw new Error('no pairs question made')
  })

  it('brings back only the match rows he got wrong', () => {
    const q = generateOne(table, { level: 2, rng: makeRng(3), format: 'match' })!
    if (q.format !== 'match') throw new Error()
    const pairs = Object.fromEntries(Object.entries(q.answer).map(([k, v]) => [k, [v as string]]))
    pairs.P = ['99']
    expect(missedRows(q, { kind: 'match', pairs })).toEqual([parseGeneratedId(q.id)!.rows[0]])
  })

  it('repeats a missed fact at most twice, in another form', () => {
    const slot: Slot = { type: 'fact', r: table, rows: [0] }
    const q = materialize(slot, 2, makeRng(1))!
    const again = repeatOf(slot, q, undefined)!
    expect(again.type).toBe('fact')
    if (again.type !== 'fact') return
    expect(again.repeat).toBe(1)
    expect(again.avoid).toEqual([parseGeneratedId(q.id)!.kind])
    const q2 = materialize(again, 2, makeRng(2))!
    expect(q2.tags).toContain('repeat')
    const third = repeatOf(again, q2, undefined)!
    expect(repeatOf(third, q2, undefined)).toBeUndefined()
    expect(repeatOf({ type: 'question', q }, q, undefined)).toBeUndefined()
  })

  it('puts the repeat 3–5 questions later', () => {
    for (let s = 1; s < 30; s++) {
      const at = repeatPosition(4, 20, makeRng(s))
      expect(at).toBeGreaterThanOrEqual(7)
      expect(at).toBeLessThanOrEqual(9)
    }
    expect(repeatPosition(18, 20, makeRng(1))).toBe(20)
  })

  it('remembers the level per chapter set', () => {
    expect(levelKey(['b', 'a'])).toBe('a,b')
    expect(levelKey(undefined)).toBe('all')
  })
})

let n = 0
describe('practice slots', () => {
  beforeEach(() => useDatabase(new KagakuDB(`slots-${n++}`)))

  it('"From To Remember" turns rows into facts, made into questions later', async () => {
    await db.remember.put({ ...table, packId: 'p' })
    const slots = await buildSlots({ chapters: ['chem.mole-concept'], mode: 'generated', size: 4, seed: 1 })
    expect(slots).toHaveLength(4)
    for (const s of slots) expect(s.type).toBe('fact')
  })

  it('prefers facts he has not seen yet', async () => {
    await db.remember.put({ ...table, packId: 'p' })
    for (const row of [0, 1, 2, 3]) await db.attempts.add({ qid: `g:r.ions:fwd:${row}:abc`, chapter: 'chem.mole-concept', at: Date.now(), mode: 'practice', correct: true, response: undefined, timeMs: 1 })
    const slots = await buildSlots({ chapters: ['chem.mole-concept'], mode: 'generated', size: 2, seed: 7 })
    const rows = slots.flatMap((s) => (s.type === 'fact' ? s.rows : []))
    expect(rows.sort()).toEqual([4, 5])
  })

  it('keeps only facts that can make the chosen format', async () => {
    await db.remember.put({ ...table, packId: 'p' })
    const slots = await buildSlots({ chapters: ['chem.mole-concept'], mode: 'generated', format: 'match', size: 10, seed: 1 })
    expect(slots.length).toBeGreaterThan(0)
    for (const s of slots) expect(materialize(s, 1, makeRng(1), 'match')!.format).toBe('match')
  })
})
