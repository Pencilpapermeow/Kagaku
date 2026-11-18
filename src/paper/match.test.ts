import { describe, expect, it } from 'vitest'
import { parseAnswerKey } from './answerKey'
import type { Detection } from './layout'
import { buildPaper, cbtSections, doubtsOf, keyFor, matchKey } from './match'
import type { KeyEntry, Piece } from './types'
import { check } from '../engine/marking'
import { evaluate } from '../engine/cbt'
import type { TestRow } from '../db/db'

const piece: Piece = { page: 0, box: { x0: 0, y0: 0, x1: 100, y1: 100 } }

function det(over: Partial<Detection>): Detection {
  return { sections: [], questions: [], preamble: '', optionStyle: 'letters', keyPages: [], warnings: [], ...over }
}
const key = (...texts: string[]) => parseAnswerKey(texts.map((text) => ({ text }))).entries

describe('matching the key to the paper', () => {
  const qs = (ns: number[], subjects?: ('phy' | 'chem')[]) => ns.map((n, idx) => ({ idx, n, subject: subjects?.[idx] }))
  const e = (n: number, block = 0, subject?: 'phy' | 'chem'): KeyEntry => ({ n, block, subject, raw: '', answer: { kind: 'letters', letters: ['A'] } })

  it('continuous numbers on both sides', () => {
    const r = matchKey(qs([1, 2, 3]), [e(1), e(2), e(3)])
    expect(r.mode).toBe('number')
    expect([...r.byQuestion.keys()]).toEqual([0, 1, 2])
  })
  it('both restart per subject, key has subject headings', () => {
    const r = matchKey(qs([1, 2, 1, 2], ['phy', 'phy', 'chem', 'chem']), [e(1, 0, 'phy'), e(2, 0, 'phy'), e(1, 1, 'chem'), e(2, 1, 'chem')])
    expect(r.mode).toBe('subject+number')
    expect(r.byQuestion.get(2)?.subject).toBe('chem')
  })
  it('both restart, key without subjects: blocks in order', () => {
    const r = matchKey(qs([1, 2, 1, 2]), [e(1, 0), e(2, 0), e(1, 1), e(2, 1)])
    expect(r.mode).toBe('block+number')
    expect(r.byQuestion.get(3)?.block).toBe(1)
  })
  it('paper restarts, key is continuous: by position', () => {
    const r = matchKey(qs([1, 2, 1, 2]), [e(1), e(2), e(3), e(4)])
    expect(r.mode).toBe('position')
    expect(r.byQuestion.get(2)?.n).toBe(3)
  })
  it('paper continuous, key restarts: offset by block', () => {
    const r = matchKey(qs([1, 2, 3, 4]), [e(1, 0), e(2, 0), e(1, 1), e(2, 1)])
    expect(r.mode).toBe('offset')
    expect(r.byQuestion.get(3)?.block).toBe(1)
  })
})

