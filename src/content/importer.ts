// Pack import: read → validate → preview → commit.
// Nothing touches the database until commitPack(), so the Update Center can show a
// full preview (counts, warnings, errors) and let him decide.

import { unzipSync } from 'fflate'
import { z } from 'zod'
import { db, type MediaRow, type PackRow, type QuestionRow } from '../db/db'
import { canonicalJson, sha256Hex } from './hash'
import { zPack, type Pack, type Question, type Remember, type Passage, type Paper } from './schema'
import { BASE_CHAPTERS, mergeChapters, resolveChapterId, subjectOf, type Chapter } from './syllabus'

export type PackFiles = Record<string, Uint8Array>

export interface PackSource {
  json: unknown
  files: PackFiles
  bytes: number
  sha256: string
}

export interface Issue {
  level: 'error' | 'warning'
  path: string
  message: string
}

export interface PreparedPack {
  pack: Pack
  questions: Question[]
  remember: Remember[]
  passages: Passage[]
  papers: Paper[]
  chapters: Chapter[]
  media: Map<string, { bytes: Uint8Array; type: string }>
  source: PackSource
}

export interface PackPreview {
  ok: boolean
  issues: Issue[]
  prepared?: PreparedPack
  summary?: {
    title: string
    id: string
    questions: number
    remember: number
    passages: number
    papers: number
    media: number
    unverified: number
    replacing: number
    perChapter: { chapter: string; name: string; questions: number; remember: number }[]
    alreadyInstalled: boolean
  }
}

const enc = new TextEncoder()
const dec = new TextDecoder()

/** AI chats wrap JSON in ``` fences and sometimes add a sentence around it. */
export function extractJsonText(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fence ? fence[1] : text).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  return start >= 0 && end > start ? body.slice(start, end + 1) : body
}

export async function readPackSource(input: Blob | string | Uint8Array): Promise<PackSource> {
  let bytes: Uint8Array
  if (typeof input === 'string') bytes = enc.encode(input)
  else if (input instanceof Uint8Array) bytes = input
  else bytes = new Uint8Array(await input.arrayBuffer())

  const sha256 = await sha256Hex(bytes as BufferSource)
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b
  if (isZip) {
    const entries = unzipSync(bytes)
    const files: PackFiles = {}
    let jsonName: string | undefined
    for (const [name, data] of Object.entries(entries)) {
      if (name.endsWith('/')) continue
      files[name] = data
      if (name === 'pack.json') jsonName = name
    }
    jsonName ??= Object.keys(files).find((n) => n.endsWith('.json'))
    if (!jsonName) throw new Error('This .kagaku file has no pack.json inside.')
    const json = JSON.parse(dec.decode(files[jsonName]))
    delete files[jsonName]
    return { json, files, bytes: bytes.byteLength, sha256 }
  }
  const text = extractJsonText(dec.decode(bytes))
  try {
    return { json: JSON.parse(text), files: {}, bytes: bytes.byteLength, sha256 }
  } catch (e) {
    throw new Error(`Couldn't read this as JSON: ${(e as Error).message}`)
  }
}

const MEDIA_KEYS = new Set(['image', 'solutionImage'])

/** Calls fn for every media ref in an item and replaces it with the result. */
export function mapMediaRefs<T>(value: T, fn: (ref: string, path: string) => string, path = ''): T {
  if (Array.isArray(value)) return value.map((v, i) => mapMediaRefs(v, fn, `${path}[${i}]`)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const p = path ? `${path}.${k}` : k
      out[k] = MEDIA_KEYS.has(k) && typeof v === 'string' ? fn(v, p) : mapMediaRefs(v, fn, p)
    }
    return out as T
  }
  return value
}

function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  return ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : 'image/webp'
}

function decodeDataUri(uri: string): { bytes: Uint8Array; type: string } | undefined {
  const comma = uri.indexOf(',')
  if (!uri.startsWith('data:') || comma < 0) return undefined
  const [type, ...params] = uri.slice(5, comma).split(';')
  const body = uri.slice(comma + 1)
  try {
    if (params.includes('base64')) {
      const bin = atob(body)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return { bytes, type: type || 'application/octet-stream' }
    }
    return { bytes: enc.encode(decodeURIComponent(body)), type: type || 'text/plain' }
  } catch {
    return undefined
  }
}

