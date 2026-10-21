// IndexedDB layout (via Dexie). Two kinds of data live here:
//  - content (questions, remember, passages, papers, chapters, media, packs): can always be
//    re-imported from packs, so it is not part of the backup file;
//  - progress (everything else): exists only on this device, so it goes into backups.

import Dexie, { type EntityTable } from 'dexie'
import type { Passage, Paper, Question, Remember, MarkingScheme } from '../content/schema'
import type { Chapter } from '../content/syllabus'

export type Stored<T> = T & { packId: string }

export type QuestionRow = Stored<Question> & { origin: 'pack' | 'user' }
export type RememberRow = Stored<Remember>
export type PassageRow = Stored<Passage>
export type PaperRow = Stored<Paper>
export type ChapterRow = Stored<Chapter>

export interface MediaRow {
  hash: string
  blob: Blob
  type: string
  bytes: number
  packs: string[]
}

export interface PackRow {
  id: string
  title: string
  createdAt: string
  importedAt: number
  via: 'file' | 'paste' | 'repo' | 'user'
  sha256?: string
  bytes: number
  chapters: string[]
  counts: { questions: number; remember: number; passages: number; papers: number; media: number }
}

export type AttemptMode = 'practice' | 'test' | 'galti'

export interface AttemptRow {
  id?: number
  qid: string
  chapter: string
  at: number
  mode: AttemptMode
  correct: boolean
  /** Partially correct (multiple-correct with some right options chosen). */
  partial?: boolean
  response: unknown
  timeMs: number
}

export const GALTI_REASONS = ['concept', 'calculation', 'misread', 'forgot'] as const
export type GaltiReason = (typeof GALTI_REASONS)[number]
export const GALTI_REASON_LABEL: Record<GaltiReason, string> = {
  concept: 'Concept',
  calculation: 'Calculation',
  misread: 'Misread',
  forgot: "Didn't remember",
}

export interface GaltiRow {
  qid: string
  chapter: string
  addedAt: number
  lastAt: number
  origin: 'auto' | 'manual'
  reason?: GaltiReason
  /** Correct attempts in a row since the last mistake. */
  streak: number
  wrongCount: number
  status: 'active' | 'graduated'
  graduatedAt?: number
  note?: string
  /** Generated questions can't be rebuilt exactly, so Galti keeps the one he got wrong. */
  snapshot?: Question
}

export interface BookmarkRow {
  qid: string
  chapter: string
  at: number
}

export interface NoteRow {
  id?: number
  chapter: string
  qid?: string
  text: string
  at: number
}

/** Per-question user overrides that survive pack re-imports. */
export interface QMetaRow {
  qid: string
  keyStatus?: 'doubtful' | 'fixed' | 'confirmed'
  /** Replacement answer after "Key was wrong → fix". Same shape as the question's `answer`. */
  fixedAnswer?: unknown
  reports?: { at: number; text: string }[]
}

export interface TestResponse {
  answer?: unknown
  marked: boolean
  visited: boolean
  timeMs: number
}

export interface TestSection {
  name: string
  qids: string[]
  scheme: MarkingScheme
}

export interface TestRow {
  id: string
  title: string
  kind: 'custom' | 'paper' | 'mistakes'
  paperId?: string
  createdAt: number
  durationSec: number
  sections: TestSection[]
  state: 'ready' | 'running' | 'submitted'
  startedAt?: number
  /** Seconds left when the test was last paused or saved (tests survive app restarts). */
  remainingSec?: number
  submittedAt?: number
  current?: string
  responses: Record<string, TestResponse>
  /** Generated questions aren't stored anywhere else, so the test keeps its own copy. */
  snapshots?: Record<string, Question>
}

export interface DayRow {
  date: string
  answered: number
  correct: number
}

export interface SettingRow {
  key: string
  value: unknown
}

export class KagakuDB extends Dexie {
  questions!: EntityTable<QuestionRow, 'id'>
  remember!: EntityTable<RememberRow, 'id'>
  passages!: EntityTable<PassageRow, 'id'>
  papers!: EntityTable<PaperRow, 'id'>
  chapters!: EntityTable<ChapterRow, 'id'>
  media!: EntityTable<MediaRow, 'hash'>
  packs!: EntityTable<PackRow, 'id'>
  attempts!: EntityTable<AttemptRow, 'id'>
  galti!: EntityTable<GaltiRow, 'qid'>
  bookmarks!: EntityTable<BookmarkRow, 'qid'>
  notes!: EntityTable<NoteRow, 'id'>
  qmeta!: EntityTable<QMetaRow, 'qid'>
  tests!: EntityTable<TestRow, 'id'>
  days!: EntityTable<DayRow, 'date'>
  settings!: EntityTable<SettingRow, 'key'>

  constructor(name = 'kagaku') {
    super(name)
    this.version(1).stores({
      questions: 'id, chapter, packId, format, passage, verified',
      remember: 'id, chapter, packId, kind',
      passages: 'id, chapter, packId',
      papers: 'id, packId',
      chapters: 'id, packId',
      media: 'hash, *packs',
      packs: 'id, importedAt',
      attempts: '++id, qid, chapter, at, mode',
      galti: 'qid, chapter, status, addedAt',
      bookmarks: 'qid, chapter, at',
      notes: '++id, chapter, qid, at',
      qmeta: 'qid, keyStatus',
      tests: 'id, createdAt, state',
      days: 'date',
      settings: 'key',
    })
  }
}

export const CONTENT_TABLES = ['questions', 'remember', 'passages', 'papers', 'chapters', 'media', 'packs'] as const
export const PROGRESS_TABLES = ['attempts', 'galti', 'bookmarks', 'notes', 'qmeta', 'tests', 'days', 'settings'] as const

export let db = new KagakuDB()

/** Tests use a fresh database per case. */
export function useDatabase(next: KagakuDB) {
  db = next
}
