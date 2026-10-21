// Everything that happens after he answers: attempt log, daily count, Galti Notebook.

import { db, type AttemptMode, type GaltiReason, type GaltiRow } from '../db/db'
import { getSetting } from '../db/settings'
import type { Question } from '../content/schema'
import { isGeneratedId } from './generate'
import type { Response, Verdict } from './marking'

export function localDate(t = Date.now()): string {
  const d = new Date(t)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return localDate(new Date(y, m - 1, d + n).getTime())
}

export interface AttemptInput {
  q: Question
  /** The id stored in the database; for practice variants this is the original question id. */
  qid: string
  verdict: Verdict
  response: Response | undefined
  mode: AttemptMode
  timeMs: number
  at?: number
}

export async function recordAttempt(a: AttemptInput): Promise<{ galti?: GaltiRow; graduated: boolean }> {
  const at = a.at ?? Date.now()
  const graduateAfter = await getSetting('graduateAfter')
  let graduated = false
  let galti: GaltiRow | undefined
  await db.transaction('rw', [db.attempts, db.days, db.galti], async () => {
    await db.attempts.add({
      qid: a.qid,
      chapter: a.q.chapter,
      at,
      mode: a.mode,
      correct: a.verdict.correct,
      partial: a.verdict.partial || undefined,
      response: a.response,
      timeMs: Math.round(a.timeMs),
    })
    if (a.verdict.attempted) {
      const date = localDate(at)
      const day = (await db.days.get(date)) ?? { date, answered: 0, correct: 0 }
      await db.days.put({ ...day, answered: day.answered + 1, correct: day.correct + (a.verdict.correct ? 1 : 0) })
    }

    const existing = await db.galti.get(a.qid)
    if (!a.verdict.attempted) return
    if (!a.verdict.correct) {
      galti = {
        qid: a.qid,
        chapter: a.q.chapter,
        addedAt: existing?.addedAt ?? at,
        lastAt: at,
        origin: existing?.origin ?? 'auto',
        reason: existing?.reason,
        streak: 0,
        wrongCount: (existing?.wrongCount ?? 0) + 1,
        status: 'active',
        note: existing?.note,
        snapshot: isGeneratedId(a.qid) ? a.q : existing?.snapshot,
      }
      await db.galti.put(galti)
    } else if (existing && existing.status === 'active') {
      const streak = existing.streak + 1
      graduated = streak >= graduateAfter
      galti = { ...existing, streak, lastAt: at, status: graduated ? 'graduated' : 'active', graduatedAt: graduated ? at : undefined }
      await db.galti.put(galti)
    }
  })
  return { galti, graduated }
}

export async function setGaltiReason(qid: string, reason: GaltiReason | undefined) {
  await db.galti.update(qid, { reason })
}

/** Consecutive days (ending today, or yesterday if today has nothing yet) with at least one answer. */
export function streakFrom(dates: Set<string>, today = localDate()): number {
  let d = dates.has(today) ? today : addDays(today, -1)
  let n = 0
  while (dates.has(d)) {
    n++
    d = addDays(d, -1)
  }
  return n
}

export async function currentStreak(): Promise<number> {
  const rows = await db.days.toArray()
  return streakFrom(new Set(rows.filter((r) => r.answered > 0).map((r) => r.date)))
}
