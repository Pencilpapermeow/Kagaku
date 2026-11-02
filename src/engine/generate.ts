// Questions generated from "To Remember" data, without any AI, in four levels:
//
//   1 Warm-up  plain recall: random wrong options, simple true/false, highest/lowest
//   2 Tricky   look-alike wrong options (SO₄²⁻ vs SO₃²⁻, Z 26 vs 27), "which of these…" multiple
//              correct, small orderings, true/false on neighbouring items of a trend
//   3 JA mode  JA-style multiple correct (statements about one row, correctly matched pairs,
//              comparisons), two-step recall (find the row through another column), "which order
//              is correct" with near-miss orders
//   4 Boss     typed answers with no options for numbers, long orderings, 5-row match with an
//              extra option, the hardest multiple-correct sets
//
// Every question carries an explanation (`solution`) built from the same row or trend: the full
// row, what each look-alike option really belongs to, the trend's "Why" and exceptions. So a wrong
// answer always shows the right one and the reason.
//
// Columns whose answer is printed in the question itself (charge of \ce{SO4^2-}) are never asked.
//
// Ids: "g:<rememberId>:<kind>:<rows>:<hash>". <rows> are the table rows involved ("3", "3-7-9"),
// or "t" for a trend. Same question → same id, so attempts and Galti line up across sessions.

import type { Option, Question, QuestionFormat, Remember } from '../content/schema'
import { pick, sample, shuffle, type Rng } from './rng'
import { chargeOf, decimalsOf, numberOf, plain, same, similarity } from './similar'

export type Level = 1 | 2 | 3 | 4
export const LEVELS: Level[] = [1, 2, 3, 4]
export const MAX_LEVEL: Level = 4
export const LEVEL_NAME: Record<Level, string> = { 1: 'Warm-up', 2: 'Tricky', 3: 'JA mode', 4: 'Boss' }
export const clampLevel = (n: number): Level => Math.min(MAX_LEVEL, Math.max(1, Math.round(n) || 1)) as Level

type Table = Extract<Remember, { kind: 'table' }>
type Trend = Extract<Remember, { kind: 'trend' }>
type Column = Table['columns'][number]

const TABLE_KINDS = ['fwd', 'rev', 'tf', 'which', 'match', 'pairs', 'stmts', 'hop', 'type'] as const
const TREND_KINDS = ['max', 'min', 'tfc', 'order', 'cmp', 'corder'] as const
type TableKind = (typeof TABLE_KINDS)[number]
type TrendKind = (typeof TREND_KINDS)[number]
export type GenKind = TableKind | TrendKind

// Repeats act as weights: at level 2 a plain "value of X?" still comes up often.
const TABLE_PLAN: Record<Level, TableKind[]> = {
  1: ['fwd', 'fwd', 'rev', 'tf'],
  2: ['fwd', 'rev', 'tf', 'which', 'which', 'match'],
  3: ['stmts', 'pairs', 'which', 'hop', 'match', 'fwd'],
  4: ['type', 'type', 'pairs', 'stmts', 'hop', 'match', 'which'],
}
const TREND_PLAN: Record<Level, TrendKind[]> = {
  1: ['max', 'min', 'tfc'],
  2: ['order', 'tfc', 'tfc', 'max', 'min'],
  3: ['cmp', 'cmp', 'corder', 'order', 'tfc'],
  4: ['order', 'cmp', 'corder'],
}

export interface GenOptions {
  level: Level
  rng: Rng
  /** Ask about one of these rows (a fact he just missed). Any row when absent. */
  rows?: number[]
  /** Kinds to use only if nothing else works (a repeat should look different). */
  avoid?: string[]
  /** Only this format (the "By format" chips). */
  format?: QuestionFormat
}

/** One thing to remember: a table row, or a whole trend (rows = []). */
export interface Fact {
  r: Remember
  rows: number[]
}

// ---------------------------------------------------------------------------------------------
// Small helpers

const MAX_CELL = 160

const usable = (v: string | undefined): v is string => !!v && !!v.trim() && v.length <= MAX_CELL

