// @vitest-environment node
// (Node: real Blob.arrayBuffer and Response, which jsdom lacks.)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, KagakuDB, newNoteUid, useDatabase } from '../db/db'
import { importPack } from '../content/importer'
import { samplePack } from '../test/fixtures'
import { fakeGithub, type FakeGithub } from '../test/fakeGithub'
import { newInkNote, type InkNoteRow } from '../ink/types'
import { putMedia } from '../paper/store'
import { paperMediaTag, type UserPaperRow } from '../paper/types'
import { githubStore } from './github'
import { plan } from './merge'
import { runSync } from './engine'

describe('three-way plan', () => {
  const B = { local: 'l1', remote: 'r1' }
  it.each([
    [undefined, 'l', undefined, 'push'],
    [undefined, undefined, 'r', 'pull'],
    [undefined, 'l', 'r', 'resolve'],
    [B, 'l1', 'r1', 'none'],
    [B, 'l2', 'r1', 'push'],
    [B, undefined, 'r1', 'delete-remote'],
    [B, 'l1', 'r2', 'pull'],
    [B, 'l1', undefined, 'delete-local'],
    [B, undefined, 'r2', 'pull'], // deleted here, edited there: the edit wins
    [B, 'l2', undefined, 'push'], // edited here, deleted there: the edit wins
    [B, undefined, undefined, 'forget'],
    [B, 'l2', 'r2', 'resolve'],
  ] as const)('base %o, local %s, remote %s → %s', (base, local, remote, want) => {
    expect(plan(base, local, remote)).toBe(want)
  })
})

let n = 0
let gh: FakeGithub
let A: KagakuDB
let Bd: KagakuDB
const store = () => githubStore('me/content', 'token')

async function on<T>(dev: KagakuDB, fn: () => Promise<T>): Promise<T> {
  useDatabase(dev)
  return fn()
}
const sync = (dev: KagakuDB) => on(dev, () => runSync(store()))

function ink(chapter: string, over: Partial<InkNoteRow> = {}): InkNoteRow {
  return { ...newInkNote(chapter), strokes: [{ c: 'ink', w: 4, p: [10, 10, 50, 20, 90, 15] }], ...over }
}

async function addPaper(id: string): Promise<UserPaperRow> {
  const page = await putMedia(new Blob([new Uint8Array([0xff, 0xd8, 1, 2, 3, id.length])], { type: 'image/jpeg' }), paperMediaTag(id))
  const crop = await putMedia(new Blob([new Uint8Array([0xff, 0xd8, 9, 9, id.length])], { type: 'image/jpeg' }), paperMediaTag(id))
  const row: UserPaperRow = {
    id,
    title: 'AITS 05',
    createdAt: 1,
    updatedAt: 1,
    status: 'ready',
    durationMin: 180,
    optionStyle: 'letters',
    sources: [{ role: 'paper', name: 'aits.pdf', type: 'application/pdf' }],
    pages: [{ role: 'paper', image: page, width: 100, height: 140, file: 0, pdfPage: 1 }],
    sections: [],
    questions: [{ uid: 1, n: 1, section: 0, format: 'single', options: 4, pieces: [{ page: 0, box: { x0: 0, y0: 0, x1: 10, y1: 10 } }], image: crop, key: { answer: 'A' } }],
    key: [],
    warnings: [],
    bytes: 12,
  }
  await db.userPapers.put(row)
  return row
}

beforeEach(() => {
  gh = fakeGithub()
  vi.stubGlobal('fetch', gh.fetch)
  A = new KagakuDB(`syncA-${n}`)
  Bd = new KagakuDB(`syncB-${n++}`)
})
afterEach(() => vi.unstubAllGlobals())

