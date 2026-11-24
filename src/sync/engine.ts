// Device sync: runs the three-way merge for every kind of item against the sync branch,
// then sends this device's changes in one commit. See docs/ARCHITECTURE.md ("Device sync").

import Dexie from 'dexie'
import { db } from '../db/db'
import { getSettings } from '../db/settings'
import { gitBlobSha, githubStore, SyncAuthError, SyncConflict, type FileChange, type RemoteStore } from './github'
import { KINDS, remoteIds } from './kinds'
import { plan, type Action } from './merge'
import { getStatus, lastSyncAt, META, setStatus } from './status'

export interface SyncReport {
  /** Items that arrived or changed here. */
  pulled: number
  /** Items sent from here. */
  pushed: number
  /** Deleted here because they were deleted on the other device. */
  removedHere: number
  /** Deleted in the repo because they were deleted here. */
  removedThere: number
  /** Kept both versions (changed on both devices). */
  copies: number
  errors: string[]
  commit: string | null
}

/** One full sync against a remote store. Exported for tests (they pass a fake GitHub). */
export async function runSync(store: RemoteStore): Promise<SyncReport> {
  const total: SyncReport = { pulled: 0, pushed: 0, removedHere: 0, removedThere: 0, copies: 0, errors: [], commit: null }
  // A conflict (other device pushed meanwhile) or a "keep both" copy needs one more round.
  for (let round = 0; round < 4; round++) {
    let r: SyncReport & { again: boolean }
    try {
      r = await syncOnce(store)
    } catch (e) {
      if (e instanceof SyncConflict && round < 3) continue
      throw e
    }
    total.pulled += r.pulled
    total.pushed += r.pushed
    total.removedHere += r.removedHere
    total.removedThere += r.removedThere
    total.copies += r.copies
    total.errors.push(...r.errors)
    total.commit = r.commit
    if (!r.again) break
  }
  return total
}

async function syncOnce(store: RemoteStore): Promise<SyncReport & { again: boolean }> {
  const remote = await store.read()
  const base = new Map((await db.syncBase.toArray()).map((b) => [b.key, b]))
  const r: SyncReport & { again: boolean } = { pulled: 0, pushed: 0, removedHere: 0, removedThere: 0, copies: 0, errors: [], commit: remote.commit, again: false }
  const changes: FileChange[] = []
  const pushed: { key: string; local: string; data: Uint8Array | string }[] = []
  const removed: string[] = []

  for (const kind of KINDS) {
    const local = await kind.list()
    const ids = new Set([...local.keys(), ...remoteIds(kind, remote)])
    for (const k of base.keys()) if (k.startsWith(`${kind.name}/`)) ids.add(k.slice(kind.name.length + 1))
    for (const id of ids) {
      const key = `${kind.name}/${id}`
      const L = local.get(id)
      if (L?.busy) continue
      const path = `${kind.dir}/${id}${kind.ext}`
      const R = remote.files.get(path)
      let action: Action = plan(base.get(key), L?.fp, R)
      let bytes: Uint8Array | undefined
      try {
        if (action === 'resolve') {
          bytes = await store.get(R!)
          const res = await kind.resolve(id, bytes)
          if (res === 'same') {
            await db.syncBase.put({ key, local: L!.fp, remote: R! })
            continue
          }
          if (res === 'both') {
            await kind.keepLocalCopy!(id)
            r.copies++
            r.again = true
            action = 'pull'
          } else action = res
        }
        switch (action) {
          case 'push': {
            const files = await kind.files(id, remote)
            if (!files.length) break
            const main = files[0].data!
            if ((await gitBlobSha(main)) === R) {
              // Same content already there (sent before, base lost): just agree.
              await db.syncBase.put({ key, local: L!.fp, remote: R })
              break
            }
            changes.push(...files)
            pushed.push({ key, local: L!.fp, data: main })
            break
          }
          case 'pull': {
            bytes ??= await store.get(R!)
            await kind.apply(id, bytes, { remote, store })
            const fp = await kind.fingerprint(id)
            if (fp) await db.syncBase.put({ key, local: fp, remote: R! })
            r.pulled++
            break
          }
          case 'delete-remote':
            changes.push({ path, data: null }, ...(kind.extraPaths?.(id, remote) ?? []).map((p) => ({ path: p, data: null })))
            removed.push(key)
            break
          case 'delete-local':
            await kind.remove(id)
            await db.syncBase.delete(key)
            r.removedHere++
            break
          case 'forget':
            await db.syncBase.delete(key)
            break
        }
      } catch (e) {
        if (e instanceof SyncAuthError || e instanceof SyncConflict) throw e
        r.errors.push(`${key}: ${(e as Error).message}`)
      }
    }
  }

  if (changes.length) {
    r.commit = await store.commit(remote, changes, `Kagaku sync: ${pushed.length} sent, ${removed.length} deleted (${new Date().toISOString()})`)
    for (const p of pushed) await db.syncBase.put({ key: p.key, local: p.local, remote: await gitBlobSha(p.data) })
    await db.syncBase.bulkDelete(removed)
    r.pushed = pushed.length
    r.removedThere = removed.length
  }
  await db.syncBase.put({ key: META, local: String(Date.now()), remote: r.commit ?? '' })
  return r
}

