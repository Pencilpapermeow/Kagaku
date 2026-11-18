import { describe, expect, it } from 'vitest'
import { chooseMarkers, classify, detectQuestions, durationFromText, formatFromText, groupRuns, marksFromText, markerNumber, subjectHeading, typeHeading, type PageInput } from './layout'
import type { TextLine, TextWord } from './types'

/** A text line at (x, y) on a 1000×1400 page, 20 px tall, 9 px per character. */
function line(x: number, y: number, text: string): TextLine {
  const words: TextWord[] = []
  let cx = x
  for (const w of text.split(' ')) {
    words.push({ text: w, x0: cx, x1: cx + w.length * 9, y0: y, y1: y + 20 })
    cx += w.length * 9 + 9
  }
  return { text, words, x0: x, y0: y, x1: cx - 9, y1: y + 20 }
}
const page = (...lines: TextLine[]): PageInput => ({ width: 1000, height: 1400, lines })
const nums = (d: ReturnType<typeof detectQuestions>) => d.questions.map((q) => q.n)

describe('what a line says', () => {
  it.each([
    ['Q.12 A ball is thrown', 12],
    ['Q12. A ball', 12],
    ['Q 12 A ball', 12],
    ['12. A ball', 12],
    ['12) A ball', 12],
    ['Question 7 Find', 7],
    ['12.A ball', 12],
    ['0.5 A ball', undefined],
    ['4.2 J of heat', undefined],
    ['(1) 2/3', undefined],
    ['l2. OCR read one as l', 12],
    ['0.12 could be Q.12 misread, but is taken as a decimal', undefined],
    ['O.12 OCR read Q as the letter O', 12],
  ])('marker of %s', (text, n) => {
    expect(markerNumber(line(0, 0, text))).toBe(n)
  })
  it('splits "29" "." into a marker (pdf.js gives them apart)', () => {
    expect(markerNumber(line(0, 0, '29 . For an ionic solid'))).toBe(29)
  })
  it.each([
    ['PHYSICS', 'phy'],
    ['PART I : PHYSICS', 'phy'],
    ['SECTION-I (PHYSICS)', 'phy'],
    ['SECTION - II (CHEMISTRY)', 'chem'],
    ['Part C – Mathematics', 'math'],
    ['MATHS', 'math'],
    ['Physics:', undefined],
    ['Physics: Mechanical Properties of Solids, Fluids', undefined],
    ['Physics and Chemistry', undefined],
  ])('subject heading %s', (text, s) => {
    expect(subjectHeading(text)).toBe(s)
  })
  it.each([
    ['Single Correct Type Questions', 'single'],
    ['Integer Type Questions', 'integer'],
    ['Numerical Value Type Questions', 'numerical'],
    ['Multiple Correct Type', 'multiple'],
    ['Matrix Match Type', 'single'],
    ['Single correct answer in each question is worth four marks to you', undefined],
  ])('type heading %s', (text, f) => {
    expect(typeHeading(text)).toBe(f)
  })
  it('classifies section, passage, key and rough-work lines', () => {
    expect(classify('SECTION 1 (Maximum Marks: 12)')).toMatchObject({ kind: 'section', name: 'Section 1' })
    expect(classify('PARAGRAPH I').kind).toBe('passage')
    expect(classify('ANSWER KEY').kind).toBe('keyhead')
    expect(classify('HINTS & SOLUTIONS').kind).toBe('solutions')
    expect(classify('SPACE FOR ROUGH WORK').kind).toBe('rough')
    expect(classify('General Instructions :').kind).toBe('instructions')
  })
})

