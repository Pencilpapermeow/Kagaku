// Pure stroke maths for the handwriting pad: smoothing, SVG paths, eraser hits.
// No DOM here, so it is unit-tested directly.

import type { InkStroke } from './types'

const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * Adds a point to a stroke being drawn. A capacitive stylus jitters by a pixel or two,
 * so each new point is pulled a little towards the previous one (light smoothing), and
 * points closer than `minDist` to the last kept point are skipped.
 * Returns false when the point was skipped.
 */
export function addPoint(p: number[], x: number, y: number, minDist = 1.2, smooth = 0.35): boolean {
  const n = p.length
  if (n >= 2) {
    const lx = p[n - 2]
    const ly = p[n - 1]
    const sx = lx + (x - lx) * (1 - smooth)
    const sy = ly + (y - ly) * (1 - smooth)
    if (Math.hypot(sx - lx, sy - ly) < minDist) return false
    p.push(round1(sx), round1(sy))
    return true
  }
  p.push(round1(x), round1(y))
  return true
}

/**
 * SVG path through the points: straight to the first midpoint, then quadratic curves
 * with each point as the control and the next midpoint as the end. This keeps the
 * line smooth without overshooting. A single point becomes a dot (a zero-length line
 * with round caps).
 */
export function strokePath(p: number[]): string {
  const n = p.length / 2
  if (n === 0) return ''
  const f = (v: number) => String(round1(v))
  if (n === 1) return `M${f(p[0])} ${f(p[1])}l0.01 0`
  if (n === 2) return `M${f(p[0])} ${f(p[1])}L${f(p[2])} ${f(p[3])}`
  let d = `M${f(p[0])} ${f(p[1])}`
  d += `L${f((p[0] + p[2]) / 2)} ${f((p[1] + p[3]) / 2)}`
  for (let i = 1; i < n - 1; i++) {
    const cx = p[i * 2]
    const cy = p[i * 2 + 1]
    const nx = p[i * 2 + 2]
    const ny = p[i * 2 + 3]
    d += `Q${f(cx)} ${f(cy)} ${f((cx + nx) / 2)} ${f((cy + ny) / 2)}`
  }
  d += `L${f(p[(n - 1) * 2])} ${f(p[(n - 1) * 2 + 1])}`
  return d
}

export interface Bounds {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function strokeBounds(s: InkStroke): Bounds {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < s.p.length; i += 2) {
    x0 = Math.min(x0, s.p[i])
    x1 = Math.max(x1, s.p[i])
    y0 = Math.min(y0, s.p[i + 1])
    y1 = Math.max(y1, s.p[i + 1])
  }
  const r = s.w / 2
  return { x0: x0 - r, y0: y0 - r, x1: x1 + r, y1: y1 + r }
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Does an eraser circle at (x, y) with radius r touch this stroke? */
export function hitsStroke(s: InkStroke, x: number, y: number, r: number): boolean {
  const b = strokeBounds(s)
  if (x < b.x0 - r || x > b.x1 + r || y < b.y0 - r || y > b.y1 + r) return false
  const reach = r + s.w / 2
  const p = s.p
  if (p.length === 2) return Math.hypot(x - p[0], y - p[1]) <= reach
  for (let i = 0; i + 3 < p.length; i += 2) {
    if (distToSegment(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= reach) return true
  }
  return false
}

/** Lowest point of the writing (0 for an empty card). */
export function contentBottom(strokes: InkStroke[]): number {
  let y = 0
  for (const s of strokes) y = Math.max(y, strokeBounds(s).y1)
  return y
}
