import { describe, expect, it } from 'vitest'
import { keyAnswerText, keyLinesOf, parseAnswerKey, type KeyLine } from './answerKey'

const L = (...texts: string[]): KeyLine[] => texts.map((text) => ({ text }))
const answers = (lines: KeyLine[], strict = false) => parseAnswerKey(lines, { strict }).entries.map((e) => `${e.n}:${keyAnswerText(e.answer)}`)

/** Words with x positions, as OCR or a PDF text layer gives them. */
function row(...cells: [number, string][]): KeyLine {
  return { text: cells.map((c) => c[1]).join(' '), words: cells.map(([x, t]) => ({ text: t, x0: x, x1: x + t.length * 8 })) }
}

describe('answer key: one answer per line', () => {
  it.each([
    ['1. (A)', '1:A'],
    ['1-A', '1:A'],
    ['1 - A', '1:A'],
    ['Q1 A', '1:A'],
    ['Q.1 A', '1:A'],
    ['Q 1 (B)', '1:B'],
    ['1.(C)', '1:C'],
    ['1. (A,C)', '1:A, C'],
    ['1. (A, C)', '1:A, C'],
    ['1. ACD', '1:A, C, D'],
    ['1. (A) (C)', '1:A, C'],
    ['1. A, B, D', '1:A, B, D'],
    ['1. 25', '1:25'],
    ['1. 2.50', '1:2.5'],
    ['1. 2.50 to 2.70', '1:2.5–2.7'],
    ['1. 2.50–2.70', '1:2.5–2.7'],
    ['1. 2.50 - 2.70', '1:2.5–2.7'],
    ['1. [2.50, 2.70]', '1:2.5–2.7'],
    ['1. Bonus', '1:Bonus'],
    ['1. BONUS', '1:Bonus'],
    ['1. Dropped', '1:Bonus'],
    ['1. A or C', '1:A or C'],
    ['1. (A) or (C)', '1:A or C'],
    ['1. (4)', '1:4'],
    ['1. (900)', '1:900'],
    ['1. -3', '1:-3'],
    ['1. (a)', '1:A'],
  ])('%s', (text, want) => {
    expect(answers(L(text))).toEqual([want])
  })

  it('keeps the "paren" mark on (4) and the "either" mark on A or C', () => {
    const [a, b] = parseAnswerKey(L('1. (4)', '2. A or C')).entries
    expect(a.answer).toEqual({ kind: 'number', value: 4, paren: true })
    expect(b.answer).toEqual({ kind: 'letters', letters: ['A', 'C'], either: true })
  })
})

describe('answer key: several answers on a line', () => {
  it('reads "1. (A) 2. (B,C) 3. 25 4. 2.50 to 2.70"', () => {
    expect(answers(L('1. (A) 2. (B,C) 3. 25 4. 2.50 to 2.70'))).toEqual(['1:A', '2:B, C', '3:25', '4:2.5–2.7'])
  })
  it('reads pairs without punctuation, groups side by side: "1 A 19 C 37 B"', () => {
    expect(answers(L('Q.No Ans Q.No Ans Q.No Ans', '1 A 19 C 37 B', '2 D 20 AB 38 7'))).toEqual(['1:A', '2:D', '19:C', '20:A, B', '37:B', '38:7'])
  })
  it('does not take a decimal for a question number', () => {
    expect(answers(L('11. 12.50 12. 3'))).toEqual(['11:12.5', '12:3'])
  })
})

describe('answer key: grid tables', () => {
  it('Q.No row over an Ans row (plain text, same count)', () => {
    expect(answers(L('Q.No. 1 2 3 4 5', 'Ans. A C B D AC'))).toEqual(['1:A', '2:C', '3:B', '4:D', '5:A, C'])
  })
  it('two grid groups, with positions; a blank cell stays empty', () => {
    const lines = [
      row([0, 'Que.'], [100, '1'], [160, '2'], [220, '3'], [280, '4']),
      row([0, 'Ans.'], [100, 'B'], [220, 'A,D'], [280, '2.5']),
      row([0, 'Que.'], [100, '5'], [160, '6'], [220, '7'], [280, '8']),
      row([0, 'Ans.'], [100, 'Bonus'], [160, '12'], [220, '(C)'], [270, '1.2'], [300, 'to'], [320, '1.4']),
    ]
    expect(answers(lines)).toEqual(['1:B', '3:A, D', '4:2.5', '5:Bonus', '6:12', '7:C', '8:1.2–1.4'])
  })
})

