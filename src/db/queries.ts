// Live queries used by pages. They re-render automatically when the database changes.

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { BASE_CHAPTERS, mergeChapters, type Chapter, type SubjectId } from '../content/syllabus'
import { currentStreak, localDate } from '../engine/progress'

export function useChapters(): Chapter[] {
  return useLiveQuery(async () => mergeChapters(BASE_CHAPTERS, await db.chapters.toArray()), [], BASE_CHAPTERS)
}

export function useChapter(id: string | undefined): Chapter | undefined {
  const chapters = useChapters()
  return chapters.find((c) => c.id === id)
}

export interface ChapterStat {
  total: number
  done: number
  remember: number
  galti: number
}

/** Per-chapter counts: stored questions, questions attempted at least once, remember items, active mistakes. */
export function useChapterStats(): Map<string, ChapterStat> | undefined {
  return useLiveQuery(async () => {
    const [qChapters, rChapters, attempts, galti] = await Promise.all([
      db.questions.orderBy('chapter').keys(),
      db.remember.orderBy('chapter').keys(),
      db.attempts.toArray(),
      db.galti.where('status').equals('active').toArray(),
    ])
    const m = new Map<string, ChapterStat>()
    const get = (c: string) => {
      let s = m.get(c)
      if (!s) m.set(c, (s = { total: 0, done: 0, remember: 0, galti: 0 }))
      return s
    }
    for (const c of qChapters) get(String(c)).total++
    for (const c of rChapters) get(String(c)).remember++
    const done = new Map<string, Set<string>>()
    for (const a of attempts) {
      if (a.qid.startsWith('g:')) continue
      if (!done.has(a.chapter)) done.set(a.chapter, new Set())
      done.get(a.chapter)!.add(a.qid)
    }
    for (const [c, s] of done) get(c).done = s.size
    for (const g of galti) get(g.chapter).galti++
    return m
  }, [])
}

export function subjectTotals(stats: Map<string, ChapterStat> | undefined, chapters: Chapter[], subject: SubjectId) {
  let total = 0
  let done = 0
  for (const c of chapters) {
    if (c.subject !== subject) continue
    const s = stats?.get(c.id)
    total += s?.total ?? 0
    done += s?.done ?? 0
  }
  return { total, done }
}

export function useToday() {
  return useLiveQuery(
    async () => {
      const day = await db.days.get(localDate())
      return { answered: day?.answered ?? 0, correct: day?.correct ?? 0, streak: await currentStreak() }
    },
    [],
    { answered: 0, correct: 0, streak: 0 },
  )
}

export function useContentCounts() {
  return useLiveQuery(
    async () => ({ questions: await db.questions.count(), remember: await db.remember.count(), packs: await db.packs.count() }),
    [],
    { questions: 0, remember: 0, packs: 0 },
  )
}
