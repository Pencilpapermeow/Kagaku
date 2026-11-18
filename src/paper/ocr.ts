// OCR with tesseract.js, fully offline: the worker script, the engine and the English data
// come from our own cache (tools.ts) as blobs, so nothing is fetched from a CDN.

import type { Worker as TessWorker } from 'tesseract.js'
import { cachedBlob, ocrFiles } from './tools'
import type { TextWord } from './types'

let workerP: Promise<TessWorker> | undefined

function ocrWorker(): Promise<TessWorker> {
  workerP ??= (async () => {
    const { createWorker, OEM } = await import('tesseract.js')
    const f = ocrFiles()
    const [w, core, lang] = await Promise.all([cachedBlob(f.worker), cachedBlob(f.core), cachedBlob(f.lang)])
    const workerPath = URL.createObjectURL(new Blob([w], { type: 'text/javascript' }))
    // tesseract.js loads a core given as a ".js" path directly; the fragment keeps the blob URL usable.
    const corePath = `${URL.createObjectURL(new Blob([core], { type: 'text/javascript' }))}#.js`
    const data = new Uint8Array(await lang.arrayBuffer())
    return createWorker([{ code: 'eng', data }], OEM.LSTM_ONLY, { workerPath, corePath, workerBlobURL: false, cacheMethod: 'none', gzip: true })
  })().catch((e) => {
    workerP = undefined
    throw e
  })
  return workerP
}

export interface OcrResult {
  words: TextWord[]
  /** Mean confidence 0–100. */
  conf: number
  /** Words that look like real English text read confidently: decides which way up a page is. */
  good: number
}

export async function recognize(image: Blob): Promise<OcrResult> {
  const w = await ocrWorker()
  const r = await w.recognize(image, {}, { blocks: true, text: false })
  const words: TextWord[] = []
  for (const b of r.data.blocks ?? [])
    for (const p of b.paragraphs)
      for (const l of p.lines)
        for (const wd of l.words) if (wd.text.trim()) words.push({ text: wd.text, conf: wd.confidence, x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1 })
  const good = words.filter((x) => (x.conf ?? 0) >= 75 && /[A-Za-z]{3,}/.test(x.text)).length
  return { words, conf: r.data.confidence, good }
}

export async function stopOcr(): Promise<void> {
  const p = workerP
  workerP = undefined
  if (p) await (await p).terminate()
}
