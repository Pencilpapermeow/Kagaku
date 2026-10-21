import { describe, expect, it } from 'vitest'
import { check, resolveScheme, ruleFor, score } from './marking'
import type { Question } from '../content/schema'

const multi: Question = {
  id: 'm',
  chapter: 'phy.thermodynamics',
  format: 'multiple',
  stem: 's',
  options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: id })),
  answer: ['A', 'B', 'C'],
  verified: 'official',
  tags: [],
}

describe('JEE Advanced multiple-correct partial marking', () => {
  const rule = ruleFor(resolveScheme('ja'), 'multiple')
  const marks = (ids: string[]) => score(rule, check(multi, { kind: 'options', ids }))
  it('gives full marks only for exactly the right set', () => expect(marks(['A', 'B', 'C'])).toBe(4))
  it('gives +1 per correct option when no wrong one is chosen', () => {
    expect(marks(['A', 'B'])).toBe(2)
    expect(marks(['C'])).toBe(1)
  })
  it('gives the negative mark if any wrong option is chosen', () => expect(marks(['A', 'D'])).toBe(-2))
  it('gives zero when unattempted', () => expect(marks([])).toBe(0))
})

describe('answer checking', () => {
  const base = { id: 'x', chapter: 'phy.thermodynamics', stem: 's', verified: 'official' as const, tags: [] }
  it('numerical uses tolerance (default 0.01)', () => {
    const q: Question = { ...base, format: 'numerical', answer: 0.5 }
    expect(check(q, { kind: 'number', value: 0.505 }).correct).toBe(true)
    expect(check(q, { kind: 'number', value: 0.52 }).correct).toBe(false)
  })
  it('integer needs an exact integer', () => {
    const q: Question = { ...base, format: 'integer', answer: 3 }
    expect(check(q, { kind: 'number', value: 3 }).correct).toBe(true)
    expect(check(q, { kind: 'number', value: 3.2 }).correct).toBe(false)
  })
  it('match checks every row, including multi-column rows', () => {
    const q: Question = {
      ...base,
      format: 'match',
      left: [{ id: 'P', text: 'p' }, { id: 'Q', text: 'q' }],
      right: [{ id: '1', text: '1' }, { id: '2', text: '2' }, { id: '3', text: '3' }],
      answer: { P: ['1', '3'], Q: '2' },
    }
    expect(check(q, { kind: 'match', pairs: { P: ['3', '1'], Q: ['2'] } }).correct).toBe(true)
    expect(check(q, { kind: 'match', pairs: { P: ['1'], Q: ['2'] } }).correct).toBe(false)
  })
  it('a fixed key overrides the pack answer', () => {
    const q: Question = { ...base, format: 'truefalse', answer: true }
    expect(check(q, { kind: 'bool', value: false }, false).correct).toBe(true)
  })
})