describe('section instructions', () => {
  const JA_SINGLE = 'This section contains FOUR (04) questions. Each question has FOUR options (A), (B), (C) and (D). ONLY ONE of these four options is the correct answer. Full Marks : +3 If ONLY the correct option is chosen; Zero Marks : 0 If none of the options is chosen; Negative Marks : −1 In all other cases.'
  const JA_MULTI = 'Each question has FOUR options. ONE OR MORE THAN ONE of these four option(s) is (are) correct answer(s). Full Marks : +4 ONLY if (all) the correct option(s) is(are) chosen; Partial Marks : +1 If two or more options are correct but ONLY one option is chosen; Negative Marks : −2 In all other cases.'
  const JA_INT = 'The answer to each question is a NON-NEGATIVE INTEGER. Full Marks : +4 If ONLY the correct integer is entered; Zero Marks : 0 In all other cases.'
  const JA_NUM = 'The answer to each question is a NUMERICAL VALUE. If the numerical value has more than two decimal places, truncate/round-off the value to TWO decimal places. Full Marks : +3; Zero Marks : 0 In all other cases.'
  it.each([
    [JA_SINGLE, 'single', { correct: 3, wrong: -1 }],
    [JA_MULTI, 'multiple', { correct: 4, wrong: -2, partial: true }],
    [JA_INT, 'integer', { correct: 4, wrong: 0 }],
    [JA_NUM, 'numerical', { correct: 3, wrong: 0 }],
    ['Each question has four choices. Match List-I with List-II and choose the correct option.', 'single', undefined],
    ['Each correct answer will give 4 marks while 1 Mark will be deducted for a wrong response.', undefined, { correct: 4, wrong: -1 }],
  ])('%#', (text, format, marks) => {
    expect(formatFromText(text)).toBe(format)
    expect(marksFromText(text)).toEqual(marks)
  })
  it.each([
    ['DURATION : 180 Minutes', 180],
    ['The test is of 3 hours duration', 180],
    ['Time: 3:00 Hrs', 180],
    ['Time allowed : 1.5 hours', 90],
    ['Maximum Marks : 300', undefined],
  ])('duration in %s', (text, min) => {
    expect(durationFromText(text)).toBe(min)
  })
})

describe('choosing markers', () => {
  it('drops numbered options inside a question and keeps the run', () => {
    const c = [3, 4, 5, 1, 2, 3, 4, 6, 7].map((n, pos) => ({ n, pos }))
    expect(chooseMarkers(c, [])).toEqual([true, true, true, false, false, false, false, true, true])
  })
  it('restarts at 1 after a subject heading', () => {
    const c = [1, 2, 3, 1, 2, 3].map((n, pos) => ({ n, pos: pos * 2 }))
    expect(chooseMarkers(c, [5])).toEqual([true, true, true, true, true, true])
  })
  it('a long run restarting at 1 without a heading is still taken', () => {
    const c = [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 7].map((n, pos) => ({ n, pos }))
    expect(chooseMarkers(c, []).every(Boolean)).toBe(true)
  })
  it('keeps going past one missed number', () => {
    expect(chooseMarkers([1, 2, 4, 5].map((n, pos) => ({ n, pos })), [])).toEqual([true, true, true, true])
  })
})

