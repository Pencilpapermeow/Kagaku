import { beforeEach, describe, expect, it } from 'vitest'
import { KagakuDB, useDatabase, db } from '../db/db'
import { importPack } from '../content/importer'
import { samplePack } from '../test/fixtures'
import { isTrusted, markReviewed, reviewCounts, reviewQueue } from './review'

let n = 0
beforeEach(() => useDatabase(new KagakuDB(`review-${n++}`)))

describe('review queue', () => {
  it('holds every new item until he ticks it; careful ones first', async () => {
    await importPack(JSON.stringify(samplePack()), 'paste')
    // 4 questions + 3 remember; care = unverified answers or flagged transcription
    expect(await reviewCounts()).toEqual({ all: 7, care: 6 })
    const first = (await reviewQueue('care'))[0]
    const id = first.kind === 'question' ? first.q.id : first.r.id
    await markReviewed(id, true)
    expect((await reviewCounts()).all).toBe(6)
    expect(isTrusted('unverified', await db.qmeta.get(id))).toBe(true)
  })
  it('his own mistake photos are not queued', async () => {
    await db.questions.put({ id: 'u_1', chapter: 'phy.ray-optics', format: 'integer', stem: '', answer: 1, verified: 'checked', tags: [], packId: 'user', origin: 'user' })
    expect((await reviewCounts()).all).toBe(0)
  })
})
