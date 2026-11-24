// What device sync carries, one adapter per kind of item. Each item is one main file
// `<dir>/<id><ext>` on the sync branch (papers also have a zip of their pictures).

import { unzipSync, zipSync } from 'fflate'
import { db, newNoteUid, type MediaRow, type NoteRow } from '../db/db'
import { canonicalJson, sha256Hex } from '../content/hash'
import { importPack, isOwnPack, removePack } from '../content/importer'
import { newInkId, type InkNoteRow } from '../ink/types'
import { isEmptyInk } from '../ink/store'
import { deletePaper } from '../paper/store'
import { paperMediaTag, type UserPaperRow } from '../paper/types'
import type { FileChange, RemoteStore, RemoteTree } from './github'

export interface LocalItem {
  fp: string
  /** Still being made (a paper being read): leave it alone this time. */
  busy?: boolean
}

export interface ApplyContext {
  remote: RemoteTree
  store: RemoteStore
}

export type Resolution = 'same' | 'pull' | 'push' | 'both'

export interface Kind {
  name: string
  dir: string
  ext: string
  list(): Promise<Map<string, LocalItem>>
  fingerprint(id: string): Promise<string | undefined>
  /** Files to send; the main file comes first. */
  files(id: string, remote: RemoteTree): Promise<FileChange[]>
  apply(id: string, main: Uint8Array, ctx: ApplyContext): Promise<void>
  remove(id: string): Promise<void>
  /** Both sides changed (or both new): compare with the repo's version. */
  resolve(id: string, main: Uint8Array): Promise<Resolution>
  /** For 'both': keep this device's version as a separate item, so nothing is lost. */
  keepLocalCopy?(id: string): Promise<void>
  /** Other files that belong to the item (deleted with it). */
  extraPaths?(id: string, remote: RemoteTree): string[]
}

const dec = new TextDecoder()
const fpOf = async (text: string) => (await sha256Hex(text)).slice(0, 32)

// ---------------------------------------------------------------------------- ink cards
function inkText(r: InkNoteRow): string {
  return canonicalJson(r)
}

const ink: Kind = {
  name: 'ink',
  dir: 'ink',
  ext: '.json',
  async list() {
    const out = new Map<string, LocalItem>()
    // A blank card (just opened, nothing written yet) doesn't travel.
    for (const r of await db.ink.toArray()) if (!isEmptyInk(r)) out.set(r.id, { fp: await fpOf(inkText(r)) })
    return out
  },
  async fingerprint(id) {
    const r = await db.ink.get(id)
    return r && !isEmptyInk(r) ? fpOf(inkText(r)) : undefined
  },
  async files(id) {
    const r = await db.ink.get(id)
    return r ? [{ path: `ink/${id}.json`, data: inkText(r) }] : []
  },
  async apply(id, main) {
    const r = JSON.parse(dec.decode(main)) as InkNoteRow
    if (r.id !== id || !Array.isArray(r.strokes) || typeof r.chapter !== 'string') throw new Error('not a handwritten card')
    await db.ink.put(r)
  },
  async remove(id) {
    await db.ink.delete(id)
  },
  async resolve(id, main) {
    const r = await db.ink.get(id)
    return r && inkText(r) === dec.decode(main) ? 'same' : 'both'
  },
  async keepLocalCopy(id) {
    const r = await db.ink.get(id)
    if (r) await db.ink.put({ ...r, id: newInkId(), title: `${r.title?.trim() ? `${r.title.trim()} ` : ''}(this device's copy)`, updatedAt: Date.now() })
  },
}

// ---------------------------------------------------------------------------- typed notes
function noteText(n: NoteRow): string {
  return canonicalJson({ uid: n.uid, chapter: n.chapter, qid: n.qid, text: n.text, at: n.at })
}

