// Answer-key parser: lines of text (from a PDF text layer or OCR) → numbered answers.
// Pure, so every key layout can be unit-tested. It never guesses silently: anything odd
// is kept with its raw text so the check screen can flag it.
//
// Handles: "1. (A)", "1-A", "Q1 A", "1. (A,C)", "1. ACD", "1. (A) (C)", "1. 25", "1. 2.50",
// "2.50 to 2.70" / "2.50–2.70" (ranges), "A or C" (either accepted), "Bonus"/"Dropped",
// several answers on one line, grid tables (a Q.No row over an Ans row, groups side by side),
// keys split by subject (headings, or numbering that restarts), and stops at "Solutions".

import type { SubjectId } from '../content/syllabus'
import type { KeyAnswer, KeyEntry } from './types'

export interface KeyWord {
  text: string
  x0: number
  x1: number
  conf?: number
}

export interface KeyLine {
  text: string
  /** Word positions make grid tables and subject columns reliable; plain text works too. */
  words?: KeyWord[]
}

interface Tok {
  t: string
  x: number
  conf?: number
}

const SUBJECTS: [RegExp, SubjectId][] = [
  [/^phy(?:sics|s)?\.?$/i, 'phy'],
  [/^chem(?:istry)?\.?$/i, 'chem'],
  [/^math(?:ematics|s)?\.?$/i, 'math'],
]

export function subjectOfWord(w: string): SubjectId | undefined {
  const clean = w.replace(/[^A-Za-z.]/g, '')
  return SUBJECTS.find(([re]) => re.test(clean))?.[1]
}

const DASHES = /[‐-―−﹘﹣－]/g

function tokensOf(line: KeyLine): Tok[] {
  const raw: Tok[] = line.words?.length
    ? line.words.map((w) => ({ t: w.text, x: (w.x0 + w.x1) / 2, conf: w.conf }))
    : line.text.split(/\s+/).map((t, i) => ({ t, x: i }))
  const out: Tok[] = []
  for (const tok of raw) {
    const t = tok.t.replace(DASHES, '-').replace(/[|]/g, 'I').trim()
    if (!t) continue
    // "1.(A)", "1-A", "1)A", "Q1.A" → number + answer.
    const m = /^((?:Q\.?)?\d{1,3}[.):-]+)(\(?[A-Ea-e](?:[^A-Za-z].*)?|\(.+)$/.exec(t)
    if (m) {
      out.push({ ...tok, t: m[1] }, { ...tok, t: m[2] })
      continue
    }
    out.push({ ...tok, t })
  }
  // "(A," "C)" or "[2.50," "2.70]" → one token.
  for (let i = 0; i < out.length; i++) {
    const open = (x: string) => (x.match(/[([]/g)?.length ?? 0) - (x.match(/[)\]]/g)?.length ?? 0)
    let k = 0
    while (open(out[i].t) > 0 && i + 1 < out.length && k++ < 4) {
      out[i] = { ...out[i], t: out[i].t + out[i + 1].t }
      out.splice(i + 1, 1)
    }
  }
  // "Q" "12" → "Q12" (but not the "Que. 1 2 3 4" label of a grid row)
  for (let i = 0; i + 1 < out.length; i++)
    if (/^(Q|Q\.|Que\.?|Ques\.?)$/i.test(out[i].t) && /^\d{1,3}[.):-]?$/.test(out[i + 1].t) && !(i + 2 < out.length && /^\d{1,3}$/.test(out[i + 2].t))) {
      out[i + 1] = { ...out[i + 1], t: `Q${out[i + 1].t}`, x: out[i].x }
      out.splice(i, 1)
    }
  return out
}

const LABEL = /^(?:ans(?:wers?)?\.?|key|sol\.?|q\.?\s*no\.?|que(?:s(?:tion)?)?\.?(?:no\.?)?|s\.?\s*no\.?|no\.?|[:|=]|-+|question)[:.]?$/i

