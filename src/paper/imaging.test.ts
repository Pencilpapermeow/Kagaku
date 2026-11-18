import { describe, expect, it } from 'vitest'
import { estimateRotation, flattenLight, rotate, trimBox, warp, type Gray } from './imaging'

/** A white "page" with rows of dashed ink like printed lines of text. */
function textPage(w = 600, h = 800): Gray {
  const data = new Uint8ClampedArray(w * h).fill(250)
  for (let y = 60; y < h - 60; y += 28)
    for (let x = 50; x < w - 50; x++) if (x % 14 < 10) for (let k = 0; k < 9; k++) data[(y + k) * w + x] = 20
  return { width: w, height: h, data }
}

describe('page orientation', () => {
  it('upright text needs no turn', () => {
    expect(estimateRotation(textPage())).toMatchObject({ sideways: false, skew: 0 })
  })
  it('a sideways photo is seen as sideways', () => {
    const r = estimateRotation(rotate(textPage(), 90))
    expect(r.sideways).toBe(true)
    // Turning by the answer makes the lines horizontal again.
    expect(estimateRotation(rotate(rotate(textPage(), 90), r.angle))).toMatchObject({ sideways: false, skew: 0 })
  })
  it('a small tilt is measured and undone', () => {
    const r = estimateRotation(rotate(textPage(), 3))
    expect(r.sideways).toBe(false)
    expect(r.skew).toBeGreaterThan(-3.6)
    expect(r.skew).toBeLessThan(-2.4)
  })
})

describe('cleaning and cutting', () => {
  it('evens out a dim, uneven photo: paper becomes white, ink stays dark', () => {
    const p = textPage()
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) p.data[y * p.width + x] *= 0.35 + (0.4 * x) / p.width
    const f = flattenLight(p)
    const at = (x: number, y: number) => f.data[y * f.width + x]
    expect(at(20, 20)).toBeGreaterThan(230)
    expect(at(580, 20)).toBeGreaterThan(230)
    expect(at(50, 62)).toBeLessThan(60)
  })
  it('trims to the ink, ignoring a page frame and a column rule', () => {
    const w = 400
    const h = 300
    const data = new Uint8ClampedArray(w * h).fill(255)
    for (let y = 0; y < h; y++) {
      data[y * w + 2] = 0 // frame
      data[y * w + 390] = 0 // column rule
    }
    for (let y = 100; y < 140; y++) for (let x = 120; x < 260; x++) data[y * w + x] = 0
    expect(trimBox({ width: w, height: h, data }, { x0: 0, y0: 0, x1: w, y1: h }, 5)).toEqual({ x0: 115, y0: 95, x1: 265, y1: 145 })
    expect(trimBox({ width: w, height: h, data }, { x0: 0, y0: 200, x1: w, y1: h })).toBeNull()
  })
  it('perspective warp maps the dragged corners to a rectangle', () => {
    const g = textPage(300, 300)
    const out = warp(g, [
      [0, 0],
      [299, 0],
      [299, 299],
      [0, 299],
    ])
    expect(out.width).toBe(299)
    expect(Math.abs(out.data[70 * out.width + 60] - g.data[70 * 300 + 60])).toBeLessThan(40)
  })
})
