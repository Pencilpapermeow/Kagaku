// Practice mode never shows a question exactly the same way twice, so the brain has to
// recall the idea instead of the option pattern:
//   1. option order is shuffled;
//   2. wrong options are drawn from a larger distractor pool when one exists;
//   3. sometimes the correct option is removed and "None of these" becomes correct
//      (and just as often "None of these" appears as a wrong option, so it gives nothing away).
// The only exception: his own "add a mistake from paper" photos, whose options are bare
// letters A–D pointing at the photo, keep their order.

import type { Option, Question } from '../content/schema'
import { shuffle, sample, type Rng } from './rng'

export const NOTA_ID = 'NOTA'
export const NOTA_TEXT = 'None of these'

export interface VariantOptions {
  noneOfTheseRate: number
}

/** Options that are only letters (no text, no image) refer to a photo and can't move. */
export function isLettersOnly(q: Question): boolean {
  return (q.format === 'single' || q.format === 'multiple') && q.options.every((o) => !o.text && !o.image)
}

export function presentQuestion(q: Question, rng: Rng, opts: VariantOptions): Question {
  if (q.format !== 'single' && q.format !== 'multiple') return q
  if (isLettersOnly(q)) return q

  if (q.format === 'multiple') return { ...q, options: shuffle(q.options, rng) }

  const correct = q.options.find((o) => o.id === q.answer)
  if (!correct) return q
  const wrongCount = q.options.length - 1
  let wrongPool: Option[] = q.options.filter((o) => o.id !== q.answer)
  if (q.distractors?.length) {
    const extra = q.distractors.map((d, i) => ({ id: `d${i + 1}`, ...d }))
    wrongPool = sample([...wrongPool, ...extra], wrongCount, rng)
  }

  const useNota = q.options.length >= 3 && rng() < opts.noneOfTheseRate
  if (!useNota) return { ...q, options: shuffle([correct, ...wrongPool], rng) }

  const nota: Option = { id: NOTA_ID, text: NOTA_TEXT }
  if (rng() < 0.5) {
    // NOTA is correct: the real answer is removed, only wrong options remain.
    return { ...q, options: [...shuffle(wrongPool, rng), nota], answer: NOTA_ID }
  }
  const others = shuffle(wrongPool, rng).slice(0, wrongCount - 1)
  return { ...q, options: [...shuffle([correct, ...others], rng), nota] }
}

export const LETTERS = 'ABCDEFGHIJKL'

/** Display label for the option at a position: options are always shown as A, B, C, D… */
export function labelAt(i: number): string {
  return LETTERS[i] ?? String(i + 1)
}
