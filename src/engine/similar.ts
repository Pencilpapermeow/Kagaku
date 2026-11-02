// "How easily could he confuse these two?" — used to pick look-alike wrong options.
//   SO₄²⁻ vs SO₃²⁻ (same shape), Sulphate vs Sulphite (same letters), 26 vs 27 (close numbers).
// Cheap string measures only: no AI, works offline, same result every time.

/** Text as it reads on screen: LaTeX/mhchem wrapping and spacing removed, lower case. */
export function plain(s: string): string {
  return s
    .replace(/\\ce\{/g, '')
    .replace(/\\(?:mathrm|text|mathbf|mathit|operatorname)\{/g, '')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}$^_\\]/g, '')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => String('⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)))
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c)))
    .replace(/[⁺]/g, '+')
    .replace(/[⁻−–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Same text for checking equality (ignores spaces and markup). */
export function same(a: string, b: string): boolean {
  return plain(a).replace(/ /g, '') === plain(b).replace(/ /g, '')
}

/** "26", "+3", "−1/2", "35.5" → a number; anything with words or units → undefined. */
export function numberOf(s: string): number | undefined {
  const t = plain(s).replace(/ /g, '')
  if (/^[+-]?\d+(\.\d+)?$/.test(t)) return Number(t)
  // Charges written the chemists' way: "2−", "3+"
  const c = t.match(/^(\d+)([+-])$/)
  if (c) return (c[2] === '-' ? -1 : 1) * Number(c[1])
  const f = t.match(/^([+-]?)(\d+)\/(\d+)$/)
  if (f && Number(f[3]) !== 0) return (f[1] === '-' ? -1 : 1) * (Number(f[2]) / Number(f[3]))
  return undefined
}

/** Decimal places written in the cell ("1.008" → 3), for typed-answer tolerance. */
export function decimalsOf(s: string): number {
  const m = plain(s).match(/\.(\d+)$/)
  return m ? m[1].length : 0
}

function bigrams(s: string): string[] {
  const t = s.replace(/ /g, '')
  if (t.length < 2) return [t]
  const out: string[] = []
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2))
  return out
}

function dice(a: string, b: string): number {
  const A = bigrams(a)
  const B = bigrams(b)
  if (!A.length || !B.length) return 0
  const counts = new Map<string, number>()
  for (const x of A) counts.set(x, (counts.get(x) ?? 0) + 1)
  let common = 0
  for (const x of B) {
    const n = counts.get(x) ?? 0
    if (n > 0) {
      common++
      counts.set(x, n - 1)
    }
  }
  return (2 * common) / (A.length + B.length)
}

/** Letters → a, digits → 0: "so42-" and "so32-" share the shape "aa00-". */
const shape = (s: string) => s.replace(/[a-z]/g, 'a').replace(/\d/g, '0')

/** 0 (nothing alike) … 1 (identical). */
export function similarity(a: string, b: string): number {
  const na = numberOf(a)
  const nb = numberOf(b)
  if (na !== undefined && nb !== undefined) {
    const rel = Math.abs(na - nb) / Math.max(Math.abs(na), Math.abs(nb), 1)
    return 1 / (1 + 8 * rel)
  }
  const pa = plain(a)
  const pb = plain(b)
  if (pa === pb) return 1
  const lengthMatch = 1 - Math.abs(pa.length - pb.length) / Math.max(pa.length, pb.length, 1)
  const firstWord = pa.split(' ')[0] === pb.split(' ')[0] ? 1 : 0
  return 0.55 * dice(pa, pb) + 0.25 * dice(shape(pa), shape(pb)) + 0.1 * lengthMatch + 0.1 * firstWord
}

/**
 * Charge written inside a formula: \ce{SO4^2-} → −2, \ce{Na+} → +1, Fe³⁺ → +3.
 * Used to notice columns whose answer is printed in the question itself ("charge of SO₄²⁻?").
 */
export function chargeOf(s: string): number | undefined {
  const raw = s.replace(/\$/g, '').trim()
  const sign = (c: string, n: number) => (c === '+' || c === '⁺' ? n : -n)
  // \ce{SO4^2-}, \ce{Fe^{3+}}, X^{2-}
  let m = raw.match(/\^\{?(\d*)([+\-−])\}?\}?$/)
  if (m) return sign(m[2], m[1] ? Number(m[1]) : 1)
  // Fe³⁺, F⁻
  m = raw.match(/([⁰¹²³⁴⁵⁶⁷⁸⁹]*)([⁺⁻])$/)
  if (m) return sign(m[2], m[1] ? Number([...m[1]].map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).join('')) : 1)
  // \ce{Na+}, \ce{OH-}
  m = raw.match(/\\ce\{[^{}]*[A-Za-z0-9)\]]([+-])\}$/)
  if (m) return sign(m[1], 1)
  return undefined
}
