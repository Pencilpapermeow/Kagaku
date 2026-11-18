// Finding questions on pages: a TypeScript port of tools/process/pdf_questions.py, extended
// for whole papers. Pure functions over text lines with positions, so the PDF text layer
// and OCR output go through the same code and everything can be unit-tested.
//
//   markers   "Q.12", "12.", "Question 12" at the left edge of a column
//   layout    one or two columns; full-width headings split a page into bands
//   pieces    a question runs from its marker to the next marker/heading; when it runs
//             into the next column or page it gets another piece (stacked later)
//   sections  subject headings (PHYSICS…), "SECTION 1", "Single Correct Type Questions",
//             instructions ("ONLY ONE … correct", "non-negative integer", "Full Marks : +4")
//   skipped   cover/instruction pages, page numbers and repeated headers/footers,
//             answer-key and solution pages (returned separately)

import type { SchemeRule } from '../content/schema'
import type { SubjectId } from '../content/syllabus'
import type { Box, PaperFormat, Piece, TextLine, TextWord } from './types'
import { paperNumberIn } from './answerKey'

export interface PageInput {
  width: number
  height: number
  lines: TextLine[]
}

// ───────────────────────────── words → lines ─────────────────────────────

const yc = (b: Box) => (b.y0 + b.y1) / 2
const h = (b: Box) => b.y1 - b.y0

function toLine(words: TextWord[]): TextLine {
  const ws = [...words].sort((a, b) => a.x0 - b.x0)
  const confs = ws.map((w) => w.conf).filter((c): c is number => c !== undefined)
  return {
    text: ws.map((w) => w.text).join(' '),
    words: ws,
    x0: Math.min(...ws.map((w) => w.x0)),
    y0: Math.min(...ws.map((w) => w.y0)),
    x1: Math.max(...ws.map((w) => w.x1)),
    y1: Math.max(...ws.map((w) => w.y1)),
    conf: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : undefined,
  }
}

/** Words on the same baseline, across the whole page width. */
export function groupRows(words: TextWord[]): TextWord[][] {
  const sorted = words.filter((w) => w.text.trim()).sort((a, b) => yc(a) - yc(b) || a.x0 - b.x0)
  const rows: { y: number; hh: number; words: TextWord[] }[] = []
  for (const w of sorted) {
    const row = rows.find((r) => Math.abs(r.y - yc(w)) < 0.5 * Math.min(r.hh, h(w)))
    if (row) {
      row.words.push(w)
      row.y = (row.y * (row.words.length - 1) + yc(w)) / row.words.length
    } else rows.push({ y: yc(w), hh: Math.max(1, h(w)), words: [w] })
  }
  return rows.sort((a, b) => a.y - b.y).map((r) => r.words.sort((a, b) => a.x0 - b.x0))
}

/** Lines that span the page, for answer keys (grids and subject columns need whole rows). */
export function rowLines(words: TextWord[]): TextLine[] {
  return groupRows(words).map(toLine)
}

/** Horizontal runs: a row is split where the gap is wider than normal word spacing (columns). */
export function groupRuns(words: TextWord[], gapFactor = 1.5): TextLine[] {
  const out: TextLine[] = []
  for (const row of groupRows(words)) {
    const hs = row.map(h).sort((a, b) => a - b)
    const med = hs[Math.floor(hs.length / 2)] || 1
    let run: TextWord[] = []
    for (const w of row) {
      if (run.length && w.x0 - run[run.length - 1].x1 > gapFactor * med) {
        out.push(toLine(run))
        run = []
      }
      run.push(w)
    }
    if (run.length) out.push(toLine(run))
  }
  return out.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
}

// ───────────────────────────── what a line says ─────────────────────────────

const SUBJECT_RE: [RegExp, SubjectId][] = [
  [/\bphysics\b/i, 'phy'],
  [/\bchemistry\b/i, 'chem'],
  [/\bmath(?:ematic)?s?\b/i, 'math'],
]

export const SUBJECT_TITLE: Record<SubjectId, string> = { phy: 'Physics', chem: 'Chemistry', math: 'Mathematics' }

export function subjectIn(text: string): SubjectId | undefined {
  const found = SUBJECT_RE.filter(([re]) => re.test(text))
  return found.length === 1 ? found[0][1] : undefined
}