function zodIssues(err: z.ZodError): Issue[] {
  return err.issues.slice(0, 50).map((i) => ({ level: 'error', path: i.path.join('.'), message: i.message }))
}

/** Fields that define what a question *is*; the answer is left out so a corrected key replaces the old copy. */
function identityOf(q: Question): unknown {
  const pick = (o?: { id: string; text?: string; image?: string }[]) => o?.map((x) => [x.text ?? '', x.image ?? ''])
  return {
    f: q.format,
    s: q.stem,
    i: q.image ?? '',
    o: 'options' in q ? pick(q.options) : undefined,
    l: 'left' in q ? pick(q.left) : undefined,
    r: 'right' in q ? pick(q.right) : undefined,
    t: 'items' in q ? pick(q.items) : undefined,
    a: 'assertion' in q ? [q.assertion, q.reason] : undefined,
  }
}

function checkQuestion(q: Question, path: string, issues: Issue[]) {
  const err = (message: string) => issues.push({ level: 'error', path, message })
  const ids = (list: { id: string }[]) => {
    const s = new Set(list.map((x) => x.id))
    if (s.size !== list.length) err('option ids must be unique')
    return s
  }
  switch (q.format) {
    case 'single':
    case 'multiple': {
      const opts = ids(q.options)
      const answers = q.format === 'single' ? [q.answer] : q.answer
      for (const a of answers) if (!opts.has(a)) err(`answer "${a}" is not one of the option ids`)
      q.options.forEach((o, i) => {
        if (!o.text && !o.image) err(`option ${i + 1} needs its text (or a diagram image for a figure option)`)
      })
      break
    }
    case 'match': {
      const left = ids(q.left)
      const right = ids(q.right)
      for (const [l, r] of Object.entries(q.answer)) {
        if (!left.has(l)) err(`answer row "${l}" is not in left`)
        for (const x of Array.isArray(r) ? r : [r]) if (!right.has(x)) err(`answer "${x}" is not in right`)
      }
      for (const l of left) if (!(l in q.answer)) err(`left item "${l}" has no answer`)
      break
    }
    case 'ordering': {
      const items = ids(q.items)
      if (q.answer.length !== items.size || !q.answer.every((a) => items.has(a)) || new Set(q.answer).size !== q.answer.length)
        err('answer must list every item id exactly once')
      break
    }
    default:
      break
  }
  // Mixed form only: the question is always text; an image may only add its diagram.
  if (!q.stem.trim() && q.format !== 'assertion') err('question text is missing — write the question as text + LaTeX (images are only for diagrams)')
}

function checkRemember(r: Remember, path: string, issues: Issue[]) {
  if (r.kind === 'table') {
    const keys = new Set(r.columns.map((c) => c.key))
    if (!keys.has(r.keyColumn)) issues.push({ level: 'error', path, message: `keyColumn "${r.keyColumn}" is not a column key` })
    r.rows.forEach((row, i) => {
      if (!row[r.keyColumn]?.trim()) issues.push({ level: 'error', path: `${path}.rows[${i}]`, message: 'row has no value in the key column' })
      for (const k of Object.keys(row)) if (!keys.has(k)) issues.push({ level: 'warning', path: `${path}.rows[${i}]`, message: `unknown column "${k}"` })
    })
  }
  if (r.kind === 'trend' && new Set(r.order).size !== r.order.length)
    issues.push({ level: 'error', path, message: 'trend has the same item twice' })
}