const notes: Kind = {
  name: 'note',
  dir: 'notes',
  ext: '.json',
  async list() {
    const out = new Map<string, LocalItem>()
    for (const n of await db.notes.toArray()) if (n.uid) out.set(n.uid, { fp: await fpOf(noteText(n)) })
    return out
  },
  async fingerprint(uid) {
    const n = await db.notes.where('uid').equals(uid).first()
    return n ? fpOf(noteText(n)) : undefined
  },
  async files(uid) {
    const n = await db.notes.where('uid').equals(uid).first()
    return n ? [{ path: `notes/${uid}.json`, data: noteText(n) }] : []
  },
  async apply(uid, main) {
    const n = JSON.parse(dec.decode(main)) as NoteRow
    if (n.uid !== uid || typeof n.text !== 'string' || typeof n.chapter !== 'string') throw new Error('not a note')
    const old = await db.notes.where('uid').equals(uid).first()
    await db.notes.put({ ...(old?.id !== undefined ? { id: old.id } : {}), uid, chapter: n.chapter, qid: n.qid, text: n.text, at: n.at })
  },
  async remove(uid) {
    await db.notes.where('uid').equals(uid).delete()
  },
  async resolve(uid, main) {
    const n = await db.notes.where('uid').equals(uid).first()
    return n && noteText(n) === dec.decode(main) ? 'same' : 'both'
  },
  async keepLocalCopy(uid) {
    await db.notes.where('uid').equals(uid).modify((n) => {
      n.uid = newNoteUid()
    })
  },
}

// ---------------------------------------------------------------------------- papers
type SyncedPaper = Omit<UserPaperRow, 'bytes' | 'imagesDeleted' | 'progress' | 'stage' | 'error'>

/** The parts of a paper that are the same on every device (space used, deleted pictures are per device). */
function syncedPaper(r: UserPaperRow): SyncedPaper {
  const { bytes: _b, imagesDeleted: _i, progress: _p, stage: _s, error: _e, ...rest } = r
  return rest
}

export function paperMediaHashes(r: Pick<UserPaperRow, 'pages' | 'questions'>): string[] {
  const out = new Set<string>()
  const add = (ref?: string) => ref?.startsWith('media:') && out.add(ref.slice(6))
  r.pages.forEach((p) => add(p.image))
  r.questions.forEach((q) => add(q.image))
  return [...out].sort()
}

