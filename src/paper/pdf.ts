// pdf.js, loaded only when "Test from paper" is used (it is ~1.6 MB with its worker).

import { cachedBlob, PDF_WORKER_URL } from './tools'
import { wordsFromItems, type PdfTextItem } from './pdfText'
import type { TextWord } from './types'

type PdfLib = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
type PdfDoc = Awaited<ReturnType<PdfLib['getDocument']>['promise']>

let lib: Promise<PdfLib> | undefined
let workerUrl: Promise<string> | undefined

export function pdfjs(): Promise<PdfLib> {
  lib ??= import('pdfjs-dist/legacy/build/pdf.mjs').catch((e) => {
    lib = undefined
    throw e
  })
  return lib
}

/** The pdf.js worker script from our cache, as a blob URL, so it also starts offline. */
function workerSrc(): Promise<string> {
  workerUrl ??= cachedBlob(PDF_WORKER_URL)
    .then((b) => URL.createObjectURL(new Blob([b], { type: 'text/javascript' })))
    .catch((e) => {
      workerUrl = undefined
      throw e
    })
  return workerUrl
}

export interface OpenPdf {
  doc: PdfDoc
  close: () => Promise<void>
}

/**
 * Each document gets its own worker thread, closed with it. Keep only ONE document open at a
 * time: pdf.js 5 stores the page count of the last opened document in a global (PagesMapper),
 * so pages of an earlier document beyond that count fail with "Invalid page request".
 */
export async function openPdf(blob: Blob): Promise<OpenPdf> {
  const m = await pdfjs()
  const port = new Worker(await workerSrc(), { type: 'module' })
  const worker = m.PDFWorker.create({ port })
  try {
    const doc = await m.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), worker, useSystemFonts: true, isEvalSupported: false }).promise
    return {
      doc,
      close: async () => {
        await doc.destroy().catch(() => undefined)
        worker.destroy()
        port.terminate()
      },
    }
  } catch (e) {
    worker.destroy()
    port.terminate()
    throw e
  }
}

export interface RenderedPage {
  blob: Blob
  width: number
  height: number
  words: TextWord[]
  chars: number
}

/** Render a page about `width` pixels wide (JPEG) and read its text layer with positions. */
export async function renderPage(doc: PdfDoc, n: number, width = 1600): Promise<RenderedPage> {
  const page = await doc.getPage(n)
  const vp1 = page.getViewport({ scale: 1 })
  const vp = page.getViewport({ scale: Math.min(3.5, width / vp1.width) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(vp.width)
  canvas.height = Math.round(vp.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise
  const tc = await page.getTextContent()
  const items = tc.items.filter((i): i is PdfTextItem & typeof i => 'str' in i)
  const words = wordsFromItems(items, vp)
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not save the page image'))), 'image/jpeg', 0.88))
  page.cleanup()
  canvas.width = 0
  return { blob, width: Math.round(vp.width), height: Math.round(vp.height), words, chars: items.reduce((a, i) => a + i.str.trim().length, 0) }
}

/** Text only (fast): used to spot answer-key pages inside a paper PDF before processing. */
export async function pageWords(doc: PdfDoc, n: number): Promise<{ words: TextWord[]; width: number; height: number }> {
  const page = await doc.getPage(n)
  const vp = page.getViewport({ scale: 1600 / page.getViewport({ scale: 1 }).width })
  const tc = await page.getTextContent()
  const words = wordsFromItems(
    tc.items.filter((i): i is PdfTextItem & typeof i => 'str' in i),
    vp,
  )
  page.cleanup()
  return { words, width: vp.width, height: vp.height }
}
