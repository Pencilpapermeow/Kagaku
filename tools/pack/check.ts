// Health check for the whole content repo (run by the nightly bug hunt too):
// every pack valid, index in sync, no question stored twice, unverified answers counted.
//
//   npm run pack:check -- ../kagaku-content

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sha256Hex } from '../../src/content/hash'
import { printPreview, readIndex, validate, walk } from './lib'

const dir = process.argv[2] ?? 'work/content'
const index = readIndex(dir)
const files = walk(join(dir, 'packs'), '.kagaku')
let problems = 0
const owner = new Map<string, string>()
let total = 0
let unverified = 0

for (const f of files) {
  const bytes = new Uint8Array(readFileSync(f))
  const preview = await validate(bytes)
  const s = preview.summary
  if (!preview.ok || !s) {
    printPreview(preview)
    problems++
    continue
  }
  total += s.questions
  unverified += s.unverified
  for (const q of preview.prepared!.questions) {
    const prev = owner.get(q.id)
    if (prev && prev !== s.id) {
      console.log(`! duplicate question ${q.id} in ${prev} and ${s.id}`)
      problems++
    }
    owner.set(q.id, s.id)
  }
  const entry = index.packs.find((p) => p.id === s.id)
  if (!entry) {
    console.log(`! ${f} is not listed in index.json`)
    problems++
  } else if (entry.sha256 !== (await sha256Hex(bytes as BufferSource))) {
    console.log(`! index.json is out of date for ${s.id}`)
    problems++
  }
}
for (const p of index.packs) if (!files.some((f) => f.endsWith(p.file.split('/').pop()!))) {
  console.log(`! index.json lists ${p.file}, which does not exist`)
  problems++
}
const mb = files.reduce((a, f) => a + readFileSync(f).byteLength, 0) / 1024 / 1024
console.log(`\n${files.length} packs · ${total} questions · ${unverified} unverified · ${mb.toFixed(1)} MB · ${problems} problem(s)`)
process.exit(problems ? 1 : 0)
