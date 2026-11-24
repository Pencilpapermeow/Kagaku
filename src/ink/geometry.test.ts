import { describe, expect, it } from 'vitest'
import { addPoint, contentBottom, hitsStroke, strokeBounds, strokePath } from './geometry'
import type { InkStroke } from './types'

describe('stroke maths', () => {
  it('skips points that barely moved and smooths jitter', () => {
    const p: number[] = []
    addPoint(p, 10, 10)
    expect(addPoint(p, 10.4, 10.3)).toBe(false)
    expect(addPoint(p, 20, 10)).toBe(true)
    // Pulled towards the last point (light smoothing), rounded to one decimal.
    expect(p).toEqual([10, 10, 16.5, 10])
  })

  it('makes a dot, a line and a smooth curve', () => {
    expect(strokePath([5, 5])).toBe('M5 5l0.01 0')
    expect(strokePath([0, 0, 10, 0])).toBe('M0 0L10 0')
    const d = strokePath([0, 0, 10, 10, 20, 0, 30, 10])
    expect(d.startsWith('M0 0L5 5Q10 10 15 5Q20 0 25 5L30 10')).toBe(true)
  })

  it('eraser hits a stroke only within its reach', () => {
    const s: InkStroke = { c: 'ink', w: 4, p: [0, 0, 100, 0] }
    expect(hitsStroke(s, 50, 10, 9)).toBe(true) // 10 ≤ 9 + 2
    expect(hitsStroke(s, 50, 12, 9)).toBe(false)
    expect(hitsStroke(s, 130, 0, 9)).toBe(false)
    expect(hitsStroke({ c: 'ink', w: 4, p: [50, 50] }, 55, 50, 4)).toBe(true)
  })

  it('knows where the writing ends', () => {
    const s: InkStroke = { c: 'ink', w: 6, p: [0, 10, 30, 80] }
    expect(strokeBounds(s)).toEqual({ x0: -3, y0: 7, x1: 33, y1: 83 })
    expect(contentBottom([s, { c: 'ink', w: 2, p: [0, 5] }])).toBe(83)
    expect(contentBottom([])).toBe(0)
  })
})
