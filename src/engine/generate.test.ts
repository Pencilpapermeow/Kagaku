import { describe, expect, it } from 'vitest'
import { factsOf, generateFrom, generateOne, levelOf, parseGeneratedId, rememberIdOf, type Level } from './generate'
import { makeRng } from './rng'
import { check, type Response } from './marking'
import { chargeOf, numberOf, plain, similarity } from './similar'
import type { Question, Remember } from '../content/schema'

type Table = Extract<Remember, { kind: 'table' }>
type Trend = Extract<Remember, { kind: 'trend' }>

const anions: Table = {
  id: 'chem.mole.anions',
  chapter: 'chem.mole-concept',
  kind: 'table',
  title: 'Common anions',
  keyColumn: 'ion',
  columns: [
    { key: 'ion', label: 'Anion', quiz: true },
    { key: 'name', label: 'Name', quiz: true },
    { key: 'charge', label: 'Charge', quiz: true },
  ],
  rows: [
    { ion: '\\ce{SO4^2-}', name: 'Sulphate', charge: '−2' },
    { ion: '\\ce{SO3^2-}', name: 'Sulphite', charge: '−2' },
    { ion: '\\ce{S2O3^2-}', name: 'Thiosulphate', charge: '−2' },
    { ion: '\\ce{HSO4-}', name: 'Bisulphate', charge: '−1' },
    { ion: '\\ce{NO3-}', name: 'Nitrate', charge: '−1' },
    { ion: '\\ce{NO2-}', name: 'Nitrite', charge: '−1' },
    { ion: '\\ce{PO4^3-}', name: 'Phosphate', charge: '−3' },
    { ion: '\\ce{Cl-}', name: 'Chloride', charge: '−1' },
    { ion: '\\ce{OH-}', name: 'Hydroxide', charge: '−1' },
  ],
  verified: 'checked',
  tags: [],
}

const elements: Table = {
  id: 'chem.per.elements',
  chapter: 'chem.periodicity',
  kind: 'table',
  title: 'Elements',
  keyColumn: 'el',
  columns: [
    { key: 'el', label: 'Element', quiz: true },
    { key: 'sym', label: 'Symbol', quiz: true },
    { key: 'z', label: 'Atomic number Z', quiz: true },
    { key: 'block', label: 'Block', quiz: true },
    { key: 'why', label: 'Remark', quiz: false },
  ],
  rows: [
    { el: 'Iron', sym: 'Fe', z: '26', block: 'd', why: 'Most used metal' },
    { el: 'Cobalt', sym: 'Co', z: '27', block: 'd', why: '' },
    { el: 'Nickel', sym: 'Ni', z: '28', block: 'd', why: '' },
    { el: 'Copper', sym: 'Cu', z: '29', block: 'd', why: 'Exception: 3d¹⁰ 4s¹' },
    { el: 'Sodium', sym: 'Na', z: '11', block: 's', why: '' },
    { el: 'Magnesium', sym: 'Mg', z: '12', block: 's', why: '' },
    { el: 'Chlorine', sym: 'Cl', z: '17', block: 'p', why: '' },
    { el: 'Argon', sym: 'Ar', z: '18', block: 'p', why: '' },
    { el: 'Hydrogen', sym: 'H', z: '1', block: 's', why: '' },
    { el: 'Uranium', sym: 'U', z: '92', block: 'f', why: '' },
  ],
  verified: 'checked',
  tags: [],
}

const ie: Trend = {
  id: 'chem.per.ie2',
  chapter: 'chem.periodicity',
  kind: 'trend',
  title: 'IE across period 2',
  property: 'first ionisation enthalpy',
  order: ['Li', 'B', 'Be', 'C', 'O', 'N', 'F', 'Ne'],
  basis: 'Zeff rises across the period.',
  exceptions: 'Be > B and N > O.',
  verified: 'checked',
  tags: [],
}

/** A response that should be marked fully correct for this question. */
function rightResponse(q: Question): Response {
  switch (q.format) {
    case 'single':
    case 'assertion':
      return { kind: 'options', ids: [q.answer as string] }
    case 'multiple':
      return { kind: 'options', ids: q.answer }
    case 'integer':
    case 'numerical':
      return { kind: 'number', value: q.answer }
    case 'truefalse':
      return { kind: 'bool', value: q.answer }
    case 'match':
      return { kind: 'match', pairs: Object.fromEntries(Object.entries(q.answer).map(([k, v]) => [k, Array.isArray(v) ? v : [v]])) }
    case 'ordering':
      return { kind: 'order', ids: q.answer }
  }
}

