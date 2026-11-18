// Pixel work for paper photos, on plain grayscale buffers (no canvas), so it runs in a
// worker or on the main thread and can be unit-tested.
//
//   flattenLight   even out dim, uneven phone light: divide by the paper's own brightness
//   orientation    is the text sideways? how much is it tilted? (projection profiles)
//   rotate         by any angle (quarter turns are exact)
//   warp           perspective fix from the 4 page corners he dragged
//   trimBox        tight crop, ignoring page frames and column rules at the edges

import type { Box } from './types'

export interface Gray {
  width: number
  height: number
  data: Uint8ClampedArray
}

export function grayFromRGBA(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Uint8ClampedArray(width * height)
  for (let i = 0, j = 0; i < data.length; i++, j += 4) data[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8
  return { width, height, data }
}

export function rgbaFromGray(g: Gray): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(g.width * g.height * 4))
  for (let i = 0, j = 0; i < g.data.length; i++, j += 4) {
    const v = g.data[i]
    out[j] = v
    out[j + 1] = v
    out[j + 2] = v
    out[j + 3] = 255
  }
  return out
}

/** Box-filter downscale so the longer side is at most maxSide. */
export function downscale(g: Gray, maxSide: number): Gray {
  const f = Math.max(g.width, g.height) / maxSide
  if (f <= 1) return g
  const w = Math.max(1, Math.round(g.width / f))
  const h = Math.max(1, Math.round(g.height / f))
  const data = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor(y * f)
    const sy1 = Math.min(g.height, Math.max(sy0 + 1, Math.floor((y + 1) * f)))
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(x * f)
      const sx1 = Math.min(g.width, Math.max(sx0 + 1, Math.floor((x + 1) * f)))
      let sum = 0
      for (let yy = sy0; yy < sy1; yy++) for (let xx = sx0; xx < sx1; xx++) sum += g.data[yy * g.width + xx]
      data[y * w + x] = sum / ((sy1 - sy0) * (sx1 - sx0))
    }
  }
  return { width: w, height: h, data }
}

/**
 * Even out the light of a phone photo. The paper's brightness is estimated per cell (a high
 * percentile, so text doesn't count), smoothed, and every pixel is divided by it; then the
 * contrast is stretched so the paper is white and the ink is dark.
 */
export function flattenLight(g: Gray): Gray {
  const { width: w, height: h, data } = g
  const cell = Math.max(8, Math.round(Math.max(w, h) / 40))
  const gw = Math.ceil(w / cell)
  const gh = Math.ceil(h / cell)
  const bg = new Float32Array(gw * gh)
  const hist = new Uint32Array(256)
  for (let cy = 0; cy < gh; cy++)
    for (let cx = 0; cx < gw; cx++) {
      hist.fill(0)
      let n = 0
      for (let y = cy * cell; y < Math.min(h, (cy + 1) * cell); y += 2)
        for (let x = cx * cell; x < Math.min(w, (cx + 1) * cell); x += 2) {
          hist[data[y * w + x]]++
          n++
        }
      let acc = 0
      let v = 255
      for (; v > 0; v--) {
        acc += hist[v]
        if (acc >= n * 0.1) break
      }
      bg[cy * gw + cx] = Math.max(24, v)
    }
  // Smooth the background twice with a 3×3 box.
  for (let pass = 0; pass < 2; pass++) {
    const src = bg.slice()
    for (let cy = 0; cy < gh; cy++)
      for (let cx = 0; cx < gw; cx++) {
        let s = 0
        let k = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const yy = cy + dy
            const xx = cx + dx
            if (yy < 0 || xx < 0 || yy >= gh || xx >= gw) continue
            s += src[yy * gw + xx]
            k++
          }
        bg[cy * gw + cx] = s / k
      }
  }
  const out = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) {
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / cell - 0.5))
    const y0 = Math.floor(fy)
    const y1 = Math.min(gh - 1, y0 + 1)
    const ty = fy - y0
    for (let x = 0; x < w; x++) {
      const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / cell - 0.5))
      const x0 = Math.floor(fx)
      const x1 = Math.min(gw - 1, x0 + 1)
      const tx = fx - x0
      const b = (bg[y0 * gw + x0] * (1 - tx) + bg[y0 * gw + x1] * tx) * (1 - ty) + (bg[y1 * gw + x0] * (1 - tx) + bg[y1 * gw + x1] * tx) * ty
      out[y * w + x] = Math.min(255, (data[y * w + x] / b) * 255)
    }
  }
  // Stretch: darkest 0.5% → black, and a soft curve that keeps thin strokes dark.
  hist.fill(0)
  for (let i = 0; i < out.length; i += 3) hist[out[i]]++
  const total = Math.ceil(out.length / 3)
  let lo = 0
  for (let acc = 0; lo < 255; lo++) {
    acc += hist[lo]
    if (acc > total * 0.005) break
  }
  const hi = 235
  const lut = new Uint8ClampedArray(256)
  for (let v = 0; v < 256; v++) {
    const t = Math.min(1, Math.max(0, (v - lo) / Math.max(1, hi - lo)))
    lut[v] = Math.round(255 * Math.pow(t, 1.4))
  }
  for (let i = 0; i < out.length; i++) out[i] = lut[out[i]]
  return { width: w, height: h, data: out }
}