describe('device sync', () => {
  it('carries cards, notes, papers with pictures and pasted packs to the other device', async () => {
    const card = ink('phy.thermodynamics', { title: 'Sign convention' })
    await on(A, async () => {
      await db.ink.put(card)
      await db.notes.add({ uid: 'n1', chapter: 'chem.mole-concept', text: 'Avogadro: $6.022 \\times 10^{23}$', at: 5 })
      await addPaper('upA1')
      await importPack(JSON.stringify(samplePack()), 'paste')
      // The demo pack and repo packs never travel.
      await importPack(JSON.stringify(samplePack({ id: 'demo' })), 'paste')
    })
    const r1 = await sync(A)
    expect(r1).toMatchObject({ pushed: 4, pulled: 0, errors: [] })
    const files = gh.files()
    expect([...files.keys()]).toHaveLength(6)
    expect([...files.keys()]).toEqual(
      expect.arrayContaining(['README.md', `ink/${card.id}.json`, 'notes/n1.json', 'packs/test-thermo-1.kagaku', 'papers/upA1.json', expect.stringMatching(/^papers\/upA1\.media\.[0-9a-f]{16}\.zip$/)]),
    )

    const r2 = await sync(Bd)
    expect(r2).toMatchObject({ pulled: 4, pushed: 0, errors: [] })
    await on(Bd, async () => {
      expect((await db.ink.get(card.id))?.title).toBe('Sign convention')
      expect((await db.notes.where('uid').equals('n1').first())?.text).toContain('6.022')
      const paper = (await db.userPapers.get('upA1'))!
      expect(paper.imagesDeleted).toBeFalsy()
      expect(paper.bytes).toBeGreaterThan(0)
      const media = await db.media.bulkGet([paper.pages[0].image.slice(6), paper.questions[0].image!.slice(6)])
      expect(media.every((m) => m?.packs.includes('paper:upA1'))).toBe(true)
      expect((await db.packs.get('test-thermo-1'))?.via).toBe('sync')
      expect(await db.remember.where('packId').equals('test-thermo-1').count()).toBeGreaterThan(0)
      expect(await db.packs.get('demo')).toBeUndefined()
    })
    // Nothing changed: the next syncs send nothing.
    expect(await sync(Bd)).toMatchObject({ pulled: 0, pushed: 0 })
    expect(await sync(A)).toMatchObject({ pulled: 0, pushed: 0 })
  })

  it('edits and deletes travel both ways', async () => {
    const card = ink('phy.thermodynamics')
    await on(A, async () => {
      await db.ink.put(card)
      await db.notes.add({ uid: 'n1', chapter: 'chem.mole-concept', text: 'one', at: 5 })
    })
    await sync(A)
    await sync(Bd)
    await on(Bd, async () => {
      await db.ink.update(card.id, { title: 'Edited on the iPad', updatedAt: 99 })
      await db.notes.where('uid').equals('n1').delete()
    })
    expect(await sync(Bd)).toMatchObject({ pushed: 1, removedThere: 1 })
    expect(await sync(A)).toMatchObject({ pulled: 1, removedHere: 1 })
    await on(A, async () => {
      expect((await db.ink.get(card.id))?.title).toBe('Edited on the iPad')
      expect(await db.notes.count()).toBe(0)
    })
    expect(gh.files().has('notes/n1.json')).toBe(false)
  })

  it('a card changed on both devices is kept twice, never lost', async () => {
    const card = ink('phy.thermodynamics')
    await on(A, () => db.ink.put(card))
    await sync(A)
    await sync(Bd)
    await on(A, () => db.ink.update(card.id, { title: 'from phone' }))
    await on(Bd, () => db.ink.update(card.id, { title: 'from iPad' }))
    await sync(A)
    const r = await sync(Bd)
    expect(r.copies).toBe(1)
    await sync(A)
    for (const dev of [A, Bd])
      await on(dev, async () => {
        const titles = (await db.ink.toArray()).map((x) => x.title).sort()
        expect(titles).toEqual(['from iPad (this device\'s copy)', 'from phone'])
      })
  })

  it('an edit wins over a delete on the other device', async () => {
    const card = ink('phy.thermodynamics')
    await on(A, () => db.ink.put(card))
    await sync(A)
    await sync(Bd)
    await on(A, () => db.ink.delete(card.id))
    await on(Bd, () => db.ink.update(card.id, { title: 'still needed' }))
    await sync(A)
    await sync(Bd)
    await sync(A)
    await on(A, async () => expect((await db.ink.get(card.id))?.title).toBe('still needed'))
  })

  it('a paper still being read is left alone', async () => {
    await on(A, async () => {
      const p = await addPaper('upBusy')
      await db.userPapers.put({ ...p, status: 'processing' })
    })
    await sync(A)
    expect(gh.files().has('papers/upBusy.json')).toBe(false)
  })

  it('retries when the other device synced at the same moment', async () => {
    await on(A, () => db.ink.put(ink('phy.thermodynamics')))
    await sync(A)
    await on(A, () => db.notes.add({ uid: newNoteUid(), chapter: 'chem.mole-concept', text: 'mine', at: 1 }))
    // Between A reading the branch and committing, B's commit lands.
    const real = gh.fetch
    let once = false
    gh.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!once && String(input).endsWith('/git/commits') && init?.method === 'POST') {
        once = true
        await on(Bd, () => db.notes.add({ uid: 'fromB', chapter: 'chem.mole-concept', text: 'theirs', at: 2 }))
        vi.stubGlobal('fetch', real)
        await sync(Bd)
        useDatabase(A)
        vi.stubGlobal('fetch', gh.fetch)
      }
      return real(input, init)
    }) as typeof fetch
    vi.stubGlobal('fetch', gh.fetch)
    const r = await sync(A)
    expect(r.errors).toEqual([])
    await on(A, async () => expect((await db.notes.toArray()).map((x) => x.text).sort()).toEqual(['mine', 'theirs']))
    expect([...gh.files().keys()].filter((p) => p.startsWith('notes/'))).toHaveLength(2)
  })

  it('explains a read-only token', async () => {
    await on(A, () => db.ink.put(ink('phy.thermodynamics')))
    gh.readOnly = true
    await expect(sync(A)).rejects.toThrow(/Read and write/)
  })
})
