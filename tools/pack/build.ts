// Build a .kagaku pack from a draft folder and add it to the content repo's index.
//
//   npm run pack:build -- work/day3            (writes to work/content by default)
//   npm run pack:build -- work/day3 --out ../kagaku-content
//
// The draft folder holds pack.json (images referenced as "img/<file>.webp") and the images.
// Nothing is written if the pack has errors.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { indexEntry, printPreview, readIndex, validate, zipDraft } from './lib'

const args = process.argv.slice(2)
const draft = args.find((a) => !a.startsWith('--'))
const outIdx = args.indexOf('--out')
const contentDir = outIdx >= 0 ? args[outIdx + 1] : 'work/content'
if (!draft) {
  console.error('usage: npm run pack:build -- <draftDir> [--out <contentDir>]')
  process.exit(2)
}

const { zip } = await zipDraft(draft)
const preview = await validate(zip)
printPreview(preview)
if (!preview.ok) {
  console.error('\nNot written: fix the errors above.')
  process.exit(1)
}

const id = preview.summary!.id
const file = join(contentDir, 'packs', `${id}.kagaku`)
mkdirSync(join(contentDir, 'packs'), { recursive: true })
writeFileSync(file, zip)
const index = readIndex(contentDir)
const entry = await indexEntry(contentDir, file, preview, zip)
index.packs = [...index.packs.filter((p) => p.id !== id), entry].sort((a, b) => a.id.localeCompare(b.id))
index.updatedAt = new Date().toISOString()
writeFileSync(join(contentDir, 'index.json'), JSON.stringify(index, null, 1) + '\n')
console.log(`\n✓ ${file} (${(zip.byteLength / 1024).toFixed(0)} KB) · index has ${index.packs.length} packs`)