export async function preparePack(src: PackSource, opts: { knownChapters?: Chapter[] } = {}): Promise<PackPreview> {
  const parsed = zPack.safeParse(src.json)
  if (!parsed.success) return { ok: false, issues: zodIssues(parsed.error) }
  const pack = parsed.data
  const issues: Issue[] = []

  const packChapters: Chapter[] = (pack.chapters ?? []).map((c) => ({ ...c, subject: subjectOf(c.id)! }))
  const known = mergeChapters(opts.knownChapters ?? BASE_CHAPTERS, packChapters)
  const fixChapter = (id: string, path: string): string => {
    const r = resolveChapterId(known, id)
    if (!r) issues.push({ level: 'error', path, message: `unknown chapter "${id}" (add it under "chapters" or fix the id)` })
    return r ?? id
  }

  // Media: every ref becomes media:<sha256>.
  const media = new Map<string, { bytes: Uint8Array; type: string }>()
  const refCache = new Map<string, string>()
  const pending: { ref: string; path: string }[] = []
  const collect = (ref: string, path: string) => {
    if (!ref.startsWith('media:')) pending.push({ ref, path })
    return ref
  }
  mapMediaRefs([pack.questions, pack.passages, pack.remember], collect)
  for (const { ref, path } of pending) {
    if (refCache.has(ref)) continue
    const data = ref.startsWith('data:') ? decodeDataUri(ref) : src.files[ref] ? { bytes: src.files[ref], type: mimeFromName(ref) } : undefined
    if (!data) {
      issues.push({ level: 'error', path, message: `image "${ref.slice(0, 60)}" is missing from the pack` })
      continue
    }
    const hash = await sha256Hex(data.bytes as BufferSource)
    media.set(hash, data)
    refCache.set(ref, `media:${hash}`)
  }
  const rewrite = <T>(v: T): T => mapMediaRefs(v, (ref) => refCache.get(ref) ?? ref)

  const passages: Passage[] = (pack.passages ?? []).map((p, i) => ({ ...rewrite(p), chapter: fixChapter(p.chapter, `passages[${i}].chapter`) }))
  const passageIds = new Set(passages.map((p) => p.id))

  const questions: Question[] = []
  const seen = new Set<string>()
  for (const [i, raw] of (pack.questions ?? []).entries()) {
    const path = `questions[${i}]`
    const q = { ...rewrite(raw), chapter: fixChapter(raw.chapter, `${path}.chapter`) } as Question
    checkQuestion(q, path, issues)
    if (q.passage && !passageIds.has(q.passage)) {
      const inDb = await db.passages.get(q.passage)
      if (!inDb) issues.push({ level: 'error', path, message: `passage "${q.passage}" not found` })
    }
    q.id = raw.id ?? `q_${(await sha256Hex(canonicalJson(identityOf(q)))).slice(0, 16)}`
    if (seen.has(q.id)) {
      issues.push({ level: 'warning', path, message: 'duplicate of an earlier question in this pack; skipped' })
      continue
    }
    seen.add(q.id)
    questions.push(q)
  }

  const remember: Remember[] = []
  for (const [i, raw] of (pack.remember ?? []).entries()) {
    const path = `remember[${i}]`
    const r = { ...rewrite(raw), chapter: fixChapter(raw.chapter, `${path}.chapter`) } as Remember
    checkRemember(r, path, issues)
    r.id = raw.id ?? `r_${(await sha256Hex(canonicalJson([r.kind, r.chapter, r.title]))).slice(0, 16)}`
    if (seen.has(r.id)) {
      issues.push({ level: 'warning', path, message: 'duplicate of an earlier item in this pack; skipped' })
      continue
    }
    seen.add(r.id)
    remember.push(r)
  }

  const papers = pack.papers ?? []
  for (const [i, p] of papers.entries()) {
    for (const s of p.sections)
      for (const qid of s.questionIds)
        if (!seen.has(qid) && !(await db.questions.get(qid)))
          issues.push({ level: 'error', path: `papers[${i}]`, message: `question "${qid}" not found for section ${s.name}` })
  }

  const existing = await db.questions.bulkGet(questions.map((q) => q.id))
  const replacing = existing.filter((e) => e && e.packId !== pack.id).length
  if (replacing) issues.push({ level: 'warning', path: '', message: `${replacing} question(s) already exist from another pack and will be replaced` })
  const unverified = questions.filter((q) => q.verified === 'unverified').length
  if (unverified) issues.push({ level: 'warning', path: '', message: `${unverified} question(s) have unverified answers` })

  const nameOf = new Map(known.map((c) => [c.id, c.name]))
  const per = new Map<string, { questions: number; remember: number }>()
  for (const q of questions) per.set(q.chapter, { ...(per.get(q.chapter) ?? { questions: 0, remember: 0 }), questions: (per.get(q.chapter)?.questions ?? 0) + 1 })
  for (const r of remember) per.set(r.chapter, { ...(per.get(r.chapter) ?? { questions: 0, remember: 0 }), remember: (per.get(r.chapter)?.remember ?? 0) + 1 })

  const ok = !issues.some((i) => i.level === 'error')
  return {
    ok,
    issues,
    prepared: ok ? { pack, questions, remember, passages, papers, chapters: packChapters, media, source: src } : undefined,
    summary: {
      title: pack.title,
      id: pack.id,
      questions: questions.length,
      remember: remember.length,
      passages: passages.length,
      papers: papers.length,
      media: media.size,
      unverified,
      replacing,
      perChapter: [...per.entries()].map(([chapter, c]) => ({ chapter, name: nameOf.get(chapter) ?? chapter, ...c })),
      alreadyInstalled: !!(await db.packs.get(pack.id)),
    },
  }
}

