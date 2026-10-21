// Shared helpers for the pack tools. They run in Node with an in-memory IndexedDB,
// so validation is exactly the app's own importer.

import 'fake-indexeddb/auto'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { preparePack, readPackSource, mapMediaRefs, type PackPreview } from '../../src/content/importer'
import { sha256Hex } from '../../src/content/hash'
import { zContentIndex, type ContentIndex } from '../../src/content/schema'

export async function zipDraft(dir: string): Promise<{ zip: Uint8Array; packJson: Record<string, unknown> }> {
  const packJson = JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8')) as Record<string, unknown>
  const files: Record<string, Uint8Array> = { 'pack.json': strToU8(JSON.stringify(packJson)) }
  const missing: string[] = []
  mapMediaRefs([packJson.questions, packJson.passages, packJson.remember], (ref) => {
    if (ref.startsWith('data:') || ref.startsWith('media:') || files[ref]) return ref
    const p = join(dir, ref)
    if (existsSync(p)) files[ref] = new Uint8Array(readFileSync(p))
    else missing.push(ref)
    return ref
  })
  if (missing.length) throw new Error(`Missing image files: ${missing.slice(0, 10).join(', ')}`)
  // Images are already compressed; storing them avoids wasting time.
  return { zip: zipSync(files, { level: 0 }), packJson }
}

export async function validate(bytes: Uint8Array): Promise<PackPreview> {
  return preparePack(await readPackSource(bytes))
}

export function printPreview(p: PackPreview) {
  const s = p.summary
  if (s) {
    console.log(`\n${s.title} (${s.id})`)
    console.log(`  ${s.questions} questions · ${s.remember} remember · ${s.passages} passages · ${s.papers} papers · ${s.media} images · ${s.unverified} unverified`)
    for (const c of s.perChapter) console.log(`  - ${c.name}: ${c.questions} Q, ${c.remember} R`)
  }
  for (const i of p.issues) console.log(`  ${i.level === 'error' ? '✗' : '!'} ${i.path ? `[${i.path}] ` : ''}${i.message}`)
}

export function readIndex(contentDir: string): ContentIndex {
  const p = join(contentDir, 'index.json')
  if (!existsSync(p)) return { format: 'kagaku-index', version: 1, updatedAt: new Date().toISOString(), packs: [] }
  return zContentIndex.parse(JSON.parse(readFileSync(p, 'utf8')))
}

export async function indexEntry(contentDir: string, file: string, preview: PackPreview, bytes: Uint8Array) {
  const s = preview.summary!
  return {
    id: s.id,
    file: relative(contentDir, file).split('\\').join('/'),
    title: s.title,
    chapters: s.perChapter.map((c) => c.chapter),
    bytes: bytes.byteLength,
    sha256: await sha256Hex(bytes as BufferSource),
    counts: { questions: s.questions, remember: s.remember, passages: s.passages, papers: s.papers, media: s.media },
  }
}

export function walk(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p, ext) : n.endsWith(ext) ? [p] : []
  })
}