// ---------------------------------------------------------------------------- now + auto
let current: Promise<SyncReport | undefined> | undefined
let quietUntil = 0

/** Sync now. `quiet`: started by the app itself (no message unless something arrived). */
export function syncNow(opts: { quiet?: boolean; store?: RemoteStore } = {}): Promise<SyncReport | undefined> {
  current ??= (async () => {
    const s = await getSettings()
    if (!opts.store && (!s.githubToken || !s.githubRepo)) {
      setStatus({ error: 'Add the GitHub token in "Content repo" first.' })
      return undefined
    }
    setStatus({ running: true, error: undefined })
    try {
      const report = await runSync(opts.store ?? githubStore(s.githubRepo, s.githubToken))
      setStatus({ running: false, lastAt: Date.now(), report, error: report.errors.length ? `${report.errors.length} item(s) could not be synced: ${report.errors[0]}` : undefined })
      if (opts.quiet && report.pulled + report.removedHere > 0) notify(report)
      return report
    } catch (e) {
      setStatus({ running: false, error: (e as Error).message })
      if (!opts.quiet) throw e
      return undefined
    } finally {
      quietUntil = Date.now() + 2000
      current = undefined
    }
  })()
  return current
}

function notify(r: SyncReport) {
  const parts = [r.pulled && `${r.pulled} new or changed`, r.removedHere && `${r.removedHere} removed`].filter(Boolean)
  window.dispatchEvent(new CustomEvent('kagaku:toast', { detail: `From your other device: ${parts.join(', ')}` }))
}

const WATCHED = /\/(ink|notes|userPapers|packSources)\//

/** Syncs on start, when the app comes back to the screen, when back online, and a few seconds after a change. */
export function startAutoSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastRun = 0
  const run = async (minGapMs: number) => {
    const s = await getSettings()
    if (!s.syncEnabled || !s.githubToken) return
    if (Date.now() - lastRun < minGapMs) return
    lastRun = Date.now()
    void syncNow({ quiet: true })
  }
  const soon = (ms: number) => {
    clearTimeout(timer)
    timer = setTimeout(() => void run(0), ms)
  }
  void lastSyncAt().then((t) => t && !getStatus().lastAt && setStatus({ lastAt: t }))
  soon(1500)
  const onVis = () => document.visibilityState === 'visible' && void run(30_000)
  const onOnline = () => soon(1000)
  const onMutated = (parts: Record<string, unknown>) => {
    // Writes made by a sync itself also land here; the follow-up sync then finds nothing to do.
    if (Date.now() < quietUntil) return
    if (Object.keys(parts).some((k) => WATCHED.test(k))) soon(8000)
  }
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('online', onOnline)
  Dexie.on('storagemutated', onMutated)
  return () => {
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('online', onOnline)
    Dexie.on('storagemutated').unsubscribe(onMutated)
  }
}