const CONTENT = () => [db.questions, db.remember, db.passages, db.papers, db.chapters, db.media, db.packs]

/** Removes a pack's content. Media shared with other packs stays. Progress is never touched. */
export async function removePack(packId: string) {
  await db.transaction('rw', CONTENT(), async () => {
    await removePackRows(packId)
    await db.packs.delete(packId)
  })
}

async function removePackRows(packId: string) {
  await db.questions.where('packId').equals(packId).delete()
  await db.remember.where('packId').equals(packId).delete()
  await db.passages.where('packId').equals(packId).delete()
  await db.papers.where('packId').equals(packId).delete()
  await db.chapters.where('packId').equals(packId).delete()
  const shared = await db.media.where('packs').equals(packId).toArray()
  for (const m of shared) {
    const packs = m.packs.filter((p) => p !== packId)
    if (packs.length) await db.media.update(m.hash, { packs })
    else await db.media.delete(m.hash)
  }
}

export async function commitPack(p: PreparedPack, via: PackRow['via']): Promise<PackRow> {
  const packId = p.pack.id
  const row: PackRow = {
    id: packId,
    title: p.pack.title,
    createdAt: p.pack.createdAt,
    importedAt: Date.now(),
    via,
    sha256: p.source.sha256,
    bytes: p.source.bytes,
    chapters: [...new Set([...p.questions, ...p.remember].map((x) => x.chapter))],
    counts: { questions: p.questions.length, remember: p.remember.length, passages: p.passages.length, papers: p.papers.length, media: p.media.size },
  }
  await db.transaction('rw', CONTENT(), async () => {
    await removePackRows(packId)
    const old = await db.media.bulkGet([...p.media.keys()])
    const mediaRows: MediaRow[] = [...p.media.entries()].map(([hash, m], i) => ({
      hash,
      blob: new Blob([m.bytes as BlobPart], { type: m.type }),
      type: m.type,
      bytes: m.bytes.byteLength,
      packs: [...new Set([...(old[i]?.packs ?? []), packId])],
    }))
    await db.media.bulkPut(mediaRows)
    await db.questions.bulkPut(p.questions.map((q): QuestionRow => ({ ...q, packId, origin: 'pack' })))
    await db.remember.bulkPut(p.remember.map((r) => ({ ...r, packId })))
    await db.passages.bulkPut(p.passages.map((x) => ({ ...x, packId })))
    await db.papers.bulkPut(p.papers.map((x) => ({ ...x, packId })))
    await db.chapters.bulkPut(p.chapters.map((x) => ({ ...x, packId })))
    await db.packs.put(row)
  })
  return row
}

/** One-shot helper used by tests and the repo sync. */
export async function importPack(input: Blob | string | Uint8Array, via: PackRow['via']) {
  const src = await readPackSource(input)
  const known = await allChapters()
  const preview = await preparePack(src, { knownChapters: known })
  if (!preview.ok || !preview.prepared) return { preview }
  const row = await commitPack(preview.prepared, via)
  return { preview, row }
}

export async function allChapters(): Promise<Chapter[]> {
  const extra = await db.chapters.toArray()
  return mergeChapters(BASE_CHAPTERS, extra)
}