function many(r: Remember, level: Level, n = 120, seed = 1): Question[] {
  const rng = makeRng(seed)
  const out: Question[] = []
  for (let i = 0; i < n; i++) {
    const q = generateOne(r, { level, rng })
    if (q) out.push(q)
  }
  return out
}

describe('look-alike measures', () => {
  it('reads formulas and charges', () => {
    expect(plain('\\ce{SO4^2-}')).toBe('so42-')
    expect(numberOf('−2')).toBe(-2)
    expect(numberOf('2−')).toBe(-2)
    expect(numberOf('+8/3')).toBeCloseTo(8 / 3)
    expect(numberOf('10⁵ Pa')).toBeUndefined()
    expect(chargeOf('\\ce{SO4^2-}')).toBe(-2)
    expect(chargeOf('\\ce{Na+}')).toBe(1)
    expect(chargeOf('Fe³⁺')).toBe(3)
    expect(chargeOf('\\ce{[Fe(CN)6]^4-}')).toBe(-4)
    expect(chargeOf('Iron')).toBeUndefined()
  })
  it('finds sulphite more like sulphate than chloride', () => {
    expect(similarity('\\ce{SO4^2-}', '\\ce{SO3^2-}')).toBeGreaterThan(similarity('\\ce{SO4^2-}', '\\ce{Cl-}'))
    expect(similarity('Sulphate', 'Sulphite')).toBeGreaterThan(similarity('Sulphate', 'Hydroxide'))
    expect(similarity('26', '27')).toBeGreaterThan(similarity('26', '92'))
  })
})

describe('table questions', () => {
  it('every level gives valid questions whose own key marks as correct', () => {
    for (const t of [anions, elements]) {
      for (const level of [1, 2, 3, 4] as Level[]) {
        const qs = many(t, level)
        expect(qs.length).toBeGreaterThan(100)
        for (const q of qs) {
          expect(check(q, rightResponse(q)).correct, q.id).toBe(true)
          expect(levelOf(q)).toBeDefined()
          expect(q.solution, q.id).toBeTruthy()
          if (q.format === 'single' || q.format === 'multiple') {
            const texts = q.options.map((o) => plain(o.text ?? ''))
            expect(new Set(texts).size, q.id).toBe(texts.length)
            const key = Array.isArray(q.answer) ? q.answer : [q.answer]
            expect(key.length).toBeGreaterThan(0)
            for (const id of key) expect(q.options.some((o) => o.id === id)).toBe(true)
          }
        }
      }
    }
  })

  it('never asks what the question already shows (charge of SO₄²⁻)', () => {
    for (const level of [1, 2, 3, 4] as Level[])
      for (const q of many(anions, level)) {
        expect(q.stem).not.toContain('Charge')
        if (q.format === 'multiple' || q.format === 'single') for (const o of q.options) expect(o.text).not.toMatch(/^Charge:|^−\d$/)
      }
  })

  it('harder levels use closer wrong options', () => {
    const spread = (level: Level) => {
      const qs = many(elements, level, 400, 3).filter((q) => q.format === 'single' && q.stem.includes('→ Atomic number Z?'))
      let total = 0
      let count = 0
      for (const q of qs) {
        if (q.format !== 'single') continue
        const right = Number(q.options.find((o) => o.id === q.answer)!.text)
        for (const o of q.options) if (o.id !== q.answer) (total += Math.abs(Number(o.text) - right)), count++
      }
      return total / count
    }
    expect(spread(3)).toBeLessThan(spread(1))
  })

  it('makes multiple-correct questions from level 2 up', () => {
    const kinds = new Set<string>()
    for (const level of [2, 3, 4] as Level[])
      for (const q of [...many(elements, level), ...many(anions, level)]) if (q.format === 'multiple') kinds.add(parseGeneratedId(q.id)!.kind)
    expect([...kinds].sort()).toEqual(['pairs', 'stmts', 'which'])
  })

  it('"which of these" only asks about values shared by several rows', () => {
    for (const q of many(elements, 2, 300)) {
      if (!q.id.includes(':which:') || q.format !== 'multiple') continue
      expect(q.stem).toMatch(/Block = (d|s|p)/)
    }
  })

  it('boss level asks for typed numbers', () => {
    const typed = many(elements, 4, 200).filter((q) => q.format === 'integer')
    expect(typed.length).toBeGreaterThan(5)
    for (const q of typed) if (q.format === 'integer') expect(Number.isInteger(q.answer)).toBe(true)
  })

  it('explains the right row and what the look-alikes are', () => {
    const q = generateOne(anions, { level: 3, rng: makeRng(5), rows: [0], format: 'single' })!
    expect(q.solution).toContain('Sulphate')
    expect(q.solution).toMatch(/Other options belong to|Others:/)
  })

  it('asks about the rows it is told to (repeats of a missed fact)', () => {
    for (let s = 1; s < 40; s++) {
      const q = generateOne(elements, { level: 3, rng: makeRng(s), rows: [3] })!
      expect(parseGeneratedId(q.id)!.rows).toContain(3)
    }
  })

  it('respects a format filter', () => {
    for (let s = 1; s < 20; s++) expect(generateOne(elements, { level: 1, rng: makeRng(s), format: 'match' })!.format).toBe('match')
  })

  it('gives the same id to the same question', () => {
    const a = generateOne(elements, { level: 2, rng: makeRng(9) })!
    const b = generateOne(elements, { level: 2, rng: makeRng(9) })!
    expect(a.id).toBe(b.id)
    expect(a.id).toMatch(/^g:chem\.per\.elements:[a-z]+:[0-9-]+:[0-9a-z]+$/)
  })

  it('lists one fact per usable row', () => {
    expect(factsOf(elements)).toHaveLength(10)
    expect(factsOf(ie)).toHaveLength(1)
    expect(generateFrom(elements, makeRng(1)).length).toBe(10)
  })
})