async function mediaZipPath(id: string, hashes: string[]): Promise<string> {
  return `papers/${id}.media.${(await sha256Hex(hashes.join(','))).slice(0, 16)}.zip`
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const TYPE: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

const papers: Kind = {
  name: 'paper',
  dir: 'papers',
  ext: '.json',
  async list() {
    const out = new Map<string, LocalItem>()
    for (const r of await db.userPapers.toArray()) out.set(r.id, { fp: await fpOf(canonicalJson(syncedPaper(r))), busy: r.status !== 'ready' })
    return out
  },
  async fingerprint(id) {
    const r = await db.userPapers.get(id)
    return r ? fpOf(canonicalJson(syncedPaper(r))) : undefined
  },
  async files(id, remote) {
    const r = await db.userPapers.get(id)
    if (!r) return []
    const out: FileChange[] = [{ path: `papers/${id}.json`, data: canonicalJson(syncedPaper(r)) }]
    const hashes = paperMediaHashes(r)
    if (!hashes.length) return out
    const zipPath = await mediaZipPath(id, hashes)
    if (remote.files.has(zipPath)) return out
    const media = await db.media.bulkGet(hashes)
    // Pictures deleted on this device: send the paper only (the repo may still have them).
    if (media.some((m) => !m)) return out
    const files: Record<string, Uint8Array> = {}
    for (const m of media as MediaRow[]) files[`${m.hash}.${EXT[m.type] ?? 'jpg'}`] = new Uint8Array(await m.blob.arrayBuffer())
    // Already-compressed JPEGs: storing them as they are is faster and no bigger.
    out.push({ path: zipPath, data: zipSync(files, { level: 0 }) })
    for (const p of remote.files.keys()) if (p.startsWith(`papers/${id}.media.`) && p !== zipPath) out.push({ path: p, data: null })
    return out
  },
  async apply(id, main, { remote, store }) {
    const row = JSON.parse(dec.decode(main)) as SyncedPaper
    if (row.id !== id || !Array.isArray(row.pages) || !Array.isArray(row.questions)) throw new Error('not a paper')
    const tag = paperMediaTag(id)
    const hashes = paperMediaHashes(row)
    const have = await db.media.bulkGet(hashes)
    const missing = new Set(hashes.filter((_, i) => !have[i]))
    if (missing.size) {
      const exact = await mediaZipPath(id, hashes)
      const zipSha = remote.files.get(exact) ?? [...remote.files.entries()].find(([p]) => p.startsWith(`papers/${id}.media.`))?.[1]
      if (zipSha) {
        const files = unzipSync(await store.get(zipSha))
        const rows: MediaRow[] = []
        for (const [name, bytes] of Object.entries(files)) {
          const [hash, ext] = name.split('.')
          if (!missing.has(hash)) continue
          const type = TYPE[ext] ?? 'image/jpeg'
          rows.push({ hash, blob: new Blob([bytes as BlobPart], { type }), type, bytes: bytes.byteLength, packs: [tag] })
          missing.delete(hash)
        }
        await db.media.bulkPut(rows)
      }
    }
    // Pictures that were already here (shared with Galti, say) now also belong to this paper.
    for (const m of have) if (m && !m.packs.includes(tag)) await db.media.update(m.hash, { packs: [...m.packs, tag] })
    const media = (await db.media.bulkGet(hashes)).filter(Boolean) as MediaRow[]
    await db.userPapers.put({
      ...row,
      bytes: media.reduce((a, m) => a + m.bytes, 0),
      imagesDeleted: row.pages.some((p) => missing.has(p.image.replace(/^media:/, ''))) || undefined,
    })
  },
  async remove(id) {
    await deletePaper(id)
  },
  async resolve(id, main) {
    const local = await db.userPapers.get(id)
    const remote = JSON.parse(dec.decode(main)) as SyncedPaper
    if (!local) return 'pull'
    if (canonicalJson(syncedPaper(local)) === dec.decode(main)) return 'same'
    return (remote.updatedAt ?? 0) > local.updatedAt ? 'pull' : 'push'
  },
  extraPaths(id, remote) {
    return [...remote.files.keys()].filter((p) => p.startsWith(`papers/${id}.media.`))
  },
}

// ---------------------------------------------------------------------------- packs he added
async function ownSources() {
  const rows = await db.packs.toArray()
  const own = new Set(rows.filter(isOwnPack).map((p) => p.id))
  return (await db.packSources.toArray()).filter((s) => own.has(s.id))
}

const packs: Kind = {
  name: 'pack',
  dir: 'packs',
  ext: '.kagaku',
  async list() {
    return new Map((await ownSources()).map((s) => [s.id, { fp: `src:${s.at}` }]))
  },
  async fingerprint(id) {
    return (await ownSources()).find((s) => s.id === id) ? `src:${(await db.packSources.get(id))!.at}` : undefined
  },
  async files(id) {
    const s = await db.packSources.get(id)
    return s ? [{ path: `packs/${id}.kagaku`, data: new Uint8Array(await s.blob.arrayBuffer()) }] : []
  },
  async apply(_id, main) {
    const { preview, row } = await importPack(main, 'sync')
    if (!row) throw new Error(preview.issues.find((i) => i.level === 'error')?.message ?? 'the pack could not be added')
  },
  async remove(id) {
    const row = await db.packs.get(id)
    if (row && isOwnPack(row)) await removePack(id)
  },
  async resolve(id, main) {
    const s = await db.packSources.get(id)
    if (!s) return 'pull'
    const local = new Uint8Array(await s.blob.arrayBuffer())
    return local.length === main.length && local.every((b, i) => b === main[i]) ? 'same' : 'pull'
  },
}

export const KINDS: Kind[] = [ink, notes, papers, packs]

/** Ids of a kind's items in the repo (its main files). */
export function remoteIds(kind: Kind, remote: RemoteTree): string[] {
  const out: string[] = []
  const pre = `${kind.dir}/`
  for (const p of remote.files.keys()) {
    if (!p.startsWith(pre) || !p.endsWith(kind.ext)) continue
    const id = p.slice(pre.length, p.length - kind.ext.length)
    if (id && !id.includes('/')) out.push(id)
  }
  return out
}