describe('finding questions', () => {
  it('one column: each question runs to the next marker; cover instructions are skipped', () => {
    const d = detectQuestions([
      page(line(80, 100, 'Sample Test 1'), line(80, 160, 'DURATION : 60 Minutes'), line(80, 200, 'General Instructions :'), line(80, 240, '1. Fill in the details.'), line(80, 280, '2. Use a black pen.')),
      page(
        line(80, 60, 'PHYSICS'),
        line(80, 100, 'Single Correct Type Questions'),
        line(80, 140, '1. A ball is thrown up. Its speed at the top is'),
        line(120, 180, '(A) zero (B) g'),
        line(80, 400, '2. A block slides on a smooth incline.'),
        line(120, 440, '(A) 1 (B) 2'),
        line(80, 700, '3. Find the time period.'),
        line(470, 1350, '[ 2 ]'),
      ),
    ])
    expect(nums(d)).toEqual([1, 2, 3])
    expect(d.durationMin).toBe(60)
    expect(d.title).toBe('Sample Test 1')
    expect(d.sections).toHaveLength(1)
    expect(d.sections[0]).toMatchObject({ subject: 'phy', format: 'single', typeFrom: 'instructions' })
    const [q1, q2, q3] = d.questions
    expect(q1.pieces).toHaveLength(1)
    expect(q1.pieces[0].page).toBe(1)
    expect(q1.pieces[0].box.y0).toBeLessThan(140)
    expect(q1.pieces[0].box.y1).toBeLessThan(400)
    expect(q1.pieces[0].box.y1).toBeGreaterThan(200)
    expect(q2.pieces[0].box.y0).toBeGreaterThan(380)
    // The last question runs to the page bottom but not into the page number.
    expect(q3.pieces[0].box.y1).toBeLessThan(1350)
  })

  it('two columns: a question that runs into the next column gets a second piece', () => {
    const d = detectQuestions([
      page(
        line(380, 40, 'SECTION-I (PHYSICS)'),
        line(30, 100, 'Single Correct Type Questions'),
        line(30, 140, '1. Left column first question text'),
        line(60, 180, '(1) 2 (2) 3'),
        line(60, 220, '(3) 4 (4) 5'),
        line(30, 600, '2. Second question starts low'),
        line(60, 1250, 'and its text goes on'),
        line(530, 100, 'to the next column here'),
        line(560, 140, '(1) a (2) b'),
        line(530, 400, '3. Third question in the right column'),
        line(560, 440, '(1) x (2) y'),
      ),
      page(line(30, 100, 'more of question three'), line(30, 300, '4. Fourth question'), line(530, 100, '5. Fifth'), line(530, 600, '6. Sixth')),
    ])
    expect(nums(d)).toEqual([1, 2, 3, 4, 5, 6])
    expect(d.optionStyle).toBe('numbers')
    const q2 = d.questions[1]
    expect(q2.pieces.map((p) => [p.page, p.box.x0 < 500 ? 'L' : 'R'])).toEqual([
      [0, 'L'],
      [0, 'R'],
    ])
    expect(q2.pieces[1].box.y1).toBeLessThan(400)
    const q3 = d.questions[2]
    expect(q3.pieces.map((p) => [p.page, p.box.x0 < 500 ? 'L' : 'R'])).toEqual([
      [0, 'R'],
      [1, 'L'],
    ])
    expect(d.questions[3].pieces[0].box.x1).toBeLessThan(530)
  })

  it('numbering that restarts per subject, with a type change inside a subject', () => {
    const d = detectQuestions([
      page(line(80, 40, 'PHYSICS'), line(80, 80, '1. p one'), line(80, 300, '2. p two'), line(80, 500, 'Integer Type Questions'), line(80, 540, '3. p three')),
      page(line(80, 40, 'CHEMISTRY'), line(80, 80, '1. c one'), line(80, 300, '2. c two'), line(80, 500, '3. c three')),
    ])
    expect(nums(d)).toEqual([1, 2, 3, 1, 2, 3])
    expect(d.sections.map((s) => `${s.subject}/${s.format ?? '?'}`)).toEqual(['phy/?', 'phy/integer', 'chem/?'])
    expect(d.questions.map((q) => q.section)).toEqual([0, 0, 1, 2, 2, 2])
  })

  it('a paragraph is attached to each of its questions', () => {
    const d = detectQuestions([page(line(80, 40, 'PARAGRAPH I'), line(80, 80, 'A long passage about lenses.'), line(80, 300, '1. First on the passage'), line(80, 600, '2. Second on the passage'), line(80, 900, 'SECTION 2'), line(80, 950, '3. Not on it'))])
    expect(d.questions.map((q) => q.pieces.length)).toEqual([2, 2, 1])
    expect(d.questions[1].pieces[0]).toEqual(d.questions[0].pieces[0])
  })

  it('answer-key pages inside the paper are set apart', () => {
    const d = detectQuestions([page(line(80, 40, 'MATHEMATICS'), line(80, 80, '1. x'), line(80, 300, '2. y')), page(line(400, 60, 'ANSWER KEY'), line(80, 120, '1. (A) 2. (C)'))])
    expect(nums(d)).toEqual([1, 2])
    expect(d.keyPages).toEqual([1])
  })

  it('reports numbers that seem to be missing', () => {
    const d = detectQuestions([page(line(80, 40, 'PHYSICS'), line(80, 80, '1. a'), line(80, 300, '2. b'), line(80, 500, '4. d'), line(80, 700, '5. e'))])
    expect(d.warnings).toEqual(["Q3 wasn't found on the paper"])
  })

  it('a repeated running header is not part of any question', () => {
    const hdr = (y: number) => line(300, y, 'Kagaku Sample Series')
    const d = detectQuestions([
      page(hdr(10), line(80, 140, 'PHYSICS'), line(80, 200, '1. a'), line(80, 600, '2. b')),
      page(hdr(10), line(80, 200, 'c continues'), line(80, 600, '3. c')),
      page(hdr(10), line(80, 200, '4. d')),
    ])
    expect(nums(d)).toEqual([1, 2, 3, 4])
    // Q2 continues on page 2, starting below the header.
    expect(d.questions[1].pieces[1].box.y0).toBeGreaterThan(30)
  })
})

