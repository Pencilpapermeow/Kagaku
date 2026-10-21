// Questions generated from "To Remember" data, without any AI:
//   tables  → "what is X for Y" (forward), "which Y has X" (reverse), true/false, match-the-following
//   trends  → arrange in order, highest / lowest
// Wrong options always come from the same column (or the same trend), so they are believable.
//
// Generated ids look like "g:<rememberId>:<kind>:…". Attempts point at them; Galti keeps a
// snapshot of the generated question, since the random parts can't be rebuilt exactly.

import type { Option, Question, Remember } from '../content/schema'
import { pick, sample, shuffle, type Rng } from './rng'

type Table = Extract<Remember, { kind: 'table' }>
type Trend = Extract<Remember, { kind: 'trend' }>

const base = (r: Remember) => ({
  chapter: r.chapter,
  topic: r.topic,
  verified: r.verified,
  source: r.source,
  tags: ['generated'],
})

const opt = (texts: string[]): Option[] => texts.map((text, i) => ({ id: `o${i}`, text }))

const norm = (s: string) => s.trim().replace(/\s+/g, ' ')

function distinctValues(t: Table, col: string, except: string): string[] {
  const seen = new Set<string>([norm(except)])
  const out: string[] = []
  for (const row of t.rows) {
    const v = row[col]
    if (v && !seen.has(norm(v))) {
      seen.add(norm(v))
      out.push(v)
    }
  }
  return out
}

function choiceQuestion(id: string, r: Remember, stem: string, correct: string, wrong: string[], rng: Rng): Question {
  const options = opt([correct, ...sample(wrong, 3, rng)])
  return { ...base(r), id, format: 'single', stem, options: shuffle(options, rng), answer: 'o0' }
}

export function generateFromTable(t: Table, rng: Rng): Question[] {
  const out: Question[] = []
  const key = t.columns.find((c) => c.key === t.keyColumn)
  if (!key) return out
  const cols = t.columns.filter((c) => c.key !== t.keyColumn && c.quiz !== false)

  t.rows.forEach((row, ri) => {
    const name = row[t.keyColumn]
    if (!name) return
    for (const c of cols) {
      const value = row[c.key]
      if (!value?.trim()) continue
      const wrong = distinctValues(t, c.key, value)
      if (wrong.length >= 2)
        out.push(choiceQuestion(`g:${t.id}:fwd:${ri}:${c.key}`, t, `**${t.title}** — ${c.label} for ${name}?`, value, wrong, rng))

      const sameValue = t.rows.filter((x) => norm(x[c.key] ?? '') === norm(value)).length
      const otherNames = distinctValues(t, t.keyColumn, name)
      if (sameValue === 1 && otherNames.length >= 2)
        out.push(choiceQuestion(`g:${t.id}:rev:${ri}:${c.key}`, t, `**${t.title}** — which ${key.label} has ${c.label} = ${value}?`, name, otherNames, rng))

      if (wrong.length >= 1) {
        const truthy = rng() < 0.5
        const shown = truthy ? value : pick(wrong, rng)
        const shownIdx = truthy ? ri : t.rows.findIndex((x) => x[c.key] === shown)
        out.push({
          ...base(t),
          id: `g:${t.id}:tf:${ri}:${c.key}:${shownIdx}`,
          format: 'truefalse',
          stem: `**${t.title}** — for ${name}, ${c.label} is ${shown}.`,
          answer: truthy,
        })
      }
    }
  })

  // Match the following: 4 rows against one column, only if those values are all different.
  for (const c of cols) {
    const usable = t.rows.map((row, ri) => ({ row, ri })).filter(({ row }) => row[t.keyColumn] && row[c.key]?.trim())
    if (usable.length < 3) continue
    const picked = sample(usable, Math.min(4, usable.length), rng)
    if (new Set(picked.map((p) => norm(p.row[c.key]))).size !== picked.length) continue
    const left = picked.map((p, i) => ({ id: 'PQRS'[i], text: p.row[t.keyColumn] }))
    const right = shuffle(
      picked.map((p, i) => ({ id: String(i + 1), text: p.row[c.key] })),
      rng,
    ).map((o, i) => ({ ...o, id: String(i + 1), _orig: o.id }))
    const answer: Record<string, string> = {}
    picked.forEach((_, i) => {
      answer['PQRS'[i]] = right.find((x) => x._orig === String(i + 1))!.id
    })
    out.push({
      ...base(t),
      id: `g:${t.id}:match:${c.key}:${picked.map((p) => p.ri).join('-')}`,
      format: 'match',
      stem: `**${t.title}** — match ${key.label} with ${c.label}.`,
      left,
      right: right.map(({ id, text }) => ({ id, text })),
      answer,
    })
  }
  return out
}

export function generateFromTrend(t: Trend, rng: Rng): Question[] {
  const out: Question[] = []
  const n = t.order.length
  const decreasing = rng() < 0.5
  const items = t.order.map((text, i) => ({ id: `i${i}`, text }))
  const answer = items.map((i) => i.id)
  out.push({
    ...base(t),
    id: `g:${t.id}:order:${decreasing ? 'dec' : 'inc'}`,
    format: 'ordering',
    stem: `Arrange in **${decreasing ? 'decreasing' : 'increasing'}** order of ${t.property}.`,
    items: shuffle(items, rng),
    answer: decreasing ? [...answer].reverse() : answer,
  })
  if (n >= 3) {
    const highest = rng() < 0.5
    const target = highest ? t.order[n - 1] : t.order[0]
    const others = highest ? t.order.slice(0, n - 1) : t.order.slice(1)
    out.push(choiceQuestion(`g:${t.id}:${highest ? 'max' : 'min'}`, t, `Which has the **${highest ? 'highest' : 'lowest'}** ${t.property}?`, target, others, rng))
  }
  return out
}

export function generateFrom(r: Remember, rng: Rng): Question[] {
  if (r.kind === 'table') return generateFromTable(r, rng)
  if (r.kind === 'trend') return generateFromTrend(r, rng)
  return []
}

export function isGeneratedId(id: string): boolean {
  return id.startsWith('g:')
}

const GEN_ID = /^g:(.+):(fwd|rev|tf|match|order|max|min)(:|$)/

export function rememberIdOf(generatedId: string): string | undefined {
  return generatedId.match(GEN_ID)?.[1]
}
