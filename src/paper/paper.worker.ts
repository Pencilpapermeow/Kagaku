// Image work for "Test from paper", off the main thread so the screen never freezes.

import { cleanPhoto, cutCrop, turnImage } from './canvasOps'

const OPS = { cleanPhoto, cutCrop, turnImage } as const
export type PaperOp = keyof typeof OPS

self.onmessage = async (e: MessageEvent<{ id: number; op: PaperOp; args: unknown[] }>) => {
  const { id, op, args } = e.data
  try {
    const result = await (OPS[op] as (...a: unknown[]) => Promise<unknown>)(...args)
    self.postMessage({ id, ok: true, result })
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
