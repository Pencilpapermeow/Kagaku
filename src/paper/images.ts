// Main-thread side of the image worker. Falls back to doing the work here on browsers
// without OffscreenCanvas in workers (slower, but still correct).

import type { CleanOptions, PageImage } from './canvasOps'
import type { PaperOp } from './paper.worker'
import type { Box } from './types'

let worker: Worker | undefined
let broken = false
let seq = 0
const waiting = new Map<number, { res: (v: unknown) => void; rej: (e: Error) => void }>()

function getWorker(): Worker | undefined {
  if (broken || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return undefined
  if (!worker) {
    try {
      worker = new Worker(new URL('./paper.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
        const w = waiting.get(e.data.id)
        waiting.delete(e.data.id)
        if (e.data.ok) w?.res(e.data.result)
        else w?.rej(new Error(e.data.error))
      }
      worker.onerror = () => {
        broken = true
        for (const w of waiting.values()) w.rej(new Error('Image worker failed'))
        waiting.clear()
        worker = undefined
      }
    } catch {
      broken = true
    }
  }
  return worker
}

async function call<T>(op: PaperOp, ...args: unknown[]): Promise<T> {
  const w = getWorker()
  if (w) {
    try {
      return await new Promise<T>((res, rej) => {
        const id = ++seq
        waiting.set(id, { res: res as (v: unknown) => void, rej })
        w.postMessage({ id, op, args })
      })
    } catch (e) {
      if (!broken) throw e
    }
  }
  const ops = await import('./canvasOps')
  return (ops[op] as (...a: unknown[]) => Promise<T>)(...args)
}

export const cleanPhoto = (blob: Blob, o: CleanOptions) => call<PageImage>('cleanPhoto', blob, o)
export const turnImage = (blob: Blob, deg: number) => call<PageImage>('turnImage', blob, deg)
export const cutCrop = (pages: Record<number, Blob>, pieces: { page: number; box: Box }[]) => call<{ blob: Blob; width: number; height: number } | null>('cutCrop', pages, pieces)
