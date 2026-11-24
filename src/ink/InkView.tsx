// Draws a handwritten card as SVG. Used read-only in lists and as the base layer of the pad.

import { memo, useId, type ReactNode } from 'react'
import { strokePath } from './geometry'
import { INK_WIDTH, type InkPaper, type InkStroke } from './types'

const pathCache = new WeakMap<InkStroke, string>()

export function pathOf(s: InkStroke): string {
  let d = pathCache.get(s)
  if (d === undefined) {
    d = strokePath(s.p)
    pathCache.set(s, d)
  }
  return d
}

export const LINE_GAP = 44

export function strokeClass(s: Pick<InkStroke, 'k' | 'c'>): string {
  return s.k === 'hl' ? `ink-hl ink-hl-${s.c}` : `ink-pen ink-c-${s.c}`
}

/** Ruled or squared paper. Units are page units, so the lines scale with the card. */
export function PaperBackground({ paper, height, id }: { paper: InkPaper; height: number; id: string }) {
  if (paper === 'blank') return null
  return (
    <>
      <defs>
        <pattern id={id} width={paper === 'grid' ? LINE_GAP / 2 : INK_WIDTH} height={paper === 'grid' ? LINE_GAP / 2 : LINE_GAP} patternUnits="userSpaceOnUse">
          {paper === 'grid' ? (
            <path d={`M${LINE_GAP / 2} 0V${LINE_GAP / 2}M0 ${LINE_GAP / 2}H${LINE_GAP / 2}`} className="ink-rule ink-rule-grid" />
          ) : (
            <path d={`M0 ${LINE_GAP - 0.5}H${INK_WIDTH}`} className="ink-rule" />
          )}
        </pattern>
      </defs>
      <rect x="0" y="0" width={INK_WIDTH} height={height} fill={`url(#${id})`} />
    </>
  )
}

export function StrokeLayers({ strokes }: { strokes: InkStroke[] }) {
  return (
    <>
      <g className="ink-layer-hl">
        {strokes.map((s, i) => (s.k === 'hl' ? <path key={i} d={pathOf(s)} className={strokeClass(s)} strokeWidth={s.w} /> : null))}
      </g>
      <g className="ink-layer-pen">
        {strokes.map((s, i) => (s.k !== 'hl' ? <path key={i} d={pathOf(s)} className={strokeClass(s)} strokeWidth={s.w} /> : null))}
      </g>
    </>
  )
}

/** Read-only card. `height` is the part of the card to show (lists trim the empty bottom). */
export const InkView = memo(function InkView({ strokes, paper, height, label, children }: { strokes: InkStroke[]; paper: InkPaper; height: number; label?: string; children?: ReactNode }) {
  const pid = `ink-paper-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <svg className="ink-svg" viewBox={`0 0 ${INK_WIDTH} ${height}`} preserveAspectRatio="xMidYMin meet" role="img" aria-label={label ?? 'Handwritten note'}>
      <PaperBackground paper={paper} height={height} id={pid} />
      <StrokeLayers strokes={strokes} />
      {children}
    </svg>
  )
})
