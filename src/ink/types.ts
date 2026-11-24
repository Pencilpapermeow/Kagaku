// Handwritten point cards ("ink"). He writes them on the iPad with a capacitive stylus
// (Amazon Basics, which the browser sees as a finger) or with a finger on the phone.
//
// Strokes are stored as vectors in page units, not as pictures: a card is always
// INK_WIDTH units wide, so it looks the same on the phone, iPad portrait and landscape,
// stays sharp at any size, and a whole chapter of cards is only a few hundred KB.

export const INK_WIDTH = 1000
/** A new card starts this tall (about a third of an iPad screen in landscape). */
export const INK_START_HEIGHT = 420
/** "More space" and writing near the bottom add this much. */
export const INK_GROW = 320
/** iOS refuses very tall drawing surfaces; a card this tall is already several screens. */
export const INK_MAX_HEIGHT = 6000

/** Theme-aware colour names: "ink" is black on light paper and white on dark paper. */
export const INK_COLORS = ['ink', 'blue', 'red', 'green', 'purple', 'orange'] as const
export type InkColor = (typeof INK_COLORS)[number]

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'pink', 'blue'] as const
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]

export const PEN_WIDTHS = [2.5, 4, 7] as const
export const HIGHLIGHT_WIDTH = 26

export interface InkStroke {
  /** 'pen' (default) or 'hl' (highlighter: wide, see-through, drawn under the pen strokes). */
  k?: 'hl'
  c: InkColor | HighlightColor
  w: number
  /** Flat list of points: x0, y0, x1, y1, … in page units, one decimal. */
  p: number[]
}

export type InkPaper = 'blank' | 'lines' | 'grid'

export interface InkNoteRow {
  id: string
  chapter: string
  /** Optional typed title; shown while self-test hides the card. */
  title?: string
  height: number
  paper: InkPaper
  strokes: InkStroke[]
  createdAt: number
  updatedAt: number
}

export function newInkId(): string {
  return `ink${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export function newInkNote(chapter: string, paper: InkPaper = 'lines'): InkNoteRow {
  const now = Date.now()
  return { id: newInkId(), chapter, height: INK_START_HEIGHT, paper, strokes: [], createdAt: now, updatedAt: now }
}
