// CBT tests in the NTA style: palette states, timer persistence, submission and analysis.

import { db, type TestRow, type TestSection, type TestResponse } from '../db/db'
import type { MarkingScheme, Question } from '../content/schema'
import { check, isEmpty, maxMarks, ruleFor, score, type Response, type Verdict } from './marking'
import { isGeneratedId } from './generate'
import { recordAttempt } from './progress'
import { questionsByIds, withFix } from './session'

export type PaletteState = 'notVisited' | 'notAnswered' | 'answered' | 'marked' | 'answeredMarked'

export const PALETTE_LABEL: Record<PaletteState, string> = {
  notVisited: 'Not Visited',
  notAnswered: 'Not Answered',
  answered: 'Answered',
  marked: 'Marked for Review',
  answeredMarked: 'Answered & Marked for Review (will be evaluated)',
}

export function paletteState(r: TestResponse | undefined): PaletteState {
  if (!r || !r.visited) return 'notVisited'
  const answered = !isEmpty(r.answer as Response | undefined)
  if (r.marked) return answered ? 'answeredMarked' : 'marked'
  return answered ? 'answered' : 'notAnswered'
}

export function newTestId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export async function createTest(opts: {
  title: string
  kind: TestRow['kind']
  durationMin: number
  sections: { name: string; questions: Question[]; scheme: MarkingScheme }[]
  paperId?: string
}): Promise<TestRow> {
  const snapshots: Record<string, Question> = {}
  const sections: TestSection[] = opts.sections.map((s) => {
    for (const q of s.questions) if (isGeneratedId(q.id) || !q.id) snapshots[q.id] = q
    return { name: s.name, qids: s.questions.map((q) => q.id), scheme: s.scheme }
  })
  const row: TestRow = {
    id: newTestId(),
    title: opts.title,
    kind: opts.kind,
    paperId: opts.paperId,
    createdAt: Date.now(),
    durationSec: Math.round(opts.durationMin * 60),
    sections,
    state: 'ready',
    responses: {},
    snapshots,
  }
  await db.tests.put(row)
  return row
}

/** All questions of a test in order, with key fixes applied. */
export async function loadTestQuestions(t: TestRow): Promise<Map<string, Question>> {
  const ids = t.sections.flatMap((s) => s.qids)
  const stored = await questionsByIds(ids.filter((id) => !t.snapshots?.[id]))
  const metas = await db.qmeta.bulkGet(ids)
  const map = new Map<string, Question>()
  for (const q of stored) map.set(q.id, q)
  for (const [id, q] of Object.entries(t.snapshots ?? {})) map.set(id, q)
  ids.forEach((id, i) => {
    const q = map.get(id)
    if (q) map.set(id, withFix(q, metas[i]))
  })
  return map
}

export interface QuestionResult {
  qid: string
  section: string
  chapter: string
  format: Question['format']
  verdict: Verdict
  marks: number
  max: number
  timeMs: number
}

export interface TestResult {
  total: number
  max: number
  correct: number
  wrong: number
  partial: number
  unattempted: number
  timeMs: number
  perQuestion: QuestionResult[]
  bySection: { name: string; marks: number; max: number; correct: number; wrong: number; unattempted: number }[]
  byChapter: { chapter: string; marks: number; max: number; correct: number; wrong: number; unattempted: number }[]
}

export function evaluate(t: TestRow, questions: Map<string, Question>): TestResult {
  const perQuestion: QuestionResult[] = []
  for (const s of t.sections) {
    for (const qid of s.qids) {
      const q = questions.get(qid)
      if (!q) continue
      const r = t.responses[qid]
      const verdict = check(q, r?.answer as Response | undefined)
      perQuestion.push({
        qid,
        section: s.name,
        chapter: q.chapter,
        format: q.format,
        verdict,
        marks: score(ruleFor(s.scheme, q.format), verdict),
        max: maxMarks(s.scheme, q.format),
        timeMs: r?.timeMs ?? 0,
      })
    }
  }
  const group = (key: (x: QuestionResult) => string) => {
    const m = new Map<string, { marks: number; max: number; correct: number; wrong: number; unattempted: number }>()
    for (const x of perQuestion) {
      const g = m.get(key(x)) ?? { marks: 0, max: 0, correct: 0, wrong: 0, unattempted: 0 }
      g.marks += x.marks
      g.max += x.max
      if (!x.verdict.attempted) g.unattempted++
      else if (x.verdict.correct) g.correct++
      else g.wrong++
      m.set(key(x), g)
    }
    return m
  }
  const count = (f: (x: QuestionResult) => boolean) => perQuestion.filter(f).length
  return {
    total: perQuestion.reduce((a, x) => a + x.marks, 0),
    max: perQuestion.reduce((a, x) => a + x.max, 0),
    correct: count((x) => x.verdict.correct),
    wrong: count((x) => x.verdict.attempted && !x.verdict.correct),
    partial: count((x) => x.verdict.partial),
    unattempted: count((x) => !x.verdict.attempted),
    timeMs: perQuestion.reduce((a, x) => a + x.timeMs, 0),
    perQuestion,
    bySection: [...group((x) => x.section).entries()].map(([name, g]) => ({ name, ...g })),
    byChapter: [...group((x) => x.chapter).entries()].map(([chapter, g]) => ({ chapter, ...g })),
  }
}

/** Locks the test and logs every answered question (wrong ones go to Galti). */
export async function submitTest(id: string): Promise<void> {
  const t = await db.tests.get(id)
  if (!t || t.state === 'submitted') return
  const now = Date.now()
  await db.tests.update(id, { state: 'submitted', submittedAt: now, remainingSec: 0 })
  const questions = await loadTestQuestions(t)
  for (const s of t.sections)
    for (const qid of s.qids) {
      const q = questions.get(qid)
      const r = t.responses[qid]
      if (!q || isEmpty(r?.answer as Response | undefined)) continue
      await recordAttempt({ q, qid, verdict: check(q, r!.answer as Response), response: r!.answer as Response, mode: 'test', timeMs: r!.timeMs, at: now })
    }
}
