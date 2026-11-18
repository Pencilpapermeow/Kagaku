// "Test from paper": a question paper + its answer key (photos or PDF) become an offline
// NTA-style CBT test. Everything here runs on the device; nothing is uploaded.
//
// This is the one place where questions live as images (crops of his own paper), and
// only inside papers he adds himself. They never enter packs, db.questions, practice
// pools, chapter counts, Search or the Review queue. See docs/PAPER_TEST.md.

import type { SchemeRule } from '../content/schema'
import type { SubjectId } from '../content/syllabus'

/** A rectangle in page-image pixels. */
export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface TextWord extends Box {
  text: string
  /** OCR confidence 0–100 (absent for a PDF text layer). */
  conf?: number
}

export interface TextLine extends Box {
  text: string
  words: TextWord[]
  conf?: number
}

export interface PageText {
  source: 'pdf' | 'ocr'
  lines: TextLine[]
  /** Mean OCR confidence of the page. */
  conf?: number
}

export interface PaperPage {
  role: 'paper' | 'key'
  /** media:<sha256> of the cleaned page image (JPEG). */
  image: string
  width: number
  height: number
  /** Where it came from: file index (in upload order) and page number inside a PDF (1-based). */
  file: number
  pdfPage?: number
  /** Filled once the page has been read (PDF text layer or OCR). */
  text?: PageText
}

/** A part of a question on one page. A question that runs into the next column has several. */
export interface Piece {
  page: number
  box: Box
}

export type PaperFormat = 'single' | 'multiple' | 'integer' | 'numerical'

export const PAPER_FORMATS: PaperFormat[] = ['single', 'multiple', 'integer', 'numerical']

export interface PaperSection {
  name: string
  subject: SubjectId
  format: PaperFormat
  rule: SchemeRule
  /** Where the type came from. Anything but 'instructions' is shown as a doubt until he confirms. */
  typeFrom: 'instructions' | 'key' | 'default' | 'user'
  marksFrom: 'instructions' | 'preset' | 'user'
  /** The section's instruction text, for reference on the check screen. */
  note?: string
  ok?: boolean
}

/** A key answer as it should be checked. Same shapes as Question['answer']. */
export interface PaperKey {
  answer: string | string[] | number
  /** Numerical: absolute tolerance (from a range like "2.50 to 2.70"). */
  tolerance?: number
  /** Single-correct: other options that are also accepted ("A or C"). */
  accept?: string[]
  /** "Bonus" / "Dropped": full marks to everyone. */
  bonus?: boolean
  /** How the key printed it, e.g. "(A,C)" or "2.50 to 2.70". */
  raw?: string
}

export interface PaperQuestion {
  /** Stable id inside the paper (question id = p:<paperId>:<uid>). */
  uid: number
  /** Number printed on the paper. */
  n: number
  section: number
  format: PaperFormat
  /** Options for single/multiple (A–D normally). */
  options: number
  pieces: Piece[]
  key?: PaperKey
  /** Things noticed while reading the key or cutting the crop; cleared when he edits that part. */
  keyNote?: string
  cropNote?: string
  /** He tapped "Looks fine" on this question's doubts. */
  ok?: boolean
  /** media:<sha256> of the stacked crop shown in the test. */
  image?: string
  /** The real chapter he picked after a test (default: the subject's "From papers" bucket). */
  chapter?: string
}

export type KeyAnswer =
  | { kind: 'letters'; letters: string[]; either?: boolean }
  | { kind: 'number'; value: number; paren?: boolean }
  | { kind: 'range'; min: number; max: number }
  | { kind: 'bonus' }

export interface KeyEntry {
  n: number
  /** "PAPER-1" / "PAPER-2" heading above it in a key that holds both JA papers. */
  paper?: number
  /** Numbering block: a new block starts when numbers restart (keys split by subject). */
  block: number
  subject?: SubjectId
  answer?: KeyAnswer
  raw: string
  conf?: number
}

export type PaperStatus = 'processing' | 'ready' | 'failed'

export interface UserPaperRow {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  status: PaperStatus
  stage?: 'pages' | 'read' | 'detect'
  progress?: { label: string; done: number; total: number }
  error?: string
  durationMin: number
  optionStyle: 'letters' | 'numbers'
  /** Upload description, for the list and for resuming. */
  sources: { role: 'paper' | 'key'; name: string; type: string; pages?: number }[]
  /** Pages of the paper PDF (1-based) that hold the answer key, when he chose to use them. */
  keyInPaper?: number[]
  pages: PaperPage[]
  sections: PaperSection[]
  questions: PaperQuestion[]
  key: KeyEntry[]
  /** Which paper's answers were used when the key holds Paper 1 and Paper 2. */
  keyPaper?: number
  warnings: string[]
  checkedAt?: number
  imagesDeleted?: boolean
  bytes: number
}

/** Raw uploads, kept only until every page has been turned into a cleaned page image. */
export interface PaperFileRow {
  id?: number
  paperId: string
  role: 'paper' | 'key'
  order: number
  name: string
  type: string
  blob: Blob
  /** Quarter turns clockwise he asked for (photos). */
  turns: number
  /** Page corners he dragged (fractions of width/height: TL, TR, BR, BL). */
  corners?: [number, number][]
  done?: boolean
}

export function isPaperId(id: string | undefined): boolean {
  return !!id && id.startsWith('p:')
}

export function paperQuestionId(paperId: string, uid: number): string {
  return `p:${paperId}:${uid}`
}

export function parsePaperQuestionId(id: string): { paperId: string; uid: number } | undefined {
  const m = /^p:(.+):(\d+)$/.exec(id)
  return m ? { paperId: m[1], uid: Number(m[2]) } : undefined
}

export function paperMediaTag(paperId: string): string {
  return `paper:${paperId}`
}
