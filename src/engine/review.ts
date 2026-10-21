// Accuracy layer 4: every new question or To Remember item waits here until Uttam has
// looked at it rendered, with its answer, and ticked it. Nothing counts as checked
// without his tick.

import { db, type QMetaRow, type QuestionRow, type RememberRow } from '../db/db'

export type ReviewItem = { kind: 'question'; q: QuestionRow; meta?: QMetaRow } | { kind: 'remember'; r: RememberRow; meta?: QMetaRow }

export type ReviewFilter = 'care' | 'all'

/** Items needing extra care: answers nobody official gave, or something the transcriber flagged. */
export function needsCare(item: ReviewItem): boolean {
  const x = item.kind === 'question' ? item.q : item.r
  return x.verified === 'unverified' || !!x.uncertain
}

export async function reviewQueue(filter: ReviewFilter): Promise<ReviewItem[]> {
  const [questions, remember, packs] = await Promise.all([db.questions.toArray(), db.remember.toArray(), db.packs.toArray()])
  const metas = new Map((await db.qmeta.toArray()).map((m) => [m.qid, m]))
  const packOrder = new Map(packs.sort((a, b) => a.importedAt - b.importedAt).map((p, i) => [p.id, i]))
  // His own mistake photos were checked when he added them; the demo pack is only a demo.
  const skip = (packId: string) => packId === 'user' || packId === 'demo'
  const items: ReviewItem[] = [
    ...remember.filter((r) => !skip(r.packId)).map((r): ReviewItem => ({ kind: 'remember', r, meta: metas.get(r.id) })),
    ...questions.filter((q) => !skip(q.packId)).map((q): ReviewItem => ({ kind: 'question', q, meta: metas.get(q.id) })),
  ].filter((i) => !i.meta?.reviewedAt)
  const key = (i: ReviewItem) => (i.kind === 'question' ? i.q : i.r)
  items.sort((a, b) => (packOrder.get(key(a).packId) ?? 0) - (packOrder.get(key(b).packId) ?? 0) || key(a).chapter.localeCompare(key(b).chapter))
  return filter === 'care' ? items.filter(needsCare) : items
}

export async function reviewCounts(): Promise<{ all: number; care: number }> {
  const all = await reviewQueue('all')
  return { all: all.length, care: all.filter(needsCare).length }
}

export async function markReviewed(id: string, confirmKey: boolean) {
  const cur = await db.qmeta.get(id)
  await db.qmeta.put({ ...cur, qid: id, reviewedAt: Date.now(), keyStatus: confirmKey ? (cur?.keyStatus ?? 'confirmed') : cur?.keyStatus })
}

/** Checked by him, or came with an official key. Used to hide "unverified" labels. */
export function isTrusted(verified: string, meta?: QMetaRow): boolean {
  return verified !== 'unverified' || !!meta?.reviewedAt || meta?.keyStatus === 'confirmed' || meta?.keyStatus === 'fixed'
}