describe('trend questions', () => {
  const pos = (x: string) => ie.order.indexOf(x)
  it('every level gives valid questions', () => {
    for (const level of [1, 2, 3, 4] as Level[]) {
      for (const q of many(ie, level, 60)) {
        expect(check(q, rightResponse(q)).correct, q.id).toBe(true)
        expect(q.solution).toContain('Be > B')
      }
    }
  })
  it('ordering answer follows the asked direction', () => {
    for (const q of many(ie, 2, 80)) {
      if (q.format !== 'ordering') continue
      const texts = q.answer.map((id) => q.items.find((i) => i.id === id)!.text!)
      const sorted = [...texts].sort((a, b) => pos(a) - pos(b))
      expect(texts).toEqual(q.stem.includes('decreasing') ? sorted.reverse() : sorted)
    }
  })
  it('comparison statements are judged by the trend', () => {
    let seen = 0
    for (const q of many(ie, 3, 80)) {
      if (q.format !== 'multiple') continue
      seen++
      for (const o of q.options) {
        const [a, b] = o.text!.split(' > ')
        expect(q.answer.includes(o.id)).toBe(pos(a) > pos(b))
      }
    }
    expect(seen).toBeGreaterThan(5)
  })
  it('"correct order" has exactly one right option', () => {
    for (const q of many(ie, 4, 80)) {
      if (q.format !== 'single' || !q.id.includes(':corder:')) continue
      const right = q.options.find((o) => o.id === q.answer)!.text!
      const sep = right.includes(' < ') ? ' < ' : ' > '
      const seq = right.split(sep).map(pos)
      for (let i = 1; i < seq.length; i++) expect(sep === ' < ' ? seq[i] > seq[i - 1] : seq[i] < seq[i - 1]).toBe(true)
      expect(new Set(q.options.map((o) => o.text)).size).toBe(4)
    }
  })
})

describe('generated ids', () => {
  it('reads new ids, including remember ids with colons', () => {
    expect(parseGeneratedId('g:pack:abc:pairs:3-7-9-1:k2j9x')).toEqual({ rid: 'pack:abc', kind: 'pairs', rows: [3, 7, 9, 1] })
    expect(parseGeneratedId('g:t.1:cmp:t:zz')).toEqual({ rid: 't.1', kind: 'cmp', rows: [] })
  })
  it('still reads ids from v0.1 (kept in Galti snapshots)', () => {
    expect(rememberIdOf('g:pack:abc:tf:1:W:2')).toBe('pack:abc')
    expect(parseGeneratedId('g:r_tab:fwd:3:dU')).toEqual({ rid: 'r_tab', kind: 'fwd', rows: [3] })
    expect(parseGeneratedId('g:r_tab:match:W:0-2-3-1')?.rows).toEqual([0, 2, 3, 1])
    expect(parseGeneratedId('g:r_tr:order:dec')).toEqual({ rid: 'r_tr', kind: 'order', rows: [] })
  })
})
