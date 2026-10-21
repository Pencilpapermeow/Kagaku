import { describe, expect, it } from 'vitest'
import { generateFromTable, generateFromTrend, rememberIdOf } from './generate'
import { makeRng } from './rng'
import { check } from './marking'
import type { Remember } from '../content/schema'

const table: Extract<Remember, { kind: 'table' }> = {
  id: 'r_tab',
  chapter: 'phy.thermodynamics',
  kind: 'table',
  title: 'Processes',
  keyColumn: 'process',
  columns: [
    { key: 'process', label: 'Process', quiz: true },
    { key: 'dU', label: 'dU', quiz: true },
    { key: 'W', label: 'W', quiz: true },
  ],
  rows: [
    { process: 'Isothermal', dU: '0', W: 'nRT ln(V2/V1)' },
    { process: 'Isochoric', dU: 'nCv dT', W: '0' },
    { process: 'Isobaric', dU: 'nCv dT', W: 'P dV' },
    { process: 'Adiabatic', dU: '-W', W: '(P1V1-P2V2)/(g-1)' },
  ],
  verified: 'official',
  tags: [],
}

describe('table generator', () => {
  const qs = generateFromTable(table, makeRng(1))
  it('makes forward, reverse, true/false and match questions', () => {
    const kinds = new Set(qs.map((q) => q.id.split(':')[2]))
    expect([...kinds].sort()).toEqual(['fwd', 'match', 'rev', 'tf'])
  })
  it('draws wrong options from the same column and has one correct answer', () => {
    for (const q of qs.filter((x) => x.format === 'single')) {
      if (q.format !== 'single') continue
      const texts = q.options.map((o) => o.text)
      expect(new Set(texts).size).toBe(texts.length)
      expect(check(q, { kind: 'options', ids: [q.answer] }).correct).toBe(true)
    }
  })
  it('skips reverse questions when the value is not unique (dU = nCv dT twice)', () => {
    const rev = qs.filter((q) => q.id.includes(':rev:') && q.id.endsWith(':dU'))
    expect(rev.map((q) => q.id)).toEqual(['g:r_tab:rev:0:dU', 'g:r_tab:rev:3:dU'])
  })
  it('match answers are consistent', () => {
    const m = qs.find((q) => q.format === 'match')
    if (!m || m.format !== 'match') throw new Error('no match question')
    const pairs = Object.fromEntries(Object.entries(m.answer).map(([k, v]) => [k, [v as string]]))
    expect(check(m, { kind: 'match', pairs }).correct).toBe(true)
  })
})

describe('trend generator', () => {
  const trend: Extract<Remember, { kind: 'trend' }> = {
    id: 'r_tr',
    chapter: 'chem.periodicity',
    kind: 'trend',
    title: 'EN',
    property: 'electronegativity',
    order: ['I', 'Br', 'Cl', 'F'],
    verified: 'official',
    tags: [],
  }
  it('ordering answer follows the asked direction', () => {
    for (let s = 1; s < 20; s++) {
      const [ord] = generateFromTrend(trend, makeRng(s))
      if (ord.format !== 'ordering') throw new Error()
      const text = ord.answer.map((id) => ord.items.find((i) => i.id === id)!.text)
      expect(text).toEqual(ord.stem.includes('decreasing') ? ['F', 'Cl', 'Br', 'I'] : ['I', 'Br', 'Cl', 'F'])
    }
  })
  it('extracts the remember id even when it contains colons', () => {
    expect(rememberIdOf('g:pack:abc:tf:1:W:2')).toBe('pack:abc')
  })
})
