import { describe, expect, it } from 'vitest'
import { renderRich, segment, plainText } from './rich'

describe('rich text', () => {
  it('splits inline and display math', () => {
    expect(segment('a $x$ b $$y$$')).toEqual([
      { math: false, text: 'a ' },
      { math: true, tex: 'x', display: false },
      { math: false, text: ' b ' },
      { math: true, tex: 'y', display: true },
    ])
  })
  it('escapes HTML in text', () => {
    expect(renderRich('<img src=x onerror=alert(1)>')).not.toContain('<img')
  })
  it('renders bare \\ce{} with nested braces', () => {
    const segs = segment('Water is \\ce{H2O} and \\ce{[Fe(CN)6]^{4-}}.')
    expect(segs.filter((s) => s.math).map((s) => (s.math ? s.tex : ''))).toEqual(['\\ce{H2O}', '\\ce{[Fe(CN)6]^{4-}}'])
    expect(renderRich('\\ce{H2O}')).toContain('katex')
  })
  it('keeps a lone dollar sign as text', () => {
    expect(plainText('costs $5')).toBe('costs $5')
  })
  it('handles bold and italic', () => {
    expect(renderRich('**bold** and *it*')).toBe('<strong>bold</strong> and <em>it</em>')
  })
})
