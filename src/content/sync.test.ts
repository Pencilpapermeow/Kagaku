import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KagakuDB, useDatabase, db } from '../db/db'
import { compareWithInstalled, downloadPack, fetchIndex } from './sync'
import { sha256Hex } from './hash'
import { samplePack } from '../test/fixtures'

let n = 0
beforeEach(() => useDatabase(new KagakuDB(`sync-${n++}`)))
afterEach(() => vi.unstubAllGlobals())

describe('content repo sync', () => {
  it('lists new packs, installs them, then reports them installed', async () => {
    const body = new TextEncoder().encode(JSON.stringify(samplePack()))
    const sha = await sha256Hex(body)
    const index = { format: 'kagaku-index', version: 1, updatedAt: 'x', packs: [{ id: 'test-thermo-1', file: 'packs/a.kagaku', title: 'T', chapters: [], bytes: body.byteLength, sha256: sha }] }
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
      if (url.endsWith('/contents/index.json')) return new Response(JSON.stringify(index))
      if (url.endsWith('/contents/packs/a.kagaku')) return new Response(body)
      return new Response('nope', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const idx = await fetchIndex('me/content', 'tok')
    expect((await compareWithInstalled(idx))[0].state).toBe('new')
    const { preview } = await downloadPack('me/content', 'tok', idx.packs[0])
    expect(preview.ok).toBe(true)
    expect(await db.questions.count()).toBe(4)
    expect((await compareWithInstalled(idx))[0].state).toBe('installed')
  })
  it('explains a bad token in plain words', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    await expect(fetchIndex('me/content', 'bad')).rejects.toThrow(/token/)
  })
})
