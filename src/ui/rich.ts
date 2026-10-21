// Rich text → HTML. Text parts are escaped; only math goes through KaTeX.
// Supports $…$, $$…$$, \(…\), \[…\], bare \ce{…} (mhchem), **bold**, *italic*, line breaks.

import katex from 'katex'
import 'katex/contrib/mhchem'

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function inlineMarkup(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\n/g, '<br>')
}

export function renderMath(tex: string, display = false): string {
  return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false, output: 'html' })
}

type Seg = { math: false; text: string } | { math: true; tex: string; display: boolean }

/** Index of the brace that closes the one at `open`, or -1. */
function closingBrace(s: string, open: number): number {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '\\') {
      i++
      continue
    }
    if (s[i] === '{') depth++
    else if (s[i] === '}' && --depth === 0) return i
  }
  return -1
}

export function segment(src: string): Seg[] {
  const out: Seg[] = []
  let text = ''
  let i = 0
  const flush = () => {
    if (text) out.push({ math: false, text })
    text = ''
  }
  while (i < src.length) {
    const rest = src.slice(i)
    let m: { open: string; close: string; display: boolean } | undefined
    if (rest.startsWith('$$')) m = { open: '$$', close: '$$', display: true }
    else if (rest.startsWith('\\[')) m = { open: '\\[', close: '\\]', display: true }
    else if (rest.startsWith('\\(')) m = { open: '\\(', close: '\\)', display: false }
    else if (rest[0] === '$') m = { open: '$', close: '$', display: false }
    if (m) {
      const end = src.indexOf(m.close, i + m.open.length)
      if (end > i + m.open.length - 1) {
        flush()
        out.push({ math: true, tex: src.slice(i + m.open.length, end), display: m.display })
        i = end + m.close.length
        continue
      }
    }
    if (rest.startsWith('\\$')) {
      text += '$'
      i += 2
      continue
    }
    if (rest.startsWith('\\ce{')) {
      const close = closingBrace(src, i + 3)
      if (close > 0) {
        flush()
        out.push({ math: true, tex: src.slice(i, close + 1), display: false })
        i = close + 1
        continue
      }
    }
    text += src[i]
    i++
  }
  flush()
  return out
}

export function renderRich(src: string | undefined): string {
  if (!src) return ''
  return segment(src)
    .map((s) => (s.math ? renderMath(s.tex, s.display) : inlineMarkup(s.text)))
    .join('')
}

/** Plain text for search and sharing: math is kept as its LaTeX source. */
export function plainText(src: string | undefined): string {
  if (!src) return ''
  return segment(src)
    .map((s) => (s.math ? s.tex : s.text.replace(/\*\*|\*/g, '')))
    .join('')
}