describe('key answers in the shape each type needs', () => {
  it('letters for single, multiple, "either"', () => {
    expect(keyFor({ kind: 'letters', letters: ['B'] }, 'single', 'letters', 4).key?.answer).toBe('B')
    expect(keyFor({ kind: 'letters', letters: ['A', 'C'] }, 'multiple', 'letters', 4).key?.answer).toEqual(['A', 'C'])
    expect(keyFor({ kind: 'letters', letters: ['B'] }, 'multiple', 'letters', 4).key?.answer).toEqual(['B'])
    expect(keyFor({ kind: 'letters', letters: ['A', 'C'], either: true }, 'single', 'letters', 4).key).toMatchObject({ answer: 'A', accept: ['C'] })
    const two = keyFor({ kind: 'letters', letters: ['A', 'C'] }, 'single', 'letters', 4)
    expect(two.note).toMatch(/several options/)
  })
  it('(1)–(4) options: "(3)" is option 3; a letter key maps A→1', () => {
    expect(keyFor({ kind: 'number', value: 3, paren: true }, 'single', 'numbers', 4).key?.answer).toBe('3')
    expect(keyFor({ kind: 'letters', letters: ['D'] }, 'single', 'numbers', 4).key?.answer).toBe('4')
  })
  it('numbers, ranges and bonus', () => {
    expect(keyFor({ kind: 'number', value: 36, paren: true }, 'integer', 'numbers', 4).key?.answer).toBe(36)
    expect(keyFor({ kind: 'range', min: 2.5, max: 2.7 }, 'numerical', 'letters', 4).key).toMatchObject({ answer: 2.6, tolerance: 0.1 })
    expect(keyFor({ kind: 'number', value: 2.5 }, 'numerical', 'letters', 4).key).toMatchObject({ answer: 2.5, tolerance: 0.01 })
    expect(keyFor({ kind: 'bonus' }, 'single', 'letters', 4).key?.bonus).toBe(true)
  })
  it('a key that does not fit the type is flagged, never guessed', () => {
    expect(keyFor({ kind: 'letters', letters: ['B'] }, 'integer', 'letters', 4)).toEqual({ note: expect.stringMatching(/option/) })
    expect(keyFor({ kind: 'number', value: 2.5 }, 'integer', 'letters', 4).note).toMatch(/whole number/)
    expect(keyFor({ kind: 'number', value: 7 }, 'single', 'letters', 4).note).toMatch(/isn't an option/)
  })
})

describe('building a paper', () => {
  const d = det({
    sections: [
      { name: 'Physics', subject: 'phy', format: 'single', typeFrom: 'instructions', note: '' },
      { name: 'Physics · Integer', subject: 'phy', format: 'integer', typeFrom: 'instructions', note: '' },
      { name: 'Chemistry', subject: 'chem', typeFrom: 'default', note: '' },
    ],
    questions: [
      { n: 1, section: 0, pieces: [piece] },
      { n: 2, section: 0, pieces: [piece] },
      { n: 3, section: 1, pieces: [piece] },
      { n: 4, section: 2, pieces: [piece] },
      { n: 6, section: 2, pieces: [piece] },
    ],
    preambleMarks: { correct: 4, wrong: -1 },
  })

  it('keys every question, adds a placeholder for one the paper reading missed, infers an unstated type', () => {
    const b = buildPaper(d, key('1. B 2. A or C 3. 12 4. AC 5. D 6. BD 20. A'))
    expect(b.questions.map((q) => `${q.n}:${q.format}:${JSON.stringify(q.key?.answer)}`)).toEqual(['1:single:"B"', '2:single:"A"', '3:integer:12', '4:multiple:["A","C"]', '5:multiple:["D"]', '6:multiple:["B","D"]'])
    expect(b.questions[4].pieces).toEqual([])
    expect(doubtsOf({ optionStyle: 'letters' }, b.questions[4])).toEqual(['Not found on the paper — draw its box'])
    expect(b.sections[2]).toMatchObject({ format: 'multiple', typeFrom: 'key' })
    expect(b.sections[0].rule).toMatchObject({ correct: 4, wrong: -1 })
    expect(b.warnings.join(' ')).toMatch(/Q20/)
  })

  it('a missing key answer is a doubt', () => {
    const b = buildPaper(d, key('1. B 2. A 3. 12 4. AC'))
    expect(doubtsOf({ optionStyle: 'letters' }, b.questions[4])).toEqual(['No answer in the key'])
  })

  it('becomes CBT sections per subject and scores like the real thing', () => {
    const b = buildPaper(d, key('1. B 2. A or C 3. 12 4. AC 5. D 6. Bonus'))
    const paper = { id: 'x', title: 'Mock', optionStyle: 'letters' as const, sections: b.sections, questions: b.questions.map((q) => ({ ...q, image: 'media:abc' })) }
    const secs = cbtSections(paper)
    // Q5 has no box, so it can't be in the test.
    expect(secs.map((s) => `${s.name}:${s.questions.length}`)).toEqual(['Physics:3', 'Chemistry:2'])
    expect(secs[0].scheme.rules.integer).toMatchObject({ correct: 4, wrong: -1 })
    const [q1, q2] = secs[0].questions
    expect(q1.id).toBe('p:x:1')
    expect(check(q2, { kind: 'options', ids: ['C'] }).correct).toBe(true)
    // The bonus question gives full marks even unattempted.
    const t = { sections: secs.map((s) => ({ name: s.name, qids: s.questions.map((q) => q.id), scheme: s.scheme })), responses: { 'p:x:1': { answer: { kind: 'options', ids: ['B'] }, marked: false, visited: true, timeMs: 1 } } } as unknown as TestRow
    const map = new Map(secs.flatMap((s) => s.questions).map((q) => [q.id, q]))
    const r = evaluate(t, map)
    const byNo = (n: number) => r.perQuestion.find((x) => map.get(x.qid)?.source?.qno === String(n))
    expect(byNo(6)?.marks).toBe(4)
    expect(byNo(1)?.marks).toBe(4)
    expect(byNo(2)?.marks).toBe(0)
    expect(r.total).toBe(8)
  })
})
