// Builds practice sessions and test question lists from what is stored.

import { db, type GaltiRow, type QMetaRow } from '../db/db'
import type { Question, QuestionFormat } from '../content/schema'
import { generateFrom } from './generate'
import { makeRng, shuffle, type Rng } from './rng'

export type PracticeMode = 'mixed' | 'questions' | 'generated' | 'mistakes' | 'bookmarks' | 'doubtful'

export interface SessionParams {
  chapters?: string[]
  mode: PracticeMode
  format?: QuestionFormat
  size: number
  seed: number
}

/** Applies a "Key was wrong → fix" correction to a question. */
export function withFix(q: Question, meta?: QMetaRow): Question {
  return meta?.fixedAnswer !== undefined ? ({ ...q, answer: meta.fixedAnswer } as Question) : q
}

export async function generatedFor(chapters: string[] | undefined, rng: Rng): Promise<Question[]> {
  const items = chapters ? await db.remember.where('chapter').anyOf(chapters).toArray() : await db.remember.toArray()
  return items.flatMap((r) => generateFrom(r, rng))
}

/** Questions (stored, generated or Galti snapshots) for a list of ids. */
export async function questionsByIds(ids: string[], galti?: Map<string, GaltiRow>): Promise<Question[]> {
  const stored = await db.questions.bulkGet(ids)
  const out: Question[] = []
  ids.forEach((id, i) => {
    const q = stored[i] ?? galti?.get(id)?.snapshot
    if (q) out.push(q)
  })
  return out
}

export async function buildPractice(p: SessionParams): Promise<Question[]> {
  const rng = makeRng(p.seed)
  let pool: Question[] = []
  const inChapters = <T extends { chapter: string }>(x: T) => !p.chapters || p.chapters.includes(x.chapter)

  if (p.mode === 'mistakes') {
    const rows = (await db.galti.where('status').equals('active').toArray()).filter(inChapters)
    pool = await questionsByIds(
      rows.map((r) => r.qid),
      new Map(rows.map((r) => [r.qid, r])),
    )
  } else if (p.mode === 'bookmarks') {
    const rows = (await db.bookmarks.toArray()).filter(inChapters)
    const galti = new Map((await db.galti.bulkGet(rows.map((r) => r.qid))).filter(Boolean).map((g) => [g!.qid, g!]))
    pool = await questionsByIds(
      rows.map((r) => r.qid),
      galti,
    )
  } else if (p.mode === 'doubtful') {
    const rows = await db.qmeta.where('keyStatus').equals('doubtful').toArray()
    pool = (await questionsByIds(rows.map((r) => r.qid))).filter(inChapters)
  } else {
    if (p.mode !== 'generated') pool = p.chapters ? await db.questions.where('chapter').anyOf(p.chapters).toArray() : await db.questions.toArray()
    if (p.mode !== 'questions') pool = pool.concat(await generatedFor(p.chapters, rng))
  }
  if (p.format) pool = pool.filter((q) => q.format === p.format)
  if (!pool.length) return []

  // Prefer what he hasn't seen and what he got wrong; then mix the order.
  const ids = pool.map((q) => q.id)
  const [galti, metas, attempts] = await Promise.all([
    db.galti.bulkGet(ids),
    db.qmeta.bulkGet(ids),
    db.attempts.where('qid').anyOf(ids).toArray(),
  ])
  const seen = new Set(attempts.map((a) => a.qid))
  const lastRight = new Map<string, number>()
  for (const a of attempts) if (a.correct) lastRight.set(a.qid, Math.max(lastRight.get(a.qid) ?? 0, a.at))
  const weekAgo = Date.now() - 7 * 864e5
  const scored = pool.map((q, i) => {
    let s = rng()
    if (!seen.has(q.id)) s += 1
    if (galti[i]?.status === 'active') s += 0.7
    if ((lastRight.get(q.id) ?? 0) > weekAgo) s -= 0.5
    return { q: withFix(q, metas[i]), s }
  })
  scored.sort((a, b) => b.s - a.s)
  return shuffle(
    scored.slice(0, p.size).map((x) => x.q),
    rng,
  )
}

export interface CustomTestParams {
  chapters: string[]
  count: number
  includeGenerated: boolean
  formats?: QuestionFormat[]
  seed: number
}

/** Picks questions for "Create your own test", spread evenly over the chosen chapters. */
export async function pickTestQuestions(p: CustomTestParams): Promise<Question[]> {
  const rng = makeRng(p.seed)
  const byChapter = new Map<string, Question[]>()
  const stored: Question[] = await db.questions.where('chapter').anyOf(p.chapters).toArray()
  const all = p.includeGenerated ? stored.concat(await generatedFor(p.chapters, rng)) : stored
  for (const q of all) {
    if (p.formats?.length && !p.formats.includes(q.format)) continue
    byChapter.set(q.chapter, [...(byChapter.get(q.chapter) ?? []), q])
  }
  const lists = [...byChapter.values()].map((l) => shuffle(l, rng))
  const out: Question[] = []
  while (out.length < p.count && lists.some((l) => l.length)) for (const l of lists) if (l.length && out.length < p.count) out.push(l.pop()!)
  const metas = await db.qmeta.bulkGet(out.map((q) => q.id))
  return out.map((q, i) => withFix(q, metas[i]))
}
