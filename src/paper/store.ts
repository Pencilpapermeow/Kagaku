// Papers he adds himself: creating, keeping, re-cutting crops, starting tests, cleaning up.

import { db, type MediaRow } from '../db/db'
import { sha256Hex } from '../content/hash'
import type { Question } from '../content/schema'
import { createTest } from '../engine/cbt'
import { mediaBlob } from '../ui/content'
import { cbtSections } from './match'
import { paperMediaTag, parsePaperQuestionId, type PaperFileRow, type PaperQuestion, type UserPaperRow } from './types'

export function newPaperId(): string {
  return `up${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

/** Store an image once (by content hash) and tag it with the paper. Returns "media:<hash>". */
export async function putMedia(blob: Blob, tag: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const hash = await sha256Hex(bytes as BufferSource)
  const old = await db.media.get(hash)
  const row: MediaRow = { hash, blob: old?.blob ?? blob, type: blob.type || 'image/jpeg', bytes: bytes.byteLength, packs: [...new Set([...(old?.packs ?? []), tag])] }
  await db.media.put(row)
  return `media:${hash}`
}

/** "Test from paper" title from a file name like "AITS_04_Mains__Test_Paper.pdf"; camera names don't count. */
export function titleFromFileName(name: string): string | undefined {
  const t = name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^[0-9a-f]{6,}[-_]+(?:[0-9a-f]{6,}[-_]+)*/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t || /^(img|image|photo|scan|pxl|dsc|screenshot|whatsapp image|document|camscanner)\b/i.test(t) || !/[A-Za-z]{2}/.test(t)) return undefined
  // "paper.pdf", "key.pdf": the cover's own title says more.
  if (/^(paper|test|test paper|question paper|questions?|key|answer key|answers?|new|untitled|download)$/i.test(t)) return undefined
  return t.slice(0, 80)
}

export interface NewPaperFile {
  role: 'paper' | 'key'
  file: Blob
  name: string
  turns: number
  corners?: [number, number][]
}

export async function createPaper(files: NewPaperFile[], opts: { keyInPaper?: number[] } = {}): Promise<string> {
  const id = newPaperId()
  const now = Date.now()
  const paperFiles = files.filter((f) => f.role === 'paper')
  const title = paperFiles.map((f) => titleFromFileName(f.name)).find(Boolean) ?? `Paper · ${new Date(now).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
  const row: UserPaperRow = {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    status: 'processing',
    stage: 'pages',
    progress: { label: 'Starting…', done: 0, total: 0 },
    durationMin: 180,
    optionStyle: 'letters',
    sources: files.map((f) => ({ role: f.role, name: f.name, type: f.file.type })),
    keyInPaper: opts.keyInPaper,
    pages: [],
    sections: [],
    questions: [],
    key: [],
    warnings: [],
    bytes: 0,
  }
  const rows: PaperFileRow[] = files.map((f, order) => ({ paperId: id, role: f.role, order, name: f.name, type: f.file.type, blob: f.file, turns: f.turns, corners: f.corners }))
  await db.transaction('rw', db.userPapers, db.paperFiles, async () => {
    await db.userPapers.put(row)
    await db.paperFiles.bulkAdd(rows)
  })
  return id
}

export async function savePaper(id: string, patch: Partial<UserPaperRow>): Promise<UserPaperRow | undefined> {
  const row = await db.userPapers.get(id)
  if (!row) return undefined
  const next = { ...row, ...patch, updatedAt: Date.now() }
  await db.userPapers.put(next)
  return next
}

export async function paperBytes(id: string): Promise<number> {
  const media = await db.media.where('packs').equals(paperMediaTag(id)).toArray()
  return media.reduce((a, m) => a + m.bytes, 0)
}

/** Cut (or re-cut) the picture of one question from its pieces. */
export async function cropQuestion(paper: UserPaperRow, q: PaperQuestion): Promise<string | undefined> {
  if (!q.pieces.length) return undefined
  const { cutCrop } = await import('./images')
  const pages: Record<number, Blob> = {}
  for (const p of q.pieces) {
    if (pages[p.page]) continue
    const b = await mediaBlob(paper.pages[p.page].image)
    if (!b) throw new Error('The page images of this paper were deleted')
    pages[p.page] = b
  }
  const out = await cutCrop(pages, q.pieces)
  return out ? putMedia(out.blob, paperMediaTag(paper.id)) : undefined
}

/** Images that Galti snapshots still show: they must outlive the paper (and go into backups). */
export async function galtiMediaHashes(): Promise<Set<string>> {
  const out = new Set<string>()
  const add = (ref?: string) => ref?.startsWith('media:') && out.add(ref.slice(6))
  await db.galti.each((g) => {
    const q = g.snapshot as (Question & { options?: { image?: string }[] }) | undefined
    if (!q) return
    add(q.image)
    add(q.solutionImage)
    q.options?.forEach((o) => add(o.image))
  })
  return out
}

/** Frees the space of a paper's pictures; results stay. Pictures used by Galti are kept. */
export async function deletePaperImages(id: string): Promise<void> {
  const tag = paperMediaTag(id)
  const keep = await galtiMediaHashes()
  await db.transaction('rw', db.media, db.userPapers, db.paperFiles, async () => {
    const media = await db.media.where('packs').equals(tag).toArray()
    for (const m of media) {
      const packs = m.packs.filter((p) => p !== tag)
      if (keep.has(m.hash)) await db.media.update(m.hash, { packs: [...new Set([...packs, 'galti'])] })
      else if (packs.length) await db.media.update(m.hash, { packs })
      else await db.media.delete(m.hash)
    }
    await db.paperFiles.where('paperId').equals(id).delete()
    const row = await db.userPapers.get(id)
    if (row) await db.userPapers.put({ ...row, imagesDeleted: true, bytes: 0, updatedAt: Date.now() })
  })
}

export async function deletePaper(id: string): Promise<void> {
  await deletePaperImages(id)
  await db.userPapers.delete(id)
}

/** A new CBT attempt of the paper. Returns the test id. */
export async function startPaperTest(id: string): Promise<string> {
  const paper = await db.userPapers.get(id)
  if (!paper) throw new Error('Paper not found')
  if (paper.imagesDeleted) throw new Error('The pictures of this paper were deleted')
  const sections = cbtSections(paper)
  if (!sections.length) throw new Error('No question is ready yet')
  const t = await createTest({ title: paper.title, kind: 'upaper', durationMin: paper.durationMin, sections, userPaperId: id })
  await savePaper(id, { checkedAt: paper.checkedAt ?? Date.now() })
  return t.id
}

/**
 * He picked the real chapter of a paper question (after a test): Galti then shows it
 * under that chapter, mistake patterns count it there, and later attempts carry it.
 */
export async function setPaperQuestionChapter(qid: string, chapter: string): Promise<void> {
  const ref = parsePaperQuestionId(qid)
  if (!ref) return
  const paper = await db.userPapers.get(ref.paperId)
  if (paper) await savePaper(paper.id, { questions: paper.questions.map((q) => (q.uid === ref.uid ? { ...q, chapter } : q)) })
  const g = await db.galti.get(qid)
  if (g) await db.galti.put({ ...g, chapter, snapshot: g.snapshot ? { ...g.snapshot, chapter } : g.snapshot })
  await db.tests
    .filter((t) => !!t.snapshots?.[qid])
    .modify((t) => {
      t.snapshots![qid] = { ...t.snapshots![qid], chapter }
    })
}
