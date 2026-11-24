// Sync status for the screen, kept apart from the engine so the engine (and the paper and
// pack code it needs) loads only when a sync actually runs.

import { useSyncExternalStore } from 'react'
import { db } from '../db/db'
import type { SyncReport } from './engine'

export const META = '#commit'

export interface SyncStatus {
  running: boolean
  lastAt?: number
  error?: string
  report?: SyncReport
}

let status: SyncStatus = { running: false }
const listeners = new Set<() => void>()

export function getStatus(): SyncStatus {
  return status
}
export function setStatus(s: Partial<SyncStatus>) {
  status = { ...status, ...s }
  listeners.forEach((l) => l())
}
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
  )
}

export async function lastSyncAt(): Promise<number | undefined> {
  const m = await db.syncBase.get(META)
  return m ? Number(m.local) : undefined
}

/** Starts a sync (loading the engine on first use). */
export async function syncNow(opts: { quiet?: boolean } = {}): Promise<SyncReport | undefined> {
  const m = await import('./engine')
  return m.syncNow(opts)
}
