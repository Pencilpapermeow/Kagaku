// Backup = everything that exists only on this device: progress, Galti, notes, bookmarks,
// test history, settings, and his own added questions with their photos.
// Content packs are not included; they can be re-installed from the repo or files.

import { db, PROGRESS_TABLES, type MediaRow, type QuestionRow } from './db'
import { setSetting } from './settings'

export const BACKUP_FORMAT = 'kagaku-backup'

interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: 1
  createdAt: string
  tables: Record<string, unknown[]>
  userQuestions: QuestionRow[]
  userMedia: (Omit<MediaRow, 'blob'> & { data: string })[]
}

async function toBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}

function fromBase64(s: string, type: string): Blob {
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

export async function makeBackup(): Promise<Blob> {
  const tables: Record<string, unknown[]> = {}
  for (const t of PROGRESS_TABLES) {
    const rows = await db.table(t).toArray()
    // Secrets stay on the device.
    tables[t] = t === 'settings' ? rows.filter((r: { key: string }) => r.key !== 'githubToken' && r.key !== 'geminiKey') : rows
  }
  const userQuestions = await db.questions.where('packId').equals('user').toArray()
  const media = await db.media.where('packs').equals('user').toArray()
  const userMedia = await Promise.all(media.map(async ({ blob, ...m }) => ({ ...m, data: await toBase64(blob) })))
  const file: BackupFile = { format: BACKUP_FORMAT, version: 1, createdAt: new Date().toISOString(), tables, userQuestions, userMedia }
  return new Blob([JSON.stringify(file)], { type: 'application/json' })
}

export async function downloadBackup() {
  const blob = await makeBackup()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `kagaku-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  await setSetting('lastBackupAt', Date.now())
}

/** Replaces all progress on this device with the backup. Content packs are untouched. */
export async function restoreBackup(file: Blob): Promise<{ attempts: number; galti: number }> {
  const data = JSON.parse(await file.text()) as BackupFile
  if (data.format !== BACKUP_FORMAT) throw new Error('This is not a Kagaku backup file.')
  const keep = await db.settings.bulkGet(['githubToken', 'geminiKey'])
  await db.transaction('rw', [...PROGRESS_TABLES.map((t) => db.table(t)), db.questions, db.media], async () => {
    for (const t of PROGRESS_TABLES) {
      await db.table(t).clear()
      await db.table(t).bulkPut(data.tables[t] ?? [])
    }
    for (const k of keep) if (k) await db.settings.put(k)
    await db.questions.bulkPut(data.userQuestions ?? [])
    await db.media.bulkPut((data.userMedia ?? []).map(({ data: d, ...m }) => ({ ...m, blob: fromBase64(d, m.type) })))
  })
  return { attempts: data.tables.attempts?.length ?? 0, galti: data.tables.galti?.length ?? 0 }
}
