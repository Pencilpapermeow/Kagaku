import { db } from '../db/db'
import { newInkNote, type InkNoteRow, type InkPaper } from './types'

export async function createInkNote(chapter: string, paper: InkPaper = 'lines'): Promise<string> {
  const row = newInkNote(chapter, paper)
  await db.ink.put(row)
  return row.id
}

export async function saveInkNote(row: InkNoteRow): Promise<void> {
  await db.ink.put({ ...row, updatedAt: Date.now() })
}

/** A card left without a single stroke or a title isn't worth keeping. */
export function isEmptyInk(row: Pick<InkNoteRow, 'strokes' | 'title'>): boolean {
  return !row.strokes.length && !row.title?.trim()
}

export async function deleteInkNote(id: string): Promise<void> {
  await db.ink.delete(id)
}

/** Cards of a chapter in the order he wrote them (like pages of a notebook). */
export function chapterInk(chapter: string): Promise<InkNoteRow[]> {
  return db.ink.where('chapter').equals(chapter).sortBy('createdAt')
}