function qnoOf(t: string): { n: number; marked: boolean } | undefined {
  const m = /^(Q\.?)?(\d{1,3})([.):-])?$/i.exec(t)
  if (!m || Number(m[2]) < 1) return undefined
  return { n: Number(m[2]), marked: !!(m[1] || m[3]) }
}

const BONUS = /^\(?(?:bonus|dropped|deleted|cancel+ed|marks?-?to-?all|\*+)\)?[.,;]?$/i
const LETTERS = /^[([]?((?:[A-Ea-e][,&/]?)+)[)\]]?[.,;]?$/
const PAREN_LETTERS = /^(?:\(([A-Ea-e])\)[,]?)+$/
const NUM = /^([([])?(-?\d+(?:\.\d+)?)([)\]])?[.,;]?$/
const RANGE = /^[([]?(-?\d+(?:\.\d+)?)(?:~|to|,|-)(-?\d+(?:\.\d+)?)[)\]]?[.,;]?$/i

type Part = KeyAnswer | 'or'

function answerOf(t: string): Part | undefined {
  if (/^(or|\/)$/i.test(t)) return 'or'
  if (BONUS.test(t)) return { kind: 'bonus' }
  const pl = PAREN_LETTERS.exec(t)
  if (pl) return { kind: 'letters', letters: [...t.matchAll(/\(([A-Ea-e])\)/g)].map((x) => x[1].toUpperCase()) }
  const l = LETTERS.exec(t)
  if (l) {
    const body = l[1]
    const letters = [...body.matchAll(/[A-Ea-e]/g)].map((x) => x[0].toUpperCase())
    // "Bad", "Ace" are words, not answers: mixed case letters run is not an answer.
    if (letters.length > 1 && /[a-e]/.test(body) && /[A-E]/.test(body) && !/[,&/]/.test(body)) return undefined
    return { kind: 'letters', letters: [...new Set(letters)], either: body.includes('/') || undefined }
  }
  const r = RANGE.exec(t)
  // A bare "1-2" is more likely "Q1 → 2" than a range; ranges in keys have a decimal or "to".
  if (r && (t.includes('.') || /to|~/i.test(t) || /^\[/.test(t))) {
    const a = Number(r[1])
    const b = Number(r[2])
    return { kind: 'range', min: Math.min(a, b), max: Math.max(a, b) }
  }
  const n = NUM.exec(t)
  if (n) return { kind: 'number', value: Number(n[2]), paren: !!(n[1] && n[3]) || undefined }
  return undefined
}

function combine(parts: Part[]): KeyAnswer {
  const real = parts.filter((p): p is KeyAnswer => p !== 'or')
  if (real.length === 1) return real[0]
  const letters = real.flatMap((p) => (p.kind === 'letters' ? p.letters : []))
  return { kind: 'letters', letters: [...new Set(letters)], either: parts.includes('or') || real.some((p) => p.kind === 'letters' && p.either) || undefined }
}

interface Pair {
  n: number
  answer?: KeyAnswer
  raw: string
  conf?: number
  x: number
  /** Tokens used (number + answer). */
  used?: number
  /** The number had "Q" or a "." / ")" — it looked like a question number on its own. */
  marked?: boolean
  first?: boolean
}

/** Share of a line's tokens that are question numbers and answers. Prose scores low. */
function coverage(toks: Tok[], pairs: Pair[]): number {
  const words = toks.filter((t) => !LABEL.test(t.t)).length
  return words ? pairs.reduce((a, p) => a + (p.used ?? 2), 0) / words : 0
}

/** "1. (A) 2. (B,C) 3. 25 4. 2.50 to 2.70" → pairs. Alternates number, answer, number, answer… */
export function pairsOfLine(toks: Tok[]): Pair[] {
  const out: Pair[] = []
  let i = 0
  while (i < toks.length) {
    const t = toks[i].t
    if (LABEL.test(t) && !qnoOf(t)) {
      i++
      continue
    }
    const q = qnoOf(t)
    if (!q || i + 1 >= toks.length) {
      i++
      continue
    }
    const parts: Part[] = []
    const used: Tok[] = []
    let j = i + 1
    while (j < toks.length) {
      const a = toks[j].t
      if (parts.length && qnoOf(a)?.marked && !/^\(/.test(a)) break
      if (!parts.length && LABEL.test(a) && !answerOf(a)) {
        j++
        continue
      }
      const p = answerOf(a)
      if (!p) break
      if (p === 'or') {
        if (!parts.length) break
        parts.push(p)
        j++
        continue
      }
      if (parts.length) {
        const last = parts[parts.length - 1]
        const prevT = toks[j - 1].t
        const lettersRun = p.kind === 'letters' && (last === 'or' || (last.kind === 'letters' && (/[,&/]$/.test(prevT) || (/\)$/.test(prevT) && /^\(/.test(a)))))
        if (!lettersRun) break
      }
      // A number answer may be the start of a spaced range: "2.50 to 2.70", "2.50 - 2.70".
      if (p.kind === 'number' && j + 2 < toks.length && /^(to|-|~)$/i.test(toks[j + 1].t)) {
        const b = NUM.exec(toks[j + 2].t)
        if (b) {
          const lo = Number(p.value)
          const hi = Number(b[2])
          parts.push({ kind: 'range', min: Math.min(lo, hi), max: Math.max(lo, hi) })
          used.push(toks[j], toks[j + 1], toks[j + 2])
          j += 3
          break
        }
      }
      parts.push(p)
      used.push(toks[j])
      j++
      if (p.kind !== 'letters') break
    }
    if (parts.filter((p) => p !== 'or').length) {
      const confs = used.map((u) => u.conf).filter((c): c is number => c !== undefined)
      out.push({
        n: q.n,
        answer: combine(parts),
        raw: used.map((u) => u.t).join(' '),
        conf: confs.length ? Math.min(...confs) : undefined,
        x: toks[i].x,
        used: 1 + (j - i - 1),
        marked: q.marked,
        first: i === 0 || toks.slice(0, i).every((t) => LABEL.test(t.t)),
      })
      i = j
    } else i++
  }
  return out
}

function isQnoRow(toks: Tok[]): Tok[] | undefined {
  const body = toks.filter((t) => !LABEL.test(t.t))
  if (body.length < 3 || body.length < toks.length - 2) return undefined
  const nums = body.map((t) => (/^\d{1,3}\.?$/.test(t.t) ? parseInt(t.t, 10) : NaN))
  if (nums.some((n) => !Number.isFinite(n))) return undefined
  for (let k = 1; k < nums.length; k++) if (nums[k] !== nums[k - 1] + 1) return undefined
  return body
}

/** A "Q.No 1 2 3 …" row with an "Ans A C B …" row under it. */
function gridPairs(qrow: Tok[], arow: Tok[], positional: boolean): Pair[] | undefined {
  const body = arow.filter((t) => !LABEL.test(t.t) || !!answerOf(t.t))
  if (!body.length) return undefined
  const groups = new Map<number, Tok[]>()
  if (positional) {
    const gap = qrow.length > 1 ? (qrow[qrow.length - 1].x - qrow[0].x) / (qrow.length - 1) : Infinity
    for (const t of body) {
      let best = 0
      for (let k = 1; k < qrow.length; k++) if (Math.abs(qrow[k].x - t.x) < Math.abs(qrow[best].x - t.x)) best = k
      const outer = (best === qrow.length - 1 && t.x > qrow[best].x) || (best === 0 && t.x < qrow[0].x)
      if (Math.abs(qrow[best].x - t.x) > gap * (outer ? 1.5 : 0.75)) continue
      groups.set(best, [...(groups.get(best) ?? []), t])
    }
  } else {
    if (body.length !== qrow.length) return undefined
    body.forEach((t, k) => groups.set(k, [t]))
  }
  const out: Pair[] = []
  qrow.forEach((q, k) => {
    const ts = groups.get(k)
    if (!ts) return
    const n = parseInt(q.t, 10)
    const parsed = pairsOfLine([{ t: `${n}.`, x: q.x }, ...ts])
    const confs = ts.map((t) => t.conf).filter((c): c is number => c !== undefined)
    out.push(parsed[0] ?? { n, raw: ts.map((t) => t.t).join(' '), x: q.x, conf: confs.length ? Math.min(...confs) : undefined })
  })
  return out
}

const STOP = /\b(solutions?|hints?|explanations?)\b/i
const PAPER_NO = /\bpaper\s*[-–:]?\s*(1|2|I{1,2})\b/i

/** "Paper-1", "PAPER 2", "Paper - II" → 1 or 2. */
export function paperNumberIn(text: string): number | undefined {
  const m = PAPER_NO.exec(text.replace(/_/g, ' '))
  return m ? (/^(1|I)$/i.test(m[1]) ? 1 : 2) : undefined
}
const KEY_HEAD = /\banswer\s*keys?\b|\banswers\b|^key$/i

export function parseAnswerKey(lines: KeyLine[], opts: { strict?: boolean } = {}): { entries: KeyEntry[]; warnings: string[] } {
  const warnings: string[] = []
  const found: (Pair & { subject?: SubjectId; paper?: number })[] = []
  let subject: SubjectId | undefined
  let paper: number | undefined
  let columns: { subject: SubjectId; x: number }[] | undefined
  let stopped = false

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const toks = tokensOf(line)
    if (!toks.length) continue
    const positional = !!line.words?.length
    const words = toks.map((t) => t.t)
    const subs = toks.map((t) => ({ s: subjectOfWord(t.t), x: t.x })).filter((x): x is { s: SubjectId; x: number } => !!x.s)
    const short = toks.length <= 6

    const pn = toks.length <= 8 ? paperNumberIn(line.text) : undefined
    if (pn && !pairsOfLine(toks).length) {
      paper = pn
      subject = undefined
      columns = undefined
      stopped = stopped && !KEY_HEAD.test(line.text)
      if (!subs.length) continue
    }
    if (short && STOP.test(line.text) && !KEY_HEAD.test(line.text)) {
      stopped = true
      continue
    }
    if (KEY_HEAD.test(line.text) && short) {
      stopped = false
      if (subs.length === 1) subject = subs[0].s
      continue
    }
    if (stopped) continue
    if (subs.length >= 2 && subs.length >= toks.length - 2) {
      columns = subs.map((x) => ({ subject: x.s, x: x.x }))
      subject = undefined
      continue
    }
    if (subs.length === 1 && short && !pairsOfLine(toks).length) {
      subject = subs[0].s
      columns = undefined
      continue
    }

    const subjectAt = (x: number, k: number, count: number): SubjectId | undefined => {
      if (!columns) return subject
      if (positional) {
        let best = columns[0]
        for (const c of columns) if (Math.abs(c.x - x) < Math.abs(best.x - x)) best = c
        return best.subject
      }
      return columns[Math.min(columns.length - 1, Math.floor((k * columns.length) / Math.max(1, count)))].subject
    }

    const qrow = isQnoRow(toks)
    if (qrow) {
      const next = lines[li + 1]
      const pairs = next ? gridPairs(qrow, tokensOf(next), !!next.words?.length && positional) : undefined
      if (pairs) {
        pairs.forEach((p, k) => found.push({ ...p, subject: subjectAt(p.x, k, pairs.length), paper }))
        li++
        continue
      }
      if (next) warnings.push(`Couldn't line up the answers under "${line.text.slice(0, 40)}"`)
      continue
    }
    let pairs = pairsOfLine(toks)
    // Solutions text (or a line that is mostly prose): only "12. (B)" at the start of the line counts.
    if (opts.strict || coverage(toks, pairs) < 0.6) pairs = pairs.filter((p) => p.first && p.marked).slice(0, 1)
    pairs.forEach((p, k) => found.push({ ...p, subject: subjectAt(p.x, k, pairs.length), paper }))
    if (!opts.strict && !pairs.length && words.some((w) => qnoOf(w)?.marked)) warnings.push(`Couldn't read: "${line.text.slice(0, 60)}"`)
  }

  // Blocks: by subject when the key names them, otherwise a new block whenever numbering restarts.
  const entries: KeyEntry[] = []
  const bySubject = found.length > 0 && found.every((p) => p.subject)
  if (bySubject) {
    const order: string[] = []
    const groupOf = (p: (typeof found)[number]) => `${p.paper ?? 0}:${p.subject}`
    for (const p of found) if (!order.includes(groupOf(p))) order.push(groupOf(p))
    for (const p of found) entries.push({ n: p.n, block: order.indexOf(groupOf(p)), subject: p.subject, paper: p.paper, answer: p.answer, raw: p.raw, conf: p.conf })
  } else {
    let block = 0
    let seen = new Set<number>()
    let lastSubject: SubjectId | undefined
    let lastPaper: number | undefined
    for (const p of found) {
      if (seen.has(p.n) || (p.subject && lastSubject && p.subject !== lastSubject) || p.paper !== lastPaper) {
        if (seen.size) block++
        seen = new Set()
      }
      seen.add(p.n)
      lastSubject = p.subject ?? lastSubject
      lastPaper = p.paper
      entries.push({ n: p.n, block, subject: p.subject, paper: p.paper, answer: p.answer, raw: p.raw, conf: p.conf })
    }
  }
  // Same number twice in a block (grids read twice, a stray number in a solution): keep the first.
  const out: KeyEntry[] = []
  const key = (e: KeyEntry) => `${e.paper ?? 0}:${e.block}:${e.n}`
  const firstOf = new Map<string, KeyEntry>()
  for (const e of entries) {
    const k = key(e)
    const prev = firstOf.get(k)
    if (prev) {
      if (prev.raw !== e.raw) warnings.push(`Q${e.n} appears twice in the key ("${prev.raw}" and "${e.raw}"); kept the first`)
      continue
    }
    firstOf.set(k, e)
    out.push(e)
  }
  out.sort((a, b) => (a.paper ?? 0) - (b.paper ?? 0) || a.block - b.block || a.n - b.n)
  return { entries: out, warnings }
}

/** Short text for an answer, e.g. "A, C", "A or C", "2.5–2.7", "Bonus". */
export function keyAnswerText(a: KeyAnswer | undefined): string {
  if (!a) return '—'
  switch (a.kind) {
    case 'letters':
      return a.letters.join(a.either ? ' or ' : ', ')
    case 'number':
      return String(a.value)
    case 'range':
      return `${a.min}–${a.max}`
    case 'bonus':
      return 'Bonus'
  }
}

/**
 * Which lines of the key pages to read. When a page has an "ANSWER KEY" heading, read from
 * that heading on, plus following pages that are still mostly answers (not solutions).
 * Without such a heading (answers printed at the top of each solution), read everything
 * in strict mode.
 */
export function keyLinesOf(pages: KeyLine[][]): { lines: KeyLine[]; strict: boolean } {
  const isHead = (l: KeyLine) => /\banswer\s*keys?\b|^answers?\b/i.test(l.text.trim()) && l.text.trim().split(/\s+/).length <= 6
  const heads = pages.map((rows) => rows.findIndex(isHead))
  if (!heads.some((i) => i >= 0)) return { lines: pages.flat(), strict: true }
  const dense = (rows: KeyLine[]) => {
    const keyRows = rows.filter((l) => {
      const toks = tokensOf(l)
      return coverage(toks, pairsOfLine(toks)) >= 0.6
    }).length
    return rows.length > 0 && keyRows / rows.length >= 0.5
  }
  const lines: KeyLine[] = []
  let inKey = false
  pages.forEach((rows, pi) => {
    if (heads[pi] >= 0) {
      inKey = true
      lines.push(...rows.slice(heads[pi]))
    } else if (inKey && dense(rows)) lines.push(...rows)
    else inKey = false
  })
  return { lines, strict: false }
}
