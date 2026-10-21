import { describe, expect, it } from 'vitest'
import { presentQuestion, NOTA_ID } from './variants'
import { makeRng } from './rng'
import { check } from './marking'
import type { Question } from '../content/schema'

const q: Question = {
  id: 'q',
  chapter: 'phy.thermodynamics',
  format: 'single',
  stem: 's',
  options: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: `opt ${id}` })),
  distractors: [{ text: 'd1' }, { text: 'd2' }, { text: 'd3' }],
  answer: 'B',
  verified: 'official',
  tags: [],
}

describe('practice variants', () => {
  it('always keeps the option count and exactly one correct answer', () => {
    for (let seed = 1; seed < 300; seed++) {
      const v = presentQuestion(q, makeRng(seed), { noneOfTheseRate: 0.3 })
      if (v.format !== 'single') throw new Error('format changed')
      expect(v.options).toHaveLength(4)
      expect(v.options.filter((o) => o.id === v.answer)).toHaveLength(1)
      expect(new Set(v.options.map((o) => o.id)).size).toBe(4)
      if (v.answer === NOTA_ID) expect(v.options.some((o) => o.id === 'B')).toBe(false)
    }
  })
  it('shows "None of these" as a wrong option about as often as a right one', () => {
    let right = 0
    let wrong = 0
    for (let seed = 1; seed < 2000; seed++) {
      const v = presentQuestion(q, makeRng(seed), { noneOfTheseRate: 1 })
      if (v.format !== 'single') continue
      if (v.answer === NOTA_ID) right++
      else if (v.options.some((o) => o.id === NOTA_ID)) wrong++
    }
    expect(right).toBeGreaterThan(800)
    expect(wrong).toBeGreaterThan(800)
  })
  it('never reorders options printed inside a photo', () => {
    const photo: Question = { ...q, optionsInImage: true, image: 'media:x' }
    const v = presentQuestion(photo, makeRng(7), { noneOfTheseRate: 1 })
    expect(v).toBe(photo)
  })
  it('the variant is checked against its own answer', () => {
    const v = presentQuestion(q, makeRng(3), { noneOfTheseRate: 1 })
    if (v.format !== 'single') throw new Error()
    expect(check(v, { kind: 'options', ids: [v.answer] }).correct).toBe(true)
  })
})
