import { beforeEach, describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { KagakuDB, useDatabase, db } from '../db/db'
import { extractJsonText, importPack, readPackSource, preparePack, removePack } from './importer'
import { samplePack, PNG_DATA_URI } from '../test/fixtures'

let n = 0
beforeEach(() => useDatabase(new KagakuDB(`test-${n++}`)))

describe('reading packs', () => {
  it('pulls JSON out of an AI reply with code fences', () => {
    const text = 'Here is your pack:\n```json\n{"a": 1}\n```\nEnjoy!'
    expect(JSON.parse(extractJsonText(text))).toEqual({ a: 1 })
  })
  it('reads a .kagaku zip with images', async () => {
    const pack = samplePack({
      questions: [{ chapter: 'phy.ray-optics', format: 'integer', stem: 'see fig', image: 'img/a.png', answer: 2 }],
      remember: [],
    })
    const png = Uint8Array.from(atob(PNG_DATA_URI.split(',')[1]), (c) => c.charCodeAt(0))
    const zip = zipSync({ 'pack.json': strToU8(JSON.stringify(pack)), 'img/a.png': png })
    const src = await readPackSource(zip)
    const preview = await preparePack(src)
    expect(preview.ok).toBe(true)
    expect(preview.prepared!.questions[0].image).toMatch(/^media:[0-9a-f]{64}$/)
  })
})

describe('validation', () => {
  it('rejects unknown chapters with a helpful message', async () => {
    const pack = samplePack({ questions: [{ chapter: 'phy.not-a-chapter', format: 'integer', stem: 'x', answer: 1 }], remember: [] })
    const preview = await preparePack(await readPackSource(JSON.stringify(pack)))
    expect(preview.ok).toBe(false)
    expect(preview.issues[0].message).toContain('unknown chapter')
  })
  it('rejects an answer that is not an option', async () => {
    const pack = samplePack({
      questions: [{ chapter: 'phy.ray-optics', format: 'single', stem: 'x', options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }], answer: 'C' }],
      remember: [],
    })
    const preview = await preparePack(await readPackSource(JSON.stringify(pack)))
    expect(preview.ok).toBe(false)
    expect(preview.issues.map((i) => i.message).join()).toContain('"C" is not one of the option ids')
  })
  it('refuses photo-form questions: text is required, the old photo flags are unknown', async () => {
    const photoOnly = samplePack({ questions: [{ chapter: 'phy.ray-optics', format: 'integer', stem: '', image: PNG_DATA_URI, answer: 1 }], remember: [] })
    const a = await preparePack(await readPackSource(JSON.stringify(photoOnly)))
    expect(a.ok).toBe(false)
    expect(a.issues[0].message).toContain('question text is missing')
    const flagged = JSON.parse(JSON.stringify(samplePack({ remember: [] })))
    flagged.questions[0].optionsInImage = true
    expect((await preparePack(await readPackSource(JSON.stringify(flagged)))).ok).toBe(false)
  })
  it('accepts chapters defined inside the pack', async () => {
    const pack = samplePack({
      chapters: [{ id: 'phy.new-thing', unit: 'misc', cls: 12, name: 'New Thing' }],
      questions: [{ chapter: 'phy.new-thing', format: 'integer', stem: 'x', answer: 1 }],
      remember: [],
    })
    expect((await preparePack(await readPackSource(JSON.stringify(pack)))).ok).toBe(true)
  })
})

describe('commit and remove', () => {
  it('stores content, dedupes by content, and removes cleanly', async () => {
    const { preview, row } = await importPack(JSON.stringify(samplePack()), 'paste')
    expect(preview.ok).toBe(true)
    expect(row!.counts).toMatchObject({ questions: 4, remember: 3, media: 1 })
    expect(await db.questions.count()).toBe(4)
    expect(await db.media.count()).toBe(1)

    // Same questions in another pack: replaced, not duplicated.
    await importPack(JSON.stringify(samplePack({ id: 'other', remember: [] })), 'paste')
    expect(await db.questions.count()).toBe(4)
    expect((await db.media.toArray())[0].packs.sort()).toEqual(['other', 'test-thermo-1'])

    await removePack('other')
    expect(await db.questions.count()).toBe(0)
    expect(await db.remember.count()).toBe(3)
    expect(await db.media.count()).toBe(1)
    await removePack('test-thermo-1')
    expect(await db.media.count()).toBe(0)
  })
  it('re-importing the same pack replaces it', async () => {
    await importPack(JSON.stringify(samplePack()), 'paste')
    await importPack(JSON.stringify(samplePack()), 'paste')
    expect(await db.questions.count()).toBe(4)
    expect(await db.packs.count()).toBe(1)
  })
})