describe('words into lines', () => {
  it('splits a row at a wide gap (two columns) but not at word spaces', () => {
    const w = (x: number, text: string) => ({ text, x0: x, x1: x + 40, y0: 100, y1: 120 })
    const lines = groupRuns([w(0, 'one'), w(50, 'two'), w(500, 'three'), w(550, 'four')])
    expect(lines.map((l) => l.text)).toEqual(['one two', 'three four'])
  })
})

describe('JA style papers', () => {
  it.each([
    ['One or More Options Correct Type', 'multiple'],
    ['List Match Type Questions', 'single'],
    ['Single Integer Type Questions', 'integer'],
    ['Paragraph Type Questions', 'single'],
  ])('type heading %s', (text, f) => {
    expect(typeHeading(text)).toBe(f)
  })
  it('a section heading can carry its type: "SECTION-A (Single Correct)"', () => {
    expect(classify('SECTION-A (Single Correct)')).toMatchObject({ kind: 'section', name: 'Section A', format: 'single' })
    expect(classify('SECTION 2 (Maximum Marks: 24)')).toMatchObject({ kind: 'section', format: undefined })
  })
  it('a cover describing several sections does not set the marks of all of them', () => {
    const d = detectQuestions([
      page(line(80, 100, 'Mock Paper 1'), line(80, 140, 'Section 1: Full Marks +3 for the correct option'), line(80, 170, 'Section 2: Full Marks +4, partial marks apply')),
      page(line(80, 40, 'PHYSICS'), line(80, 80, 'SECTION 1'), line(80, 110, '1. a'), line(80, 300, '2. b')),
    ])
    expect(d.preambleMarks).toBeUndefined()
  })
  it('finds where Paper 2 starts in a PDF holding both papers', async () => {
    const { paper2Start } = await import('./layout')
    const p1 = page(line(80, 60, 'JEE Advanced Practice Paper 1'), line(80, 200, 'PHYSICS'), line(80, 240, '1. a'))
    const q = page(line(80, 200, '2. b'))
    const p2 = page(line(80, 60, 'JEE Advanced Practice Paper 2'), line(80, 200, 'PHYSICS'), line(80, 240, '1. a'))
    expect(paper2Start([p1, q, p2, q])).toBe(2)
    // A Paper 2 PDF on its own is not split.
    expect(paper2Start([p2, q, p2])).toBe(-1)
  })
})