describe('answer key: subjects', () => {
  it('headings split a key whose numbers restart', () => {
    const { entries } = parseAnswerKey(L('PHYSICS', '1. A 2. B', 'CHEMISTRY', '1. C 2. D', 'MATHEMATICS', '1. 5 2. 6'))
    expect(entries.map((e) => `${e.subject}${e.block}:${e.n}`)).toEqual(['phy0:1', 'phy0:2', 'chem1:1', 'chem1:2', 'math2:1', 'math2:2'])
  })
  it('restarting numbers without headings start a new block', () => {
    const { entries } = parseAnswerKey(L('1. A 2. B 3. C', '1. D 2. A'))
    expect(entries.map((e) => `${e.block}:${e.n}`)).toEqual(['0:1', '0:2', '0:3', '1:1', '1:2'])
  })
  it('subject columns side by side (the AITS answer-key page)', () => {
    const lines = [
      row([240, 'ANSWER'], [320, 'KEY']),
      row([28, 'PHYSICS'], [220, 'CHEMISTRY'], [411, 'MATHEMATICS']),
      row([28, '1.'], [55, '(4)'], [220, '26.'], [248, '(2)'], [411, '51.'], [440, '(3)']),
      row([28, '2.'], [55, '(1)'], [220, '27.'], [248, '(4)'], [411, '52.'], [440, '(1)']),
    ]
    const { entries } = parseAnswerKey(lines)
    expect(entries.map((e) => `${e.subject}:${e.n}=${keyAnswerText(e.answer)}`)).toEqual(['phy:1=4', 'phy:2=1', 'chem:26=2', 'chem:27=4', 'math:51=3', 'math:52=1'])
  })
})

describe('answer key: what to read', () => {
  it('stops at a Solutions heading and resumes at the next key', () => {
    expect(answers(L('ANSWER KEY', '1. A 2. B', 'HINTS & SOLUTIONS', '1. Since 2 = 3 the answer is A', '5. C'))).toEqual(['1:A', '2:B'])
  })
  it('on key pages, reads from the ANSWER KEY heading and skips solution pages', () => {
    const pages = [L('Test-04 DURATION : 180 Minutes', 'ANSWER KEY', '1. (4) 26. (2)', '2. (1) 27. (4)'), L('SECTION-I (PHYSICS)', '1. (4)', 'The guided bar gives both wires the same', 'extension x. Their stiffnesses are 2 and 3')]
    const sel = keyLinesOf(pages)
    expect(sel.strict).toBe(false)
    expect(answers(sel.lines)).toEqual(['1:4', '2:1', '26:2', '27:4'])
  })
  it('without a key page, reads only answers printed at the start of each solution', () => {
    const pages = [L('1. (B) Using v = u + at we get 2 m/s', 'then 3 4 5 6 more numbers', '2. (C,D)', 'Energy 12 J, so 40 J total')]
    const sel = keyLinesOf(pages)
    expect(sel.strict).toBe(true)
    expect(answers(sel.lines, true)).toEqual(['1:B', '2:C, D'])
  })
  it('the same question twice keeps the first and says so when they differ', () => {
    const r = parseAnswerKey(L('1. A', '1. B'))
    expect(r.entries.map((e) => keyAnswerText(e.answer))).toEqual(['A', 'B'])
    const r2 = parseAnswerKey(L('PHYSICS', '1. A', '1. B'))
    expect(r2.entries.map((e) => keyAnswerText(e.answer))).toEqual(['A'])
    expect(r2.warnings[0]).toMatch(/twice/)
  })
})

describe('answer key: JA Paper 1 and Paper 2', () => {
  it('tags answers with their paper, so numbers can repeat', () => {
    const { entries } = parseAnswerKey(L('PAPER-1 ANSWER KEY', 'PHYSICS', '1. (C) 2. (A,B)', 'PAPER-2 ANSWER KEY', 'PHYSICS', '1. (A) 2. (0.50)'))
    expect(entries.map((e) => `P${e.paper}:${e.n}=${keyAnswerText(e.answer)}`)).toEqual(['P1:1=C', 'P1:2=A, B', 'P2:1=A', 'P2:2=0.5'])
  })
  it('reads the paper number in titles and file names', async () => {
    const { paperNumberIn } = await import('./answerKey')
    expect(paperNumberIn('JEE (Advanced) 2024 Paper 2')).toBe(2)
    expect(paperNumberIn('AITS_05_Advanced_Paper-1_Test_Paper.pdf')).toBe(1)
    expect(paperNumberIn('Paper - II')).toBe(2)
    expect(paperNumberIn('Test Paper')).toBeUndefined()
  })
})