const wordsOf = (t: string) => t.trim().split(/\s+/).filter(Boolean)

/** "PHYSICS", "PART I : PHYSICS", "SECTION-I (PHYSICS)", "Part A – Chemistry". Not "Physics: Mechanics, …". */
export function subjectHeading(text: string): SubjectId | undefined {
  const t = text.trim()
  if (/:\s*$/.test(t) || wordsOf(t).length > 6) return undefined
  const s = subjectIn(t)
  if (!s) return undefined
  const rest = t
    .replace(/\b(physics|chemistry|math(?:ematic)?s?)\b/gi, '')
    .replace(/\b(part|section|subject|paper)\b/gi, '')
    .replace(/[-–—:()[\].,|]/g, ' ')
    .replace(/\b([IVX]+|[A-D]|\d)\b/g, '')
    .trim()
  return rest.length <= 3 ? s : undefined
}

/** "SECTION 1", "SECTION – A (Maximum Marks: 12)", "Section-II". */
export function sectionHeading(text: string): string | undefined {
  const m = /^section\s*[-–—:]?\s*([A-D]|\d{1,2}|[IVX]{1,4})\b/i.exec(text.trim())
  if (!m || wordsOf(text).length > 10) return undefined
  return `Section ${m[1].toUpperCase()}`
}

/** "Single Correct Type Questions", "Integer Type", "Numerical Value Type Questions". */
export function typeHeading(text: string): PaperFormat | undefined {
  const t = text.trim()
  if (wordsOf(t).length > 8) return undefined
  if (!/\b(type|questions?|correct|choice|answer)\b/i.test(t)) return undefined
  if (/^(multiple|multi|one or more|more than one)\b/i.test(t)) return 'multiple'
  if (/^(integer|non[- ]?negative integer|single[- ]digit|single integer)/i.test(t)) return 'integer'
  if (/^(single|one|only one)\s*(correct|option|choice|answer)/i.test(t) || /^(match|matrix|list|column|paragraph|passage|comprehension|assertion|statement)/i.test(t)) return 'single'
  if (/^(numerical|numeric|decimal)/i.test(t)) return 'numerical'
  return undefined
}

const PASSAGE = /^(paragraph|passage|comprehension)\b/i
const INSTRUCTIONS = /^(general\s+|important\s+|omr\s+)?instructions?\b|^read\s+(the\s+)?(following\s+)?instructions|^omr\b/i
const KEY_HEAD = /^(answer\s*keys?|answers|key)\b/i
const SOLUTIONS = /^(hints?|solutions?|explanations?)\b|^hints?\s*(&|and)\s*solutions?/i
const ROUGH = /space\s+for\s+rough\s+work|rough\s+work/i
const END = /^(end\s+of\s+(the\s+)?(question\s+)?(paper|test|booklet)|\*{3,})/i

/** The question type an instruction text describes. */
export function formatFromText(text: string): PaperFormat | undefined {
  const t = text.toLowerCase().replace(/\s+/g, ' ')
  if (/non[- ]?negative integer|integer (type|value|answer)|answer (to each question )?(is|will be) an? (single[- ]digit |non[- ]negative )?integer|single[- ]digit integer|integer[- ]type/.test(t)) return 'integer'
  if (/numerical (value|answer|type)|decimal places?|round(ed)?[- ]?off|truncate/.test(t)) return 'numerical'
  if (/one or more|more than one (of these |of the )?(options?|choices?|correct)|multiple[- ]correct|multi[- ]correct|one or more than one/.test(t)) return 'multiple'
  if (/only one|single[- ](correct|option|choice)|exactly one|one correct (option|answer)|match(ing)? (the following|list)|list[- ]?i\b|paragraph|comprehension|assertion/.test(t)) return 'single'
  return undefined
}

