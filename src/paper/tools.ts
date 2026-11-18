// The reading tools are not part of the app install. They are downloaded once into the
// browser's Cache Storage and then work offline (the service worker serves them from the same
// cache, see vite.config.ts → runtimeCaching):
//   'pdf'  pdf.js and its worker (~1.6 MB) — the first time "Test from paper" is opened
//   'ocr'  Tesseract engine + English data (~7 MB) — only when a photo or a scanned PDF needs it

import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

export const TOOLS_CACHE = 'kagaku-paper-tools-v1'
export type ToolKind = 'pdf' | 'ocr'
export const TOOLS_SIZE_MB: Record<ToolKind, number> = { pdf: 1.6, ocr: 7 }

const base = import.meta.env.BASE_URL

function simd(): boolean {
  try {
    // A tiny module using a SIMD instruction (same probe as wasm-feature-detect).
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]))
  } catch {
    return false
  }
}

export function ocrFiles() {
  return {
    worker: `${base}ocr/worker.min.js`,
    core: `${base}ocr/${simd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'}`,
    lang: `${base}ocr/eng.traineddata.gz`,
  }
}

export const PDF_WORKER_URL = pdfWorkerUrl

export function toolUrls(kind: ToolKind): string[] {
  const urls = kind === 'pdf' ? [PDF_WORKER_URL] : Object.values(ocrFiles())
  return urls.map((u) => new URL(u, location.href).href)
}

async function cache(): Promise<Cache | undefined> {
  try {
    return 'caches' in globalThis ? await caches.open(TOOLS_CACHE) : undefined
  } catch {
    return undefined
  }
}

/** A tool file from the cache, or downloaded (and cached) when online. */
export async function cachedBlob(url: string): Promise<Blob> {
  const abs = new URL(url, location.href).href
  const c = await cache()
  const hit = await c?.match(abs)
  if (hit) return hit.blob()
  const res = await fetch(abs)
  if (!res.ok) throw new Error(`Couldn't download ${abs.split('/').pop()} (${res.status})`)
  const blob = await res.blob()
  await c?.put(abs, new Response(blob, { headers: { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream' } }))
  return blob
}

export async function toolsReady(kind: ToolKind): Promise<boolean> {
  const c = await cache()
  if (!c) return false
  for (const u of toolUrls(kind)) if (!(await c.match(u))) return false
  return true
}

/** Download one kind of tool once, reporting megabytes received. */
export async function downloadTools(kind: ToolKind, onProgress: (mb: number) => void): Promise<void> {
  const c = await cache()
  let bytes = 0
  // The pdf.js library itself is a lazy chunk; importing it puts it in the service worker's cache.
  if (kind === 'pdf') await import('./pdf').then((m) => m.pdfjs())
  for (const u of toolUrls(kind)) {
    if (await c?.match(u)) continue
    const res = await fetch(u)
    if (!res.ok || !res.body) throw new Error(`Couldn't download ${u.split('/').pop()} (${res.status})`)
    const reader = res.body.getReader()
    const chunks: Uint8Array<ArrayBuffer>[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value as Uint8Array<ArrayBuffer>)
      bytes += value.byteLength
      onProgress(bytes / 1048576)
    }
    await c?.put(u, new Response(new Blob(chunks), { headers: { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream' } }))
  }
}
