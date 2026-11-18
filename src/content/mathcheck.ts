// Uttam's rule (CLAUDE.md): maths and chemistry are always LaTeX, and every expression must
// render without a KaTeX error. This finds both kinds of slip in a piece of rich text.

import katex from 'katex'
import 'katex/contrib/mhchem'
import { segment } from '../ui/rich'

const PLAIN_MATH: [RegExp, string][] = [
  [/[A-Za-z0-9)]\^[-+]?[A-Za-z0-9(]/, 'a power written as ^ outside $…$'],
  [/\bsqrt\s*\(/i, 'sqrt( outside $…$'],
  [/\b[A-Za-z]_\d/, 'a subscript written as _ outside $…$'],
  [/\b(?:SO|NO|CO|PO|ClO|CrO|MnO)\d\s*\d?[+-]/, 'an ion written as plain text'],
]

/** Problems in one rich-text string: KaTeX errors, and maths written as plain text. */
export function mathProblems(src: string | undefined, opts: { latex?: boolean } = {}): string[] {
  if (!src) return []
  const out: string[] = []
  const render = (tex: string, display: boolean) => {
    try {
      katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'ignore', trust: false })
    } catch (e) {
      out.push(`KaTeX error in "${tex.slice(0, 60)}": ${(e as Error).message.slice(0, 120)}`)
    }
  }
  if (opts.latex) {
    render(src, true)
    return out
  }
  for (const s of segment(src)) {
    if (s.math) render(s.tex, s.display)
    else {
      for (const [re, what] of PLAIN_MATH) if (re.test(s.text)) out.push(`${what}: "${s.text.trim().slice(0, 60)}"`)
      // H2O, H2SO4, CO2: two or more element symbols with a number among them.
      const formula = s.text.split(/[^A-Za-z0-9]+/).find((w) => /\d/.test(w) && /^(?:[A-Z][a-z]?\d{0,2}){2,}$/.test(w) && (w.match(/[A-Z]/g)?.length ?? 0) >= 2)
      if (formula) out.push(`a chemical formula outside \\ce{}: "${formula}"`)
    }
  }
  return out
}

const RICH_KEYS = new Set(['stem', 'text', 'solution', 'assertion', 'reason', 'body', 'note', 'condition', 'basis', 'exceptions', 'label', 'title'])

/** Every problem in a pack-like object (questions, To Remember items, passages…), with its path. */
export function packMathProblems(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => packMathProblems(v, `${path}[${i}]`))
  if (!value || typeof value !== 'object') return []
  const out: string[] = []
  for (const [k, v] of Object.entries(value)) {
    const p = path ? `${path}.${k}` : k
    if (k === 'latex' && typeof v === 'string') out.push(...mathProblems(v, { latex: true }).map((m) => `${p}: ${m}`))
    else if ((RICH_KEYS.has(k) || k === 'order') && typeof v === 'string') out.push(...mathProblems(v).map((m) => `${p}: ${m}`))
    else if (k === 'order' && Array.isArray(v)) v.forEach((x, i) => typeof x === 'string' && out.push(...mathProblems(x).map((m) => `${p}[${i}]: ${m}`)))
    else if (k === 'rows' && Array.isArray(v)) v.forEach((row, i) => Object.entries(row as Record<string, string>).forEach(([c, x]) => out.push(...mathProblems(x).map((m) => `${p}[${i}].${c}: ${m}`))))
    else if (typeof v === 'object') out.push(...packMathProblems(v, p))
  }
  return out
}
