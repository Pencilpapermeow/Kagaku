// pdf.js text items → words with pixel boxes on the rendered page. Pure (no pdf.js import),
// so the same code runs in the app and in tests.

import type { TextWord } from './types'

export interface PdfTextItem {
  str: string
  /** Text-space → user-space matrix [a, b, c, d, e, f]. */
  transform: number[]
  /** Advance width in user-space units. */
  width: number
}

function mul(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ]
}

/**
 * @param viewport the page viewport's transform (user space → pixels) and its scale.
 * Only horizontal text is kept; rotated stamps and watermarks are ignored.
 */
export function wordsFromItems(items: PdfTextItem[], viewport: { transform: number[]; scale: number }): TextWord[] {
  const out: TextWord[] = []
  for (const it of items) {
    if (!it.str || !it.str.trim() || !it.transform) continue
    const m = mul(viewport.transform, it.transform)
    if (Math.abs(m[1]) > Math.abs(m[0]) * 0.1) continue
    const size = Math.hypot(m[2], m[3]) || Math.abs(m[3]) || 10
    const x = m[4]
    const base = m[5]
    const w = Math.abs(it.width * viewport.scale) || size * 0.5 * it.str.length
    const len = it.str.length
    const re = /\S+/g
    let mm: RegExpExecArray | null
    while ((mm = re.exec(it.str))) {
      out.push({
        text: mm[0],
        x0: x + (mm.index / len) * w,
        x1: x + ((mm.index + mm[0].length) / len) * w,
        y0: base - 0.8 * size,
        y1: base + 0.2 * size,
      })
    }
  }
  return out
}
