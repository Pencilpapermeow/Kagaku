// IndexedDB layout (via Dexie). Two kinds of data live here:
//  - content (questions, remember, passages, papers, chapters, media, packs): can always be
//    re-imported from packs, so it is not part of the backup file;
//  - progress (everything else): exists only on this device, so it goes into backups.

import Dexie, { type EntityTable } from 'dexie'
import type { Passage, Paper, Question, Remember, MarkingScheme } from '../content/schema'
import type { Chapter } from '../content/syllabus'
import type { PaperFileRow, UserPaperRow } from '../paper/types'
import type { InkNoteRow } from '../ink/types'

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
  /** 'sync': arrived from his other device through device sync. */
  via: 'file' | 'paste' | 'repo' | 'user' | 'sync'
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
  /** Same on every device (device sync); the numeric id is only local. */
  uid?: string
  chapter: string
  qid?: string
  text: string
  at: number
}

export function newNoteUid(): string {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/** Device sync: what each synced item looked like when both sides last agreed. */
export interface SyncBaseRow {
  /** "<kind>/<id>", e.g. "ink/ink1abc", "paper/up1x2y". */
  key: string
  /** Fingerprint of the item on this device at that moment. */
  local: string
  /** Git blob sha (or media-set fingerprint) of the item in the repo at that moment. */
  remote: string
}

/** The original file of a pack he added by paste or file, so device sync can send it on. */
export interface PackSourceRow {
  id: string
  blob: Blob
  bytes: number
  at: number
}

/** Per-question user overrides that survive pack re-imports. */
export interface QMetaRow {
  qid: string
  keyStatus?: 'doubtful' | 'fixed' | 'confirmed'
  /** Replacement answer after "Key was wrong → fix". Same shape as the question's `answer`. */
  fixedAnswer?: unknown
  reports?: { at: number; text: string }[]
  /** When he ticked this item on the review screen (accuracy layer 4). */
  reviewedAt?: number
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
  kind: 'custom' | 'paper' | 'mistakes' | 'upaper'
  paperId?: string
  /** "Test from paper": the paper he added himself (userPapers). */
  userPaperId?: string
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
  userPapers!: EntityTable<UserPaperRow, 'id'>
  paperFiles!: EntityTable<PaperFileRow, 'id'>
  ink!: EntityTable<InkNoteRow, 'id'>
  syncBase!: EntityTable<SyncBaseRow, 'key'>
  packSources!: EntityTable<PackSourceRow, 'id'>

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
    // v2: "Test from paper". Papers he adds himself (page images live in media with
    // packs ['paper:<id>']), and their raw uploads until processing has finished.
    this.version(2).stores({
      userPapers: 'id, createdAt, status',
      paperFiles: '++id, paperId',
    })
    // v3: handwritten point cards, and device sync (typed notes get an id that is the
    // same on every device; syncBase remembers the last agreed state of each item).
    this.version(3)
      .stores({
        notes: '++id, chapter, qid, at, uid',
        ink: 'id, chapter, updatedAt',
        syncBase: 'key',
        packSources: 'id',
      })
      .upgrade((tx) =>
        tx
          .table('notes')
          .toCollection()
          .modify((n: NoteRow) => {
            n.uid ??= newNoteUid()
          }),
      )
  }
}

export const CONTENT_TABLES = ['questions', 'remember', 'passages', 'papers', 'chapters', 'media', 'packs'] as const
export const PROGRESS_TABLES = ['attempts', 'galti', 'bookmarks', 'notes', 'ink', 'qmeta', 'tests', 'days', 'settings'] as const

export let db = new KagakuDB()

/** Tests use a fresh database per case. */
export function useDatabase(next: KagakuDB) {
  db = next
}
