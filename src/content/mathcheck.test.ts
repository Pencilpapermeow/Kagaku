import { describe, expect, it } from 'vitest'
import { mathProblems, packMathProblems } from './mathcheck'
import { DEMO_PACK } from './demo'

describe('maths is LaTeX and renders (CLAUDE.md rule)', () => {
  it('catches plain-text maths and broken LaTeX', () => {
    expect(mathProblems('Speed is x^2 here')).toHaveLength(1)
    expect(mathProblems('Take sqrt(2)')).toHaveLength(1)
    expect(mathProblems('Dissolve H2SO4 in water')).toHaveLength(1)
    expect(mathProblems('The ion SO4 2- is')).not.toHaveLength(0)
    expect(mathProblems('Broken $\\frac{1}$ here')).not.toHaveLength(0)
  })
  it('accepts proper LaTeX and ordinary text', () => {
    expect(mathProblems('Speed is $x^{2}$, $\\frac{a}{b}$, $\\sqrt{2}$ and \\ce{H2SO4}, \\ce{SO4^2-}. Q12 of JA 2027.')).toEqual([])
  })
  it('the demo pack follows the rule', () => {
    expect(packMathProblems(DEMO_PACK)).toEqual([])
  })
})
