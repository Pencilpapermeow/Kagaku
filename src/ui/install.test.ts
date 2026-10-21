import { describe, expect, it } from 'vitest'
import { detectPlatform } from './install'

describe('install platform', () => {
  it('recognises iPadOS Safari, which pretends to be a Mac', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', 'MacIntel', 5)).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe('other')
  })
  it('recognises Android and iPhone', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/141.0 Mobile', 'Linux armv8l', 5)).toBe('android')
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5)).toBe('ios')
  })
})