function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>()
  return list.filter((v) => {
    const k = plain(v).replace(/ /g, '')
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const lines = (...xs: (string | false | undefined)[]) => xs.filter(Boolean).join('\n')

/** The card title as a small first line of the stem (no markup if it holds maths). */
const head = (title: string) => (/[$\\*]/.test(title) ? `${title}\n` : `*${title}*\n`)

/** Bold, unless it holds maths (markup can't span a formula). */
const strong = (s: string) => (/[$\\*]/.test(s) ? s : `**${s}**`)

function stamp(r: Remember, kind: GenKind, rows: number[] | 't', level: Level, q: Question): Question {
  const visible = JSON.stringify([q.stem, 'options' in q ? q.options.map((o) => o.text).sort() : undefined, 'items' in q ? q.items.map((o) => o.text).sort() : undefined, 'left' in q ? q.left.map((o) => o.text) : undefined])
  const rowsPart = rows === 't' ? 't' : rows.join('-')
  return {
    ...q,
    id: `g:${r.id}:${kind}:${rowsPart}:${hash(visible)}`,
    chapter: r.chapter,
    topic: r.topic,
    verified: r.verified,
    source: r.source,
    tags: ['generated', `lv:${level}`],
  } as Question
}

/** Options with ids; the first text is the correct one. */
const choices = (texts: string[], rng: Rng): { options: Option[]; answer: string } => ({
  options: shuffle(
    texts.map((text, i) => ({ id: `o${i}`, text })),
    rng,
  ),
  answer: 'o0',
})

// ---------------------------------------------------------------------------------------------
// Tables

interface TableView {
  t: Table
  key: Column
  /** Columns that can be asked about. */
  cols: Column[]
  name: (ri: number) => string
  cell: (ri: number, c: Column) => string | undefined
  rowsFor: (c: Column) => number[]
  colsFor: (ri: number) => Column[]
}

/** True when most cells of the column can be read off the key itself (charge of \ce{SO4^2-}). */
function printedInKey(t: Table, c: Column): boolean {
  let both = 0
  let equal = 0
  for (const row of t.rows) {
    const q = chargeOf(row[t.keyColumn] ?? '')
    const v = numberOf(row[c.key] ?? '')
    if (q === undefined || v === undefined) continue
    both++
    if (q === v) equal++
  }
  return both >= 3 && equal / both >= 0.6
}

const viewCache = new WeakMap<Table, TableView | null>()

function tableView(t: Table): TableView | undefined {
  const cached = viewCache.get(t)
  if (cached !== undefined) return cached ?? undefined
  const key = t.columns.find((c) => c.key === t.keyColumn)
  let view: TableView | null = null
  if (key) {
    const named = (ri: number) => usable(t.rows[ri]?.[t.keyColumn])
    const cols = t.columns.filter((c) => {
      if (c.key === t.keyColumn || c.quiz === false) return false
      const vals = t.rows.filter((row, ri) => named(ri) && usable(row[c.key])).map((row) => plain(row[c.key]))
      return vals.length >= 2 && new Set(vals).size >= 2 && !printedInKey(t, c)
    })
    const cell = (ri: number, c: Column) => (named(ri) && usable(t.rows[ri][c.key]) ? t.rows[ri][c.key] : undefined)
    view = {
      t,
      key,
      cols,
      name: (ri) => t.rows[ri][t.keyColumn],
      cell,
      rowsFor: (c) => t.rows.map((_, ri) => ri).filter((ri) => cell(ri, c) !== undefined),
      colsFor: (ri) => cols.filter((c) => cell(ri, c) !== undefined),
    }
  }
  viewCache.set(t, view)
  return view ?? undefined
}

/** Names of the rows whose cell in `c` reads the same as `value`. */
function namesWith(v: TableView, c: Column, value: string, except?: number): string[] {
  return v
    .rowsFor(c)
    .filter((ri) => ri !== except && same(v.cell(ri, c)!, value))
    .map((ri) => v.name(ri))
}

/** "**Sulphate** — Anion: SO₄²⁻ · Charge: −2" (every column, including remarks). */
function rowLine(v: TableView, ri: number): string {
  const row = v.t.rows[ri]
  const parts = v.t.columns.filter((c) => c.key !== v.t.keyColumn && row[c.key]?.trim()).map((c) => `${c.label}: ${row[c.key]}`)
  return `${strong(v.name(ri))} — ${parts.join(' · ')}`
}

const tableNote = (t: Table) => t.note && `*Note:* ${t.note}`

/**
 * How easily row r's value in column c could be mistaken for row ri's. Text values also count as
 * confusable when the rows themselves look alike (Sn²⁺ "stannous" vs Sn⁴⁺ "stannic").
 */
function confusion(v: TableView, c: Column, ri: number, r: number): number {
  const a = v.cell(ri, c)!
  const b = v.cell(r, c)!
  const byValue = similarity(a, b)
  if (numberOf(a) !== undefined && numberOf(b) !== undefined) return byValue
  return Math.max(byValue, 0.9 * similarity(v.name(ri), v.name(r)))
}

/** Other rows, most confusable first (level 1: random order; level 2: loosely ranked). */
function rankRows(v: TableView, c: Column, ri: number, level: Level, rng: Rng, accept: (r: number) => boolean = () => true): number[] {
  const others = v.rowsFor(c).filter((r) => r !== ri && accept(r))
  if (level === 1) return shuffle(others, rng)
  const jitter = level === 2 ? 0.25 : 0.08
  return others
    .map((r) => ({ r, s: confusion(v, c, ri, r) + jitter * rng() }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r)
}

/** n wrong values for row ri in column c, all different from each other and from `exclude`. */
function wrongValues(v: TableView, c: Column, ri: number, n: number, level: Level, rng: Rng, exclude: string[] = []): string[] {
  const target = v.cell(ri, c)!
  const out: string[] = []
  for (const r of rankRows(v, c, ri, level, rng)) {
    const x = v.cell(r, c)!
    if (same(x, target) || exclude.some((e) => same(e, x)) || out.some((o) => same(o, x))) continue
    out.push(x)
    if (out.length >= n) break
  }
  return out
}

function lookAlikeLine(v: TableView, c: Column, wrong: string[], ri: number): string | undefined {
  const parts = wrong
    .map((w) => {
      const names = namesWith(v, c, w, ri).slice(0, 2)
      return names.length ? `${w} → ${names.join(', ')}` : undefined
    })
    .filter(Boolean)
  return parts.length ? `Other options belong to: ${parts.join(' · ')}` : undefined
}

type TableBuilder = (v: TableView, ri: number, level: Level, rng: Rng) => Question | undefined

const tableBuilders: Record<TableKind, TableBuilder> = {
  fwd(v, ri, level, rng) {
    const c = pick(v.colsFor(ri), rng)
    if (!c) return
    const value = v.cell(ri, c)!
    const wrong = wrongValues(v, c, ri, 3, level, rng)
    if (wrong.length < 2) return
    return stamp(v.t, 'fwd', [ri], level, {
      format: 'single',
      stem: `${head(v.t.title)}${strong(v.name(ri))} → ${c.label}?`,
      ...choices([value, ...wrong], rng),
      solution: lines(rowLine(v, ri), lookAlikeLine(v, c, wrong, ri), tableNote(v.t)),
    } as Question)
  },

  rev(v, ri, level, rng) {
    const cs = v.colsFor(ri).filter((c) => namesWith(v, c, v.cell(ri, c)!).length === 1)
    const c = pick(cs, rng)
    if (!c) return
    const value = v.cell(ri, c)!
    const others = rankRows(v, c, ri, level, rng, (r) => !same(v.name(r), v.name(ri))).slice(0, 3)
    const names = dedupe([v.name(ri), ...others.map((r) => v.name(r))])
    if (names.length < 3) return
    return stamp(v.t, 'rev', [ri], level, {
      format: 'single',
      stem: `${head(v.t.title)}Which ${v.key.label} has ${c.label} = ${value}?`,
      ...choices(names, rng),
      solution: lines(
        rowLine(v, ri),
        `Others: ${others.map((r) => `${v.name(r)} → ${v.cell(r, c)}`).join(' · ')}`,
        tableNote(v.t),
      ),
    } as Question)
  },

  tf(v, ri, level, rng) {
    const c = pick(v.colsFor(ri), rng)
    if (!c) return
    const value = v.cell(ri, c)!
    const [wrong] = wrongValues(v, c, ri, 1, level, rng)
    const shown = rng() < 0.5 || !wrong ? value : wrong
    const truth = same(shown, value)
    const owners = truth ? [] : namesWith(v, c, shown, ri).slice(0, 2)
    return stamp(v.t, 'tf', [ri], level, {
      format: 'truefalse',
      stem: `${head(v.t.title)}${strong(v.name(ri))} → ${c.label}: ${shown}`,
      answer: truth,
      solution: lines(rowLine(v, ri), !truth && owners.length > 0 && `${shown} is the ${c.label} of ${owners.join(', ')}.`, tableNote(v.t)),
    } as Question)
  },

  which(v, ri, level, rng) {
    // Only columns where the value repeats, so more than one option can be right.
    const c = pick(
      v.colsFor(ri).filter((c) => namesWith(v, c, v.cell(ri, c)!).length >= 2),
      rng,
    )
    if (!c) return
    const value = v.cell(ri, c)!
    const withV = v.rowsFor(c).filter((r) => same(v.cell(r, c)!, value))
    const without = v.rowsFor(c).filter((r) => !same(v.cell(r, c)!, value))
    // 1–3 right options; the rest (to make 4) from rows with a different value.
    let k = 1 + Math.floor(rng() * Math.min(3, withV.length))
    if (4 - k > without.length) k = 4 - without.length
    if (k < 1 || k > withV.length) return
    const right = [ri, ...sample(
      withV.filter((r) => r !== ri),
      k - 1,
      rng,
    )]
    const wrongRows = rankRows(v, c, ri, level, rng, (r) => without.includes(r)).slice(0, 4 - right.length)
    const rows = [...right, ...wrongRows]
    if (rows.length < 4 || new Set(rows.map((r) => plain(v.name(r)))).size !== rows.length) return
    return stamp(v.t, 'which', rows, level, {
      format: 'multiple',
      stem: `${head(v.t.title)}Which of these have ${c.label} = ${value}?`,
      options: shuffle(
        rows.map((r) => ({ id: `r${r}`, text: v.name(r) })),
        rng,
      ),
      answer: right.map((r) => `r${r}`),
      solution: lines(
        ...rows.map((r) => `${right.includes(r) ? '✓' : '✗'} ${v.name(r)} → ${c.label}: ${v.cell(r, c)}`),
        tableNote(v.t),
      ),
    } as Question)
  },

  match(v, ri, level, rng) {
    const c = pick(v.colsFor(ri), rng)
    if (!c) return
    const size = level >= 4 ? 5 : 4
    const rows = [ri]
    const near = rankRows(v, c, ri, level, rng)
    for (const r of near) {
      if (rows.length >= size) break
      if (!rows.some((x) => same(v.cell(x, c)!, v.cell(r, c)!) || same(v.name(x), v.name(r)))) rows.push(r)
    }
    if (rows.length < 3) return
    const order = shuffle(rows, rng)
    const L = 'PQRST'
    const extra = level >= 4 ? wrongValues(v, c, ri, 1, level, rng, rows.map((r) => v.cell(r, c)!)) : []
    const rightTexts = shuffle([...order.map((r) => ({ r, text: v.cell(r, c)! })), ...extra.map((text) => ({ r: -1, text }))], rng)
    const answer: Record<string, string> = {}
    order.forEach((r, i) => {
      answer[L[i]] = String(rightTexts.findIndex((x) => x.r === r) + 1)
    })
    return stamp(v.t, 'match', order, level, {
      format: 'match',
      stem: `${head(v.t.title)}Match ${v.key.label} with ${c.label}.`,
      left: order.map((r, i) => ({ id: L[i], text: v.name(r) })),
      right: rightTexts.map((x, i) => ({ id: String(i + 1), text: x.text })),
      answer,
      solution: lines(...order.map((r) => `${v.name(r)} → ${v.cell(r, c)}`), extra.length ? `(${extra[0]} matches none of them)` : undefined, tableNote(v.t)),
    } as Question)
  },

  pairs(v, ri, level, rng) {
    const c = pick(v.colsFor(ri), rng)
    if (!c) return
    const rows = [ri]
    for (const r of rankRows(v, c, ri, level, rng)) {
      if (rows.length >= 4) break
      if (!rows.some((x) => same(v.name(x), v.name(r)))) rows.push(r)
    }
    if (rows.length < 4) return
    const wantTrue = level >= 4 && rng() < 0.15 ? 4 : 1 + Math.floor(rng() * 3)
    const truthy = new Set(sample(rows, wantTrue, rng))
    const shown = new Map<number, string>()
    for (const r of rows) {
      const real = v.cell(r, c)!
      if (truthy.has(r)) shown.set(r, real)
      else {
        const [w] = wrongValues(v, c, r, 1, Math.max(level, 2) as Level, rng)
        if (!w) return
        shown.set(r, w)
      }
    }
    const right = rows.filter((r) => same(shown.get(r)!, v.cell(r, c)!))
    if (!right.length) return
    return stamp(v.t, 'pairs', rows, level, {
      format: 'multiple',
      stem: `${head(v.t.title)}Which pairs are correctly matched (${v.key.label} → ${c.label})?`,
      options: shuffle(
        rows.map((r) => ({ id: `r${r}`, text: `${v.name(r)} → ${shown.get(r)}` })),
        rng,
      ),
      answer: right.map((r) => `r${r}`),
      solution: lines(
        ...rows.map((r) => (right.includes(r) ? `✓ ${v.name(r)} → ${v.cell(r, c)}` : `✗ ${v.name(r)} → ${v.cell(r, c)} (not ${shown.get(r)})`)),
        tableNote(v.t),
      ),
    } as Question)
  },

  stmts(v, ri, level, rng) {
    const cs = shuffle(v.colsFor(ri), rng)
    if (cs.length < 2) return
    const wantTrue = Math.min(cs.length, level >= 4 && rng() < 0.15 ? 4 : 1 + Math.floor(rng() * 3))
    const items: { c: Column; text: string; truth: boolean }[] = []
    for (let i = 0; i < wantTrue; i++) items.push({ c: cs[i], text: v.cell(ri, cs[i])!, truth: true })
    for (let j = 0, tries = 0; items.length < 4 && tries < 12; j++, tries++) {
      const c = cs[j % cs.length]
      const used = items.filter((x) => x.c === c).map((x) => x.text)
      const [w] = wrongValues(v, c, ri, 1, Math.max(level, 2) as Level, rng, used)
      if (w) items.push({ c, text: w, truth: false })
    }
    if (items.length < 3) return
    if (items.every((x) => x.truth) && items.length < 4) return
    const opts = shuffle(
      items.map((x, i) => ({ ...x, id: `s${i}` })),
      rng,
    )
    return stamp(v.t, 'stmts', [ri], level, {
      format: 'multiple',
      stem: `${head(v.t.title)}Which statements about ${strong(v.name(ri))} are correct?`,
      options: opts.map((x) => ({ id: x.id, text: `${x.c.label}: ${x.text}` })),
      answer: opts.filter((x) => x.truth).map((x) => x.id),
      solution: lines(
        rowLine(v, ri),
        ...opts
          .filter((x) => !x.truth)
          .map((x) => {
            const owner = namesWith(v, x.c, x.text, ri).slice(0, 2)
            return `✗ ${x.c.label}: ${x.text}${owner.length ? ` — that is ${owner.join(', ')}` : ''}`
          }),
        tableNote(v.t),
      ),
    } as Question)
  },

  hop(v, ri, level, rng) {
    const cs = v.colsFor(ri)
    const ids = cs.filter((c) => namesWith(v, c, v.cell(ri, c)!).length === 1)
    const c1 = pick(ids, rng)
    const c2 = c1 && pick(
      cs.filter((c) => c !== c1),
      rng,
    )
    if (!c1 || !c2) return
    const value = v.cell(ri, c2)!
    const wrong = wrongValues(v, c2, ri, 3, level, rng)
    if (wrong.length < 2) return
    return stamp(v.t, 'hop', [ri], level, {
      format: 'single',
      stem: `${head(v.t.title)}The ${v.key.label} whose ${c1.label} is ${v.cell(ri, c1)} → ${c2.label}?`,
      ...choices([value, ...wrong], rng),
      solution: lines(rowLine(v, ri), lookAlikeLine(v, c2, wrong, ri), tableNote(v.t)),
    } as Question)
  },

  type(v, ri, level, rng) {
    const c = pick(
      v.colsFor(ri).filter((c) => numberOf(v.cell(ri, c)!) !== undefined),
      rng,
    )
    if (!c) return
    const text = v.cell(ri, c)!
    const n = numberOf(text)!
    const isFraction = plain(text).includes('/')
    const stem = `${head(v.t.title)}${strong(v.name(ri))} → ${c.label}? Type it.`
    const solution = lines(rowLine(v, ri), tableNote(v.t))
    if (Number.isInteger(n) && !plain(text).includes('.')) return stamp(v.t, 'type', [ri], level, { format: 'integer', stem, answer: n, solution } as Question)
    const tolerance = isFraction ? 0.01 : 0.5 * 10 ** -decimalsOf(text)
    return stamp(v.t, 'type', [ri], level, { format: 'numerical', stem: isFraction ? `${stem} (as a decimal)` : stem, answer: n, tolerance, solution } as Question)
  },
}

function generateFromTableView(v: TableView, o: GenOptions): Question | undefined {
  const candidates = (o.rows?.length ? o.rows : v.t.rows.map((_, i) => i)).filter((ri) => v.colsFor(ri).length > 0)
  if (!candidates.length) return
  for (let attempt = 0; attempt < 3; attempt++) {
    const ri = pick(candidates, o.rng)
    for (const level of levelOrder(o.level)) {
      for (const kind of planOrder(TABLE_PLAN[level], o)) {
        const q = tableBuilders[kind](v, ri, level, o.rng)
        if (q && (!o.format || q.format === o.format)) return q
      }
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------------------------
// Trends ("order" is lowest → highest)

function trendLine(t: Trend): string {
  return lines(`**${t.property}** (lowest → highest): ${t.order.join(' < ')}`, t.basis && `**Why:** ${t.basis}`, t.exceptions && `**Exceptions:** ${t.exceptions}`)
}

/** m neighbouring positions of a trend (neighbours are the easiest to confuse). */
const span = (n: number, m: number, rng: Rng): number[] => {
  const start = Math.floor(rng() * (n - m + 1))
  return Array.from({ length: m }, (_, i) => start + i)
}

type TrendBuilder = (t: Trend, level: Level, rng: Rng) => Question | undefined

const extreme =
  (highest: boolean): TrendBuilder =>
  (t, level, rng) => {
    const n = t.order.length
    if (n < 3) return
    const m = Math.min(4, n)
    let idx: number[]
    if (level === 1) idx = sample(t.order.map((_, i) => i), m, rng)
    else {
      // Keep the top two (or bottom two) together: the near-miss is what makes it hard.
      const end = highest ? n - 1 : 0
      const next = highest ? n - 2 : 1
      idx = [end, next, ...sample(
        t.order.map((_, i) => i).filter((i) => i !== end && i !== next),
        m - 2,
        rng,
      )]
    }
    const target = highest ? Math.max(...idx) : Math.min(...idx)
    const texts = [t.order[target], ...idx.filter((i) => i !== target).map((i) => t.order[i])]
    if (dedupe(texts).length !== texts.length) return
    return stamp(t, highest ? 'max' : 'min', 't', level, {
      format: 'single',
      stem: `${head(t.title)}Which has the **${highest ? 'highest' : 'lowest'}** ${t.property}?`,
      ...choices(texts, rng),
      solution: trendLine(t),
    } as Question)
  }

const trendBuilders: Record<TrendKind, TrendBuilder> = {
  max: extreme(true),
  min: extreme(false),

  tfc(t, level, rng) {
    const n = t.order.length
    if (n < 2) return
    const gap = level === 1 && n >= 3 ? 2 + Math.floor(rng() * (n - 2)) : 1
    const i = Math.floor(rng() * (n - gap))
    const [a, b] = rng() < 0.5 ? [i + gap, i] : [i, i + gap]
    return stamp(t, 'tfc', 't', level, {
      format: 'truefalse',
      stem: `${head(t.title)}${t.order[a]} has a higher ${t.property} than ${t.order[b]}.`,
      answer: a > b,
      solution: trendLine(t),
    } as Question)
  },

  order(t, level, rng) {
    const n = t.order.length
    const m = level === 1 ? n : level === 2 ? Math.min(n, 3 + Math.floor(rng() * 2)) : level === 3 ? Math.min(n, 5) : Math.min(n, 9)
    if (m < 2) return
    const idx = level >= 4 || m === n ? t.order.map((_, i) => i).slice(0, m) : span(n, m, rng)
    const decreasing = rng() < 0.5
    const items = idx.map((i) => ({ id: `i${i}`, text: t.order[i] }))
    const answer = items.map((x) => x.id)
    return stamp(t, 'order', 't', level, {
      format: 'ordering',
      stem: `${head(t.title)}Arrange in **${decreasing ? 'decreasing' : 'increasing'}** order of ${t.property}.`,
      items: shuffle(items, rng),
      answer: decreasing ? [...answer].reverse() : answer,
      solution: trendLine(t),
    } as Question)
  },

  cmp(t, level, rng) {
    const n = t.order.length
    if (n < 3) return
    const all: [number, number][] = []
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) all.push([i, j])
    const near = all.filter(([i, j]) => j - i === 1)
    const mid = all.filter(([i, j]) => j - i === 2)
    const pool = level >= 4 ? [...shuffle(near, rng), ...shuffle(mid, rng)] : shuffle([...near, ...near, ...mid], rng)
    const picked: [number, number][] = []
    for (const p of pool) if (picked.length < 4 && !picked.some((x) => x[0] === p[0] && x[1] === p[1])) picked.push(p)
    if (picked.length < 3) for (const p of shuffle(all, rng)) if (picked.length < 3 && !picked.some((x) => x[0] === p[0] && x[1] === p[1])) picked.push(p)
    const stmts = picked.map(([lo, hi], k) => {
      const flip = rng() < 0.5
      // "A > B" means A has the higher value.
      const [a, b] = flip ? [lo, hi] : [hi, lo]
      return { id: `p${k}`, text: `${t.order[a]} > ${t.order[b]}`, truth: a > b }
    })
    if (!stmts.some((s) => s.truth)) {
      const s = stmts[0]
      const [x, y] = s.text.split(' > ')
      stmts[0] = { ...s, text: `${y} > ${x}`, truth: true }
    }
    const opts = shuffle(stmts, rng)
    return stamp(t, 'cmp', 't', level, {
      format: 'multiple',
      stem: `${head(t.title)}Which comparisons of ${t.property} are correct? (">" means higher)`,
      options: opts.map(({ id, text }) => ({ id, text })),
      answer: opts.filter((s) => s.truth).map((s) => s.id),
      solution: trendLine(t),
    } as Question)
  },

  corder(t, level, rng) {
    const n = t.order.length
    const m = Math.min(n, level >= 4 ? 5 : 4)
    if (m < 3) return
    const idx = span(n, m, rng)
    const decreasing = rng() < 0.5
    const sep = decreasing ? ' > ' : ' < '
    const right = decreasing ? [...idx].reverse() : idx
    const key = (seq: number[]) => seq.join(',')
    const seen = new Set([key(right)])
    const wrong: number[][] = []
    const add = (seq: number[]) => {
      if (wrong.length < 3 && !seen.has(key(seq))) {
        seen.add(key(seq))
        wrong.push(seq)
      }
    }
    for (const k of shuffle(
      right.slice(0, -1).map((_, i) => i),
      rng,
    )) {
      const s = [...right]
      ;[s[k], s[k + 1]] = [s[k + 1], s[k]]
      add(s)
    }
    for (let tries = 0; wrong.length < 3 && tries < 30; tries++) add(shuffle(right, rng))
    if (wrong.length < 3) return
    const text = (seq: number[]) => seq.map((i) => t.order[i]).join(sep)
    return stamp(t, 'corder', 't', level, {
      format: 'single',
      stem: `${head(t.title)}Which is the correct order of ${t.property}?`,
      ...choices([text(right), ...wrong.map(text)], rng),
      solution: trendLine(t),
    } as Question)
  },
}

function generateFromTrendItem(t: Trend, o: GenOptions): Question | undefined {
  if (t.order.length < 2) return
  for (const level of levelOrder(o.level)) {
    for (const kind of planOrder(TREND_PLAN[level], o)) {
      const q = trendBuilders[kind](t, level, o.rng)
      if (q && (!o.format || q.format === o.format)) return q
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------------------------
// Public API

/** Asked level first, then easier ones, then harder ones (so something always comes out). */
function levelOrder(level: Level): Level[] {
  return [level, ...LEVELS.filter((l) => l < level).reverse(), ...LEVELS.filter((l) => l > level)]
}

/** Kinds of a level in weighted random order; avoided kinds last. */
function planOrder<K extends string>(plan: K[], o: GenOptions): K[] {
  const order = dedupe(shuffle(plan, o.rng)) as K[]
  const avoid = new Set(o.avoid ?? [])
  return [...order.filter((k) => !avoid.has(k)), ...order.filter((k) => avoid.has(k))]
}

/** One question about this item at (or near) the asked level. */
export function generateOne(r: Remember, o: GenOptions): Question | undefined {
  if (r.kind === 'table') {
    const v = tableView(r)
    return v && generateFromTableView(v, o)
  }
  if (r.kind === 'trend') return generateFromTrendItem(r, o)
  return undefined
}

/** Everything in this item that can become a question: each usable table row, or the trend. */
export function factsOf(r: Remember): Fact[] {
  if (r.kind === 'trend') return r.order.length >= 2 ? [{ r, rows: [] }] : []
  if (r.kind !== 'table') return []
  const v = tableView(r)
  if (!v) return []
  return r.rows.map((_, ri) => ri).filter((ri) => v.colsFor(ri).length > 0).map((ri) => ({ r, rows: [ri] }))
}

/**
 * A fixed list of questions from one item (for tests and format counts): one per fact, levels
 * spread between `from` and `to`.
 */
export function generateFrom(r: Remember, rng: Rng, from: Level = 2, to: Level = 4): Question[] {
  const out: Question[] = []
  for (const f of factsOf(r)) {
    const level = (from + Math.floor(rng() * (to - from + 1))) as Level
    const q = generateOne(r, { level, rng, rows: f.rows.length ? f.rows : undefined })
    if (q) out.push(q)
  }
  return out
}

export function isGeneratedId(id: string): boolean {
  return id.startsWith('g:')
}

const NEW_ID = new RegExp(`^g:(.+):(${[...TABLE_KINDS, ...TREND_KINDS].join('|')}):([0-9-]+|t):([0-9a-z]+)$`)
const OLD_ID = /^g:(.+):(fwd|rev|tf|match|order|max|min)(:|$)/

/** Which item, kind and table rows a generated question was about (also understands v0.1 ids). */
export function parseGeneratedId(id: string): { rid: string; kind: string; rows: number[] } | undefined {
  const m = id.match(NEW_ID)
  if (m) return { rid: m[1], kind: m[2], rows: m[3] === 't' ? [] : m[3].split('-').map(Number) }
  const o = id.match(OLD_ID)
  if (!o) return undefined
  const rest = id.slice(`g:${o[1]}:${o[2]}:`.length).split(':')
  let rows: number[] = []
  if (o[2] === 'fwd' || o[2] === 'rev' || o[2] === 'tf') rows = [Number(rest[0])].filter(Number.isFinite)
  else if (o[2] === 'match') rows = (rest[1] ?? '').split('-').map(Number).filter(Number.isFinite)
  return { rid: o[1], kind: o[2], rows }
}

export function rememberIdOf(generatedId: string): string | undefined {
  return parseGeneratedId(generatedId)?.rid
}

/** The level a generated question was made at (from its "lv:n" tag). */
export function levelOf(q: Question): Level | undefined {
  const tag = q.tags.find((t) => t.startsWith('lv:'))
  return tag ? clampLevel(Number(tag.slice(3))) : undefined
}