/** "Full Marks : +4 … Partial Marks … Negative Marks : −2", or "4 marks for correct, 1 mark deducted". */
export function marksFromText(text: string): Partial<SchemeRule> | undefined {
  const t = text.replace(/[−–—]/g, '-').replace(/\s+/g, ' ')
  const out: Partial<SchemeRule> = {}
  const full = /full\s*marks?\s*[:=]?\s*\+?\s*(\d+)/i.exec(t) ?? /(?:correct (?:answer|response|option)s?|each correct)[^.;]{0,40}?(?:gives?|carr(?:y|ies)|gets?|awarded|fetch(?:es)?|earns?|will be given)\s*\+?\s*(\d+)\s*marks?/i.exec(t) ?? /\+\s*(\d+)\s*(?:marks?\s*)?for\s*(?:each\s*)?correct/i.exec(t)
  if (full) out.correct = Number(full[1])
  const neg =
    /negative\s*marks?\s*[:=]?\s*-\s*(\d+)/i.exec(t) ?? /(\d+)\s*marks?\s*(?:will\s*be\s*|shall\s*be\s*|is\s*|are\s*)?deducted/i.exec(t) ?? /-\s*(\d+)\s*(?:marks?\s*)?for\s*(?:each\s*)?(?:wrong|incorrect)/i.exec(t)
  if (neg) out.wrong = -Number(neg[1])
  else if (/no negative marking|zero marks?\s*:?\s*0\s*in all other cases/i.test(t) && out.correct !== undefined) out.wrong = 0
  if (/partial\s*marks?/i.test(t)) out.partial = true
  return out.correct !== undefined || out.wrong !== undefined ? out : undefined
}

export function durationFromText(text: string): number | undefined {
  const t = text.replace(/\s+/g, ' ')
  const hm = /\b(\d{1,2}):(\d{2})\s*(?:hours?|hrs?)\b/i.exec(t)
  if (hm) return Number(hm[1]) * 60 + Number(hm[2])
  const min = /\b(\d{2,3})\s*(?:minutes?|mins?)\b/i.exec(t)
  if (min) return Number(min[1])
  const hr = /\b(\d(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i.exec(t)
  if (hr) return Math.round(Number(hr[1]) * 60)
  return undefined
}

/** OCR reads "Q.1" as "0.1", "Q1", "Q,1", and "1" as "l"/"I" — undo the usual slips. */
function normMarkerWord(w: string): string {
  return w
    .replace(/^[O@](?=[.,]\s?\d)/, 'Q')
    .replace(/,/g, '.')
    .replace(/(?<=\d|^|\.)[lI|](?=\d|\.|$)/g, '1')
    .replace(/(?<=\d)[oO](?=\d|\.|$)/g, '0')
}

/** The question number this line starts with, if it starts like a question. */
export function markerNumber(line: TextLine): number | undefined {
  let ws = line.words.length ? line.words.map((w) => w.text) : wordsOf(line.text)
  if (!ws.length) return undefined
  // pdf.js often gives "29" and "." (or "Q" "." "29") as separate pieces.
  if (ws.length > 1 && /^[.)]$/.test(ws[1]) && /^(\d{1,3}|Q)$/i.test(normMarkerWord(ws[0]))) ws = [ws[0] + ws[1], ...ws.slice(2)]
  const a = normMarkerWord(ws[0])
  let m = /^(?:Q(?:ue(?:s(?:tion)?)?)?\.?\s*)(\d{1,3})[.:)]?$/i.exec(a)
  if (m) return Number(m[1])
  m = /^(\d{1,3})[.)]$/.exec(a)
  if (m) return Number(m[1])
  if (/^(Q|Q\.|Que\.?|Ques\.?|Question)$/i.test(a) && ws[1]) {
    m = /^(\d{1,3})[.:)]?$/.exec(normMarkerWord(ws[1]))
    if (m) return Number(m[1])
  }
  // "12.A body…" written without a space (but not a decimal like "4.2")
  m = /^(?:Q\.?)?(\d{1,3})[.)](?=[A-Za-z(])/.exec(a)
  if (m) return Number(m[1])
  return undefined
}

export type LineKind = 'subject' | 'section' | 'type' | 'passage' | 'instructions' | 'keyhead' | 'solutions' | 'rough' | 'end' | 'text'

