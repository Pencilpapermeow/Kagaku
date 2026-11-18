// Decoding, cleaning, rotating and cutting page images. Runs inside paper.worker.ts
// (OffscreenCanvas) or, on browsers without it, on the main thread.

import { estimateRotation, flattenLight, grayFromRGBA, rgbaFromGray, rotate, trimBox, warp, type Gray } from './imaging'
import type { Box } from './types'

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement
type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function ctxOf(c: AnyCanvas): Ctx {
  return c.getContext('2d', { willReadFrequently: true }) as Ctx
}

function encode(c: AnyCanvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type, quality })
  return new Promise((res, rej) => (c as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the image'))), type, quality))
}

let webp: boolean | undefined
/** WebP where the browser can write it (Chrome/Android); JPEG elsewhere (Safari). */
async function encodeSmall(c: AnyCanvas): Promise<Blob> {
  if (webp !== false) {
    const b = await encode(c, 'image/webp', 0.8)
    if (b.type === 'image/webp') {
      webp = true
      return b
    }
    webp = false
  }
  return encode(c, 'image/jpeg', 0.85)
}

function grayCanvas(g: Gray): AnyCanvas {
  const c = makeCanvas(g.width, g.height)
  ctxOf(c).putImageData(new ImageData(rgbaFromGray(g), g.width, g.height), 0, 0)
  return c
}

/** Decode, scale so the long side ≤ maxSide, and turn by quarter turns (clockwise). */
async function decodeGray(blob: Blob, maxSide: number, turns: number): Promise<Gray> {
  const bmp = await createImageBitmap(blob)
  const f = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * f)
  const h = Math.round(bmp.height * f)
  const q = ((turns % 4) + 4) % 4
  const c = makeCanvas(q % 2 ? h : w, q % 2 ? w : h)
  const ctx = ctxOf(c)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.translate(c.width / 2, c.height / 2)
  ctx.rotate((q * Math.PI) / 2)
  ctx.drawImage(bmp, -w / 2, -h / 2, w, h)
  bmp.close?.()
  const d = ctx.getImageData(0, 0, c.width, c.height)
  return grayFromRGBA(d.data, c.width, c.height)
}

function scaleCanvas(src: AnyCanvas, maxWidth: number): AnyCanvas {
  if (src.width <= maxWidth) return src
  const f = maxWidth / src.width
  const c = makeCanvas(maxWidth, Math.round(src.height * f))
  const ctx = ctxOf(c)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src as CanvasImageSource, 0, 0, c.width, c.height)
  return c
}

export interface CleanOptions {
  turns: number
  /** Page corners as fractions (TL, TR, BR, BL) of the turned photo. */
  corners?: [number, number][]
  /** Find sideways text and small tilts by itself. */
  auto: boolean
  maxWidth: number
}

export interface PageImage {
  blob: Blob
  width: number
  height: number
  /** Extra rotation applied by the automatic straightening. */
  angle: number
}

/** A phone photo (or scanned page) → a clean, straight, grayscale page image. */
export async function cleanPhoto(blob: Blob, o: CleanOptions): Promise<PageImage> {
  let g = await decodeGray(blob, 2600, o.turns)
  if (o.corners?.length === 4) g = warp(g, o.corners.map(([x, y]) => [x * g.width, y * g.height] as [number, number]))
  g = flattenLight(g)
  let angle = 0
  if (o.auto) {
    const r = estimateRotation(g)
    angle = r.angle
    if (angle) g = rotate(g, angle)
  }
  const c = scaleCanvas(grayCanvas(g), o.maxWidth)
  return { blob: await encode(c, 'image/jpeg', 0.85), width: c.width, height: c.height, angle }
}

/** Turn an image by a quarter-turn multiple (used to retry OCR upside down). */
export async function turnImage(blob: Blob, deg: number): Promise<PageImage> {
  const g = rotate(await decodeGray(blob, 4000, 0), deg)
  const c = grayCanvas(g)
  return { blob: await encode(c, 'image/jpeg', 0.85), width: c.width, height: c.height, angle: deg }
}

/**
 * Cut a question: each piece is trimmed to its ink and the pieces are stacked top to
 * bottom (a question that runs into the next column becomes one picture).
 */
export async function cutCrop(pages: Record<number, Blob>, pieces: { page: number; box: Box }[]): Promise<{ blob: Blob; width: number; height: number } | null> {
  const bitmaps = new Map<number, ImageBitmap>()
  const parts: { bmp: ImageBitmap; box: Box }[] = []
  try {
    for (const p of pieces) {
      let bmp = bitmaps.get(p.page)
      if (!bmp) {
        bmp = await createImageBitmap(pages[p.page])
        bitmaps.set(p.page, bmp)
      }
      const x0 = Math.max(0, Math.floor(p.box.x0))
      const y0 = Math.max(0, Math.floor(p.box.y0))
      const w = Math.min(bmp.width, Math.ceil(p.box.x1)) - x0
      const h = Math.min(bmp.height, Math.ceil(p.box.y1)) - y0
      if (w < 4 || h < 4) continue
      const c = makeCanvas(w, h)
      const ctx = ctxOf(c)
      ctx.drawImage(bmp, x0, y0, w, h, 0, 0, w, h)
      const g = grayFromRGBA(ctx.getImageData(0, 0, w, h).data, w, h)
      const t = trimBox(g, { x0: 0, y0: 0, x1: w, y1: h }, 8)
      if (!t) continue
      parts.push({ bmp, box: { x0: x0 + t.x0, y0: y0 + t.y0, x1: x0 + t.x1, y1: y0 + t.y1 } })
    }
    if (!parts.length) return null
    const gap = 18
    const W = Math.max(...parts.map((p) => p.box.x1 - p.box.x0))
    const H = parts.reduce((a, p) => a + (p.box.y1 - p.box.y0), 0) + gap * (parts.length - 1)
    const out = makeCanvas(W, H)
    const ctx = ctxOf(out)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, W, H)
    let y = 0
    parts.forEach((p, i) => {
      const w = p.box.x1 - p.box.x0
      const h = p.box.y1 - p.box.y0
      ctx.drawImage(p.bmp, p.box.x0, p.box.y0, w, h, 0, y, w, h)
      y += h
      if (i < parts.length - 1) {
        // A faint dotted join, so he can see where the parts meet.
        ctx.fillStyle = '#c8c8d0'
        for (let x = 4; x < W - 4; x += 10) ctx.fillRect(x, y + gap / 2, 5, 1)
        y += gap
      }
    })
    return { blob: await encodeSmall(out), width: W, height: H }
  } finally {
    for (const b of bitmaps.values()) b.close?.()
  }
}