/** Coordinates of dark pixels (ink), thinned to at most maxPoints. */
export function inkPoints(g: Gray, threshold = 128, maxPoints = 30000): Float32Array {
  let n = 0
  for (let i = 0; i < g.data.length; i++) if (g.data[i] < threshold) n++
  const step = Math.max(1, Math.ceil(n / maxPoints))
  const pts = new Float32Array(Math.ceil(n / step) * 2 + 2)
  let k = 0
  let c = 0
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++)
      if (g.data[y * g.width + x] < threshold && c++ % step === 0) {
        pts[k++] = x
        pts[k++] = y
      }
  return pts.subarray(0, k)
}

/**
 * How strongly ink falls into horizontal lines after rotating by `deg` (degrees, the same
 * direction as rotate()). Text lines give sharp peaks; the score is the mean squared row count.
 */
export function lineScore(pts: Float32Array, deg: number, cx: number, cy: number): number {
  const a = (deg * Math.PI) / 180
  const sin = Math.sin(a)
  const cos = Math.cos(a)
  const bins = new Map<number, number>()
  const n = pts.length / 2
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] - cx
    const y = pts[i + 1] - cy
    const yr = Math.round((x * sin + y * cos) / 2)
    bins.set(yr, (bins.get(yr) ?? 0) + 1)
  }
  let s = 0
  for (const v of bins.values()) s += v * v
  return n ? s / n : 0
}

/**
 * Which way up is the text, and how much is it tilted? Returns the rotation (degrees,
 * clockwise) that makes lines horizontal: 0 or 90 (sideways), plus a small skew. Whether
 * the page is upside down can't be seen from lines; the OCR confidence decides that.
 */
export function estimateRotation(g: Gray): { angle: number; sideways: boolean; skew: number } {
  const small = downscale(g, 700)
  const pts = inkPoints(small, 110)
  if (pts.length < 200) return { angle: 0, sideways: false, skew: 0 }
  const cx = small.width / 2
  const cy = small.height / 2
  const best = (base: number) => {
    let top = { deg: base, s: -1 }
    for (let d = -6; d <= 6; d += 0.5) {
      const s = lineScore(pts, base + d, cx, cy)
      if (s > top.s) top = { deg: base + d, s }
    }
    // refine
    for (let d = -0.4; d <= 0.4; d += 0.1) {
      const s = lineScore(pts, top.deg + d, cx, cy)
      if (s > top.s) top = { deg: top.deg + d, s }
    }
    return top
  }
  const upright = best(0)
  const side = best(90)
  const sideways = side.s > upright.s * 1.15
  const pick = sideways ? side : upright
  const skew = Math.round((pick.deg - (sideways ? 90 : 0)) * 10) / 10
  return { angle: Math.round(pick.deg * 10) / 10, sideways, skew: Math.abs(skew) < 0.25 ? 0 : skew }
}

/** Rotate clockwise by any angle; the canvas grows to fit and new corners are white. */
export function rotate(g: Gray, deg: number): Gray {
  const norm = ((deg % 360) + 360) % 360
  const { width: w, height: h, data } = g
  if (norm === 0) return g
  if (norm === 90 || norm === 180 || norm === 270) {
    const W = norm === 180 ? w : h
    const H = norm === 180 ? h : w
    const out = new Uint8ClampedArray(W * H)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = data[y * w + x]
        if (norm === 90) out[x * W + (h - 1 - y)] = v
        else if (norm === 180) out[(h - 1 - y) * W + (w - 1 - x)] = v
        else out[(w - 1 - x) * W + y] = v
      }
    return { width: W, height: H, data: out }
  }
  const a = (norm * Math.PI) / 180
  const sin = Math.sin(a)
  const cos = Math.cos(a)
  const W = Math.round(Math.abs(w * cos) + Math.abs(h * sin))
  const H = Math.round(Math.abs(w * sin) + Math.abs(h * cos))
  const out = new Uint8ClampedArray(W * H).fill(255)
  const cx = w / 2
  const cy = h / 2
  for (let Y = 0; Y < H; Y++)
    for (let X = 0; X < W; X++) {
      const dx = X - W / 2
      const dy = Y - H / 2
      // inverse of (x cos − y sin, x sin + y cos)
      const sx = dx * cos + dy * sin + cx
      const sy = -dx * sin + dy * cos + cy
      out[Y * W + X] = sample(g, sx, sy)
    }
  return { width: W, height: H, data: out }
}

