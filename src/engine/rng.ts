/** Small seeded PRNG (mulberry32), so a practice session can be reproduced in tests. */
export type Rng = () => number

export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0
}

export function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function sample<T>(list: readonly T[], n: number, rng: Rng): T[] {
  return shuffle(list, rng).slice(0, Math.max(0, n))
}

export function pick<T>(list: readonly T[], rng: Rng): T {
  return list[Math.floor(rng() * list.length)]
}