export function classify(text: string): { kind: LineKind; subject?: SubjectId; format?: PaperFormat; name?: string } {
  const t = text.trim()
  const n = wordsOf(t).length
  const subject = subjectHeading(t)
  const section = sectionHeading(t)
  if (subject) return { kind: 'subject', subject, name: section }
  if (section) {
    const rest = t.replace(/^section\s*[-–—:]?\s*([A-D]|\d{1,2}|[IVX]{1,4})\b[\s:–—-]*/i, '').replace(/[()]/g, ' ').trim()
    return { kind: 'section', name: section, subject: subjectIn(t), format: (rest && typeHeading(rest)) || undefined }
  }
  const format = typeHeading(t)
  if (format) return { kind: 'type', format }
  if (n <= 12 && PASSAGE.test(t)) return { kind: 'passage' }
  if (n <= 8 && KEY_HEAD.test(t)) return { kind: 'keyhead' }
  if (n <= 6 && SOLUTIONS.test(t)) return { kind: 'solutions' }
  if (n <= 8 && INSTRUCTIONS.test(t)) return { kind: 'instructions' }
  if (n <= 8 && ROUGH.test(t)) return { kind: 'rough' }
  if (n <= 8 && END.test(t)) return { kind: 'end' }
  return { kind: 'text' }
}

// ───────────────────────────── page furniture ─────────────────────────────

const furnitureKey = (t: string) => t.replace(/\d+/g, '#').replace(/\s+/g, '').toLowerCase()

/**
 * Page numbers and running headers/footers: lines at the very top or bottom of a page (nothing
 * else above/below them) that are page numbers, or words repeated on most pages.
 */