function sample(g: Gray, x: number, y: number): number {
  if (x < 0 || y < 0 || x > g.width - 1 || y > g.height - 1) return 255
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(g.width - 1, x0 + 1)
  const y1 = Math.min(g.height - 1, y0 + 1)
  const tx = x - x0
  const ty = y - y0
  const d = g.data
  const w = g.width
  return (d[y0 * w + x0] * (1 - tx) + d[y0 * w + x1] * tx) * (1 - ty) + (d[y1 * w + x0] * (1 - tx) + d[y1 * w + x1] * tx) * ty
}

/** 3×3 matrix mapping the unit square's corners (0,0),(1,0),(1,1),(0,1) to a quadrilateral. */
function squareToQuad(q: [number, number][]): number[] {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q
  const dx1 = x1 - x2
  const dx2 = x3 - x2
  const dy1 = y1 - y2
  const dy2 = y3 - y2
  const sx = x0 - x1 + x2 - x3
  const sy = y0 - y1 + y2 - y3
  const den = dx1 * dy2 - dx2 * dy1
  const g = (sx * dy2 - dx2 * sy) / den
  const hh = (dx1 * sy - sx * dy1) / den
  return [x1 - x0 + g * x1, x3 - x0 + hh * x3, x0, y1 - y0 + g * y1, y3 - y0 + hh * y3, y0, g, hh, 1]
}

/** Straighten a page photographed at an angle: corners are TL, TR, BR, BL in pixels. */
export function warp(g: Gray, corners: [number, number][]): Gray {
  const [tl, tr, br, bl] = corners
  const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1])
  const W = Math.max(8, Math.round(Math.max(dist(tl, tr), dist(bl, br))))
  const H = Math.max(8, Math.round(Math.max(dist(tl, bl), dist(tr, br))))
  const m = squareToQuad(corners)
  const out = new Uint8ClampedArray(W * H)
  for (let Y = 0; Y < H; Y++) {
    const v = (Y + 0.5) / H
    for (let X = 0; X < W; X++) {
      const u = (X + 0.5) / W
      const z = m[6] * u + m[7] * v + m[8]
      const sx = (m[0] * u + m[1] * v + m[2]) / z
      const sy = (m[3] * u + m[4] * v + m[5]) / z
      out[Y * W + X] = sample(g, sx, sy)
    }
  }
  return { width: W, height: H, data: out }
}

/**
 * The tight box around the ink inside `box`. Rows/columns that are almost all ink (page
 * frames, column dividers, heading rules) count as empty at the edges. null = no ink.
 */
export function trimBox(g: Gray, box: Box, pad = 10, threshold = 165): Box | null {
  const x0 = Math.max(0, Math.floor(box.x0))
  const y0 = Math.max(0, Math.floor(box.y0))
  const x1 = Math.min(g.width, Math.ceil(box.x1))
  const y1 = Math.min(g.height, Math.ceil(box.y1))
  if (x1 - x0 < 2 || y1 - y0 < 2) return null
  const W = x1 - x0
  const H = y1 - y0
  const dark = (x: number, y: number) => g.data[y * g.width + x] < threshold
  // Long straight rules (frames, column dividers, heading boxes) are not content.
  const colAll = new Uint32Array(W)
  const rowAll = new Uint32Array(H)
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (dark(x, y)) {
        rowAll[y - y0]++
        colAll[x - x0]++
      }
  const ruleCol = (i: number) => colAll[i] >= H * 0.85
  const ruleRow = (j: number) => rowAll[j] >= W * 0.85
  const rows = new Uint32Array(H)
  const cols = new Uint32Array(W)
  for (let y = y0; y < y1; y++) {
    if (ruleRow(y - y0)) continue
    for (let x = x0; x < x1; x++)
      if (!ruleCol(x - x0) && dark(x, y)) {
        rows[y - y0]++
        cols[x - x0]++
      }
  }
  const rowInk = (i: number) => !ruleRow(i) && rows[i] > Math.max(1, W * 0.002)
  const colInk = (i: number) => !ruleCol(i) && cols[i] > Math.max(1, H * 0.002)
  let top = 0
  while (top < H && !rowInk(top)) top++
  if (top >= H) return null
  let bottom = H - 1
  while (bottom > top && !rowInk(bottom)) bottom--
  let left = 0
  while (left < W && !colInk(left)) left++
  let right = W - 1
  while (right > left && !colInk(right)) right--
  if (left >= W) return null
  return {
    x0: Math.max(x0, x0 + left - pad),
    y0: Math.max(y0, y0 + top - pad),
    x1: Math.min(x1, x0 + right + 1 + pad),
    y1: Math.min(y1, y0 + bottom + 1 + pad),
  }
}