export function furnitureOf(pages: PageInput[]): Set<string> {
  const isPageNo = (k: string) => /^[[(\-–\s]*(page\s*)?#([\s/]*(of)?\s*#)?[\])\-–\s]*$/i.test(k)
  const wordy = (t: string) => (t.match(/[A-Za-z]/g)?.length ?? 0) >= 3
  const edges = pages.map((p) => {
    const sorted = p.lines.map((l, li) => ({ l, li })).filter((x) => x.l.text.trim()).sort((a, b) => a.l.y0 - b.l.y0)
    const top: typeof sorted = []
    for (const x of sorted) {
      if (x.l.y1 > p.height * 0.09 || markerNumber(x.l) !== undefined) break
      top.push(x)
    }
    const bottom: typeof sorted = []
    for (const x of [...sorted].reverse()) {
      if (x.l.y0 < p.height * 0.91 || markerNumber(x.l) !== undefined) break
      bottom.push(x)
    }
    return [...top, ...bottom].filter((x) => wordsOf(x.l.text).length <= 8)
  })
  const counts = new Map<string, number>()
  for (const e of edges) for (const k of new Set(e.map((x) => furnitureKey(x.l.text)))) counts.set(k, (counts.get(k) ?? 0) + 1)
  const need = Math.max(2, Math.ceil(pages.length * 0.5))
  const out = new Set<string>()
  edges.forEach((e, pi) => {
    for (const { l, li } of e) {
      const k = furnitureKey(l.text)
      const repeated = pages.length >= 3 && wordy(l.text) && (counts.get(k) ?? 0) >= need && !subjectHeading(l.text) && !sectionHeading(l.text) && !typeHeading(l.text)
      if (isPageNo(k) || repeated) out.add(`${pi}:${li}`)
    }
  })
  return out
}

// ───────────────────────────── detection ─────────────────────────────

export interface DetectedSection {
  name: string
  subject?: SubjectId
  format?: PaperFormat
  typeFrom: 'instructions' | 'default'
  marks?: Partial<SchemeRule>
  note: string
}

export interface DetectedQuestion {
  n: number
  section: number
  pieces: Piece[]
  cropNote?: string
}

export interface Detection {
  sections: DetectedSection[]
  questions: DetectedQuestion[]
  /** Cover/instruction text before the first question (title, duration, marking). */
  preamble: string
  preambleMarks?: Partial<SchemeRule>
  durationMin?: number
  title?: string
  optionStyle: 'letters' | 'numbers'
  /** Pages (indices into the input) that hold an answer key or solutions, not questions. */
  keyPages: number[]
  warnings: string[]
}

interface Seg {
  page: number
  x0: number
  x1: number
  y0: number
  y1: number
  lines: TextLine[]
}

interface Item {
  seg: number
  line: TextLine
  kind: LineKind
  subject?: SubjectId
  format?: PaperFormat
  name?: string
  cand?: number
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

/** Picks the real question markers among candidates: numbers rise by one, restarting at 1 only after a heading. */
export function chooseMarkers(cands: { n: number; pos: number }[], headingAt: number[]): boolean[] {
  const m = cands.length
  const best = new Array<number>(m).fill(-Infinity)
  const prev = new Array<number>(m).fill(-1)
  const headingBetween = (a: number, b: number) => headingAt.some((x) => x > a && x < b)
  for (let i = 0; i < m; i++) {
    const n = cands[i].n
    // Starting the chain here drops every earlier candidate since the last heading.
    const lastHeading = Math.max(-1, ...headingAt.filter((x) => x < cands[i].pos))
    const skipped = cands.slice(0, i).filter((c) => c.pos > lastHeading).length
    best[i] = (n <= 3 ? 1 : lastHeading >= 0 ? 0.5 : -1.5) - skipped
    for (let j = Math.max(0, i - 60); j < i; j++) {
      if (best[j] === -Infinity) continue
      const nj = cands[j].n
      let g: number
      if (n === nj + 1) g = 1
      else if (n > nj + 1 && n <= nj + 4) g = 1 - 0.6 * (n - nj - 1)
      else if (n === 1) g = headingBetween(cands[j].pos, cands[i].pos) ? 1 : -3
      else if (n > nj + 4) g = -2
      else continue
      if (best[j] + g > best[i]) {
        best[i] = best[j] + g
        prev[i] = j
      }
    }
  }
  const keep = new Array<boolean>(m).fill(false)
  let end = -1
  for (let i = 0; i < m; i++) if (end < 0 || best[i] > best[end]) end = i
  if (end >= 0 && best[end] > 0) for (let i = end; i >= 0; i = prev[i]) keep[i] = true
  return keep
}

export function detectQuestions(pages: PageInput[]): Detection {
  const warnings: string[] = []
  const furniture = furnitureOf(pages)
  const content = pages.map((p, pi) => p.lines.filter((l, li) => l.text.trim() && !furniture.has(`${pi}:${li}`)))

  // Answer key / solutions pages: from the first such heading to the end, they are not questions.
  const keyPages: number[] = []
  let keyFrom = -1
  pages.forEach((p, pi) => {
    if (keyFrom >= 0) return
    if (content[pi].some((l) => l.y0 < p.height * 0.45 && ['keyhead', 'solutions'].includes(classify(l.text).kind) && !markerNumber(l))) keyFrom = pi
  })
  if (keyFrom >= 0) for (let pi = keyFrom; pi < pages.length; pi++) keyPages.push(pi)
  const qPages = pages.map((_, pi) => pi).filter((pi) => !keyPages.includes(pi))

  // Columns: two-column if many pages have question markers in the right half.
  const candX = qPages.map((pi) => content[pi].filter((l) => markerNumber(l) !== undefined).map((l) => l.x0))
  const W = (pi: number) => pages[pi].width
  const H = (pi: number) => pages[pi].height
  const withCands = candX.filter((xs) => xs.length).length
  const rightPages = qPages.filter((pi, k) => candX[k].some((x) => x > 0.4 * W(pi) && x < 0.72 * W(pi))).length
  const twoCol = rightPages >= Math.max(1, Math.ceil(withCands * 0.3))

  const segs: Seg[] = []
  for (const [k, pi] of qPages.entries()) {
    const p = pages[pi]
    const lines = [...content[pi]].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    if (!lines.length) continue
    let split: number | undefined
    if (twoCol) {
      const rights = candX[k].filter((x) => x > 0.4 * p.width && x < 0.72 * p.width)
      if (rights.length) split = Math.min(...rights) - 0.012 * p.width
      else {
        let bestX = 0
        let bestN = Infinity
        for (let x = 0.4 * p.width; x <= 0.6 * p.width; x += 0.005 * p.width) {
          const n = lines.filter((l) => l.x0 < x && l.x1 > x).length
          if (n < bestN) {
            bestN = n
            bestX = x
          }
        }
        const both = lines.some((l) => l.x1 < bestX) && lines.some((l) => l.x0 > bestX)
        if (both && bestN <= Math.max(1, lines.length * 0.05)) split = bestX
      }
    }
    const furn = p.lines.filter((_, li) => furniture.has(`${pi}:${li}`))
    const topF = furn.filter((l) => l.y1 < p.height * 0.09)
    const botF = furn.filter((l) => l.y0 > p.height * 0.91)
    const top = topF.length ? Math.max(...topF.map((l) => l.y1)) + 2 : Math.max(0, Math.min(...lines.map((l) => l.y0)) - 0.006 * p.height)
    const bottom = botF.length ? Math.min(...botF.map((l) => l.y0)) - 2 : p.height * 0.985
    const spanning = (l: TextLine) => split !== undefined && l.x0 < split - 0.03 * p.width && l.x1 > split + 0.03 * p.width
    const colOf = (l: TextLine) => (split === undefined ? 0 : (l.x0 + l.x1) / 2 < split ? 0 : 1)
    const colLines = [0, 1].map((c) => lines.filter((l) => !spanning(l) && colOf(l) === c))
    const bounds = (c: number): [number, number] => {
      const ls = colLines[c]
      const lo = split === undefined ? 0 : c === 0 ? 0 : split
      const hi = split === undefined ? p.width : c === 0 ? split : p.width
      if (!ls.length) return [lo, hi]
      return [Math.max(lo, Math.min(...ls.map((l) => l.x0)) - 0.004 * p.width), Math.min(hi, Math.max(...ls.map((l) => l.x1)) + 0.006 * p.width)]
    }
    let bandTop = top
    const flush = (bandBottom: number) => {
      for (const c of split === undefined ? [0] : [0, 1]) {
        const ls = colLines[c].filter((l) => yc(l) >= bandTop && yc(l) < bandBottom)
        const [x0, x1] = bounds(c)
        segs.push({ page: pi, x0, x1, y0: bandTop, y1: bandBottom, lines: ls })
      }
    }
    for (const l of lines.filter(spanning)) {
      flush(l.y0 - 1)
      segs.push({ page: pi, x0: 0, x1: p.width, y0: l.y0 - 1, y1: l.y1 + 1, lines: [l] })
      bandTop = l.y1 + 1
    }
    flush(bottom)
  }

  // The stream of lines in reading order.
  const items: Item[] = []
  segs.forEach((s, si) => {
    for (const line of [...s.lines].sort((a, b) => a.y0 - b.y0)) {
      const c = classify(line.text)
      items.push({ seg: si, line, ...c })
    }
  })

  // Candidates: only after the first real heading (cover pages have numbered instructions),
  // never inside an "Instructions" block, and only at the left edge of their column.
  const isHeading = (it: Item) => it.kind === 'subject' || it.kind === 'section' || it.kind === 'type'
  const firstHeading = items.find(isHeading)
  const firstHeadingPage = firstHeading ? segs[firstHeading.seg].page : -1
  let instr = false
  items.forEach((it) => {
    if (it.kind === 'instructions') instr = true
    if (isHeading(it)) instr = false
    // Cover pages (before the page with the first subject/section heading) have numbered instructions, not questions.
    if (instr || segs[it.seg].page < firstHeadingPage) return
    const n = markerNumber(it.line)
    if (n !== undefined && n > 0) it.cand = n
  })
  const colKey = (it: Item) => `${segs[it.seg].page}:${Math.round(segs[it.seg].x0)}`
  const leftOf = new Map<string, number>()
  for (const it of items) if (it.cand !== undefined) leftOf.set(colKey(it), Math.min(leftOf.get(colKey(it)) ?? Infinity, it.line.x0))
  for (const it of items) {
    if (it.cand === undefined) continue
    const s = segs[it.seg]
    const textLeft = Math.min(...s.lines.map((l) => l.x0))
    const w = pages[s.page].width
    if (it.line.x0 - leftOf.get(colKey(it))! > 0.025 * w || it.line.x0 - textLeft > 0.03 * w) it.cand = undefined
  }
  const candIdx = items.map((it, i) => (it.cand !== undefined ? i : -1)).filter((i) => i >= 0)
  const headingIdx = items.map((it, i) => (isHeading(it) ? i : -1)).filter((i) => i >= 0)
  const keep = chooseMarkers(
    candIdx.map((i) => ({ n: items[i].cand!, pos: i })),
    headingIdx,
  )
  const accepted = new Set(candIdx.filter((_, k) => keep[k]))

  // Walk the stream: open questions, passages and section instructions.
  const sections: DetectedSection[] = []
  const questions: DetectedQuestion[] = []
  let subject: SubjectId | undefined
  let preamble = ''
  let started = false
  type Block = { kind: 'q' | 'passage'; pieces: Piece[]; open?: { seg: number; y0: number }; segsUsed: number; lastSeg: number }
  let block: Block | undefined
  let passage: Piece[] = []
  let current = -1
  let noteOpen = false

  const pad = (si: number) => 0.004 * H(segs[si].page)
  const closePiece = (y1: number) => {
    if (!block?.open) return
    const s = segs[block.open.seg]
    const y0 = Math.max(s.y0, block.open.y0)
    const yEnd = Math.min(s.y1, y1)
    const hasText = s.lines.some((l) => yc(l) > y0 && yc(l) < yEnd)
    if (yEnd - y0 > 0.012 * H(s.page) && (hasText || yEnd - y0 > 0.06 * H(s.page) || !block.pieces.length))
      block.pieces.push({ page: s.page, box: { x0: s.x0, y0, x1: s.x1, y1: yEnd } })
    block.open = undefined
  }
  const finish = () => {
    if (!block) return
    if (block.kind === 'passage') passage = block.pieces
    else {
      const q = questions[questions.length - 1]
      q.pieces = block.pieces
    }
    block = undefined
  }
  const newSection = (s: Partial<DetectedSection>) => {
    sections.push({ name: s.name ?? (subject ? SUBJECT_TITLE[subject] : 'Questions'), subject: s.subject ?? subject, format: s.format, typeFrom: s.format ? 'instructions' : 'default', note: '' })
    current = sections.length - 1
    noteOpen = true
  }

  let lastSeg = -1
  items.forEach((it, i) => {
    if (it.seg !== lastSeg) {
      // Leaving a column: the open piece ends at the column bottom; a question still open
      // continues at the top of the next column (at most two columns on).
      if (block?.open) closePiece(segs[block.open.seg].y1)
      if (block && block.segsUsed < 3) {
        block.open = { seg: it.seg, y0: segs[it.seg].y0 }
        block.segsUsed++
      }
      lastSeg = it.seg
    }
    const y = it.line.y0 - pad(it.seg)
    if (accepted.has(i)) {
      closePiece(y)
      finish()
      started = true
      if (current < 0) newSection({})
      noteOpen = false
      questions.push({ n: it.cand!, section: current, pieces: [] })
      block = { kind: 'q', pieces: [...passage], open: { seg: it.seg, y0: y }, segsUsed: 1, lastSeg: it.seg }
      return
    }
    switch (it.kind) {
      case 'subject':
      case 'section':
      case 'type':
      case 'passage':
      case 'end':
      case 'keyhead':
      case 'solutions':
      case 'instructions':
        if (!started && it.kind !== 'subject' && it.kind !== 'section' && it.kind !== 'type' && it.kind !== 'passage') {
          preamble += `${it.line.text}\n`
          return
        }
        closePiece(y)
        finish()
        if (it.kind !== 'passage') passage = []
        if (it.kind === 'subject') {
          subject = it.subject
          newSection({ name: it.name ? `${SUBJECT_TITLE[it.subject!]} · ${it.name}` : undefined })
          started = true
        } else if (it.kind === 'section') {
          if (it.subject) subject = it.subject
          const cur = sections[current]
          if (cur && !questions.some((q) => q.section === current) && !cur.format) {
            cur.name = subject ? `${SUBJECT_TITLE[subject]} · ${it.name}` : it.name!
            if (it.format) {
              cur.format = it.format
              cur.typeFrom = 'instructions'
            }
          } else newSection({ name: subject ? `${SUBJECT_TITLE[subject]} · ${it.name}` : it.name, format: it.format })
          started = true
        } else if (it.kind === 'type') {
          const cur = sections[current]
          if (cur && !questions.some((q) => q.section === current) && !cur.format) {
            cur.format = it.format
            cur.typeFrom = 'instructions'
          } else newSection({ format: it.format, name: `${subject ? SUBJECT_TITLE[subject] + ' · ' : ''}${FORMAT_NAME[it.format!]}` })
          started = true
        } else if (it.kind === 'passage') {
          passage = []
          started = true
          block = { kind: 'passage', pieces: [], open: { seg: it.seg, y0: y }, segsUsed: 1, lastSeg: it.seg }
        }
        if (it.kind === 'instructions' || it.kind === 'end' || it.kind === 'keyhead' || it.kind === 'solutions') noteOpen = false
        return
      case 'rough':
        // "Space for rough work" ends this column's piece; the question may go on in the next column.
        closePiece(y)
        return
      default:
        if (!started) preamble += `${it.line.text}\n`
        else if (noteOpen && !block && current >= 0) sections[current].note += `${it.line.text}\n`
    }
  })
  if (block?.open) closePiece(segs[block.open.seg].y1)
  finish()

  // Section types and marks from their instruction text.
  for (const s of sections) {
    if (!s.format) {
      const f = formatFromText(s.note)
      if (f) {
        s.format = f
        s.typeFrom = 'instructions'
      }
    }
    s.marks = marksFromText(s.note)
    s.note = s.note.trim().slice(0, 1200)
  }
  // Drop sections without questions, renumbering the rest.
  const used = [...new Set(questions.map((q) => q.section))].sort((a, b) => a - b)
  const remap = new Map(used.map((s, i) => [s, i]))
  const finalSections = used.map((s) => sections[s])
  for (const q of questions) q.section = remap.get(q.section)!

  // Crops that look wrong.
  for (const q of questions) {
    const total = q.pieces.reduce((a, p) => a + (p.box.y1 - p.box.y0) / H(p.page), 0)
    if (!q.pieces.length) q.cropNote = 'No area found on the page — draw its box'
    else if (total > 1.15) q.cropNote = 'Very long — it may hold two questions or extra text'
  }
  // Numbers that seem to be missing.
  for (let k = 1; k < questions.length; k++) {
    const a = questions[k - 1].n
    const b = questions[k].n
    if (b > a + 1) warnings.push(b === a + 2 ? `Q${a + 1} wasn't found on the paper` : `Q${a + 1}–${b - 1} weren't found on the paper`)
  }

  // Options printed as (1)…(4) instead of (A)…(D)?
  let letters = 0
  let digits = 0
  for (const it of items)
    for (const w of it.line.words.length ? it.line.words.map((x) => x.text) : wordsOf(it.line.text)) {
      if (/^\([A-Da-d]\)/.test(w)) letters++
      else if (/^\([1-4]\)/.test(w)) digits++
    }
  const optionStyle = digits >= 4 && digits > letters * 2 ? 'numbers' : 'letters'

  const coverText = preamble + (qPages.length ? '' : '')
  const firstPage = pages[0]
  const titleLine = firstPage
    ? content[0]
        .filter((l) => l.y0 < firstPage.height * 0.3 && wordsOf(l.text).length >= 2 && /[A-Za-z]{3}/.test(l.text) && !/[:_]/.test(l.text) && !INSTRUCTIONS.test(l.text))
        .sort((a, b) => a.y0 - b.y0)[0]
    : undefined
  return {
    sections: finalSections,
    questions,
    preamble: coverText,
    // A JA cover describes several sections with different marks: then each section's own
    // instructions (or the JA preset) decide, not the cover.
    preambleMarks: /partial/i.test(coverText) || (coverText.match(/full\s*marks|marks?\s+(?:will\s+be\s+)?(?:awarded|given)|\bwill\s+give\b/gi)?.length ?? 0) > 1 ? undefined : marksFromText(coverText),
    durationMin: durationFromText(coverText),
    title: titleLine?.text,
    optionStyle,
    keyPages,
    warnings,
  }
}

export const FORMAT_NAME: Record<PaperFormat, string> = {
  single: 'Single correct',
  multiple: 'Multiple correct',
  integer: 'Integer',
  numerical: 'Numerical',
}

/** Median text height, used to size things relative to the print. */
export function textHeight(lines: TextLine[]): number {
  return median(lines.map(h))
}

/**
 * JA Paper 1 and Paper 2 in one PDF: the index of the first page whose top names "Paper 2",
 * when an earlier page named "Paper 1". -1 when the PDF holds one paper.
 */
export function paper2Start(pages: PageInput[]): number {
  const names = (p: PageInput, n: number, topOnly: boolean) => p.lines.some((l) => (!topOnly || l.y0 < p.height * 0.35) && wordsOf(l.text).length <= 10 && paperNumberIn(l.text) === n)
  for (let k = 1; k < pages.length; k++) if (names(pages[k], 2, true) && pages.slice(0, k).some((p) => names(p, 1, false))) return k
  return -1
}
