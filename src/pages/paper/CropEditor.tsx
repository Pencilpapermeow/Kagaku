// Fixing where a question is on the page: drag the edges of its box(es), draw a new box
// (a missed question, or a part on the next column), remove a part, or split it in two.

import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { ChevronLeft, ChevronRight, Scissors, SquarePlus, Trash2 } from 'lucide-react'
import { useMediaUrl } from '../../ui/content'
import { Button, Sheet, cx } from '../../ui/kit'
import type { Box, Piece, UserPaperRow } from '../../paper/types'

type Edge = 'top' | 'bottom' | 'left' | 'right'

export interface CropEditorProps {
  paper: UserPaperRow
  title: string
  initial: Piece[]
  startPage?: number
  onClose: () => void
  onSave: (pieces: Piece[]) => void
  /** Split: everything below `y` on piece `index` (and later pieces) becomes a new question. */
  onSplit?: (pieces: Piece[], index: number, y: number) => void
}

export function CropEditor({ paper, title, initial, startPage, onClose, onSave, onSplit }: CropEditorProps) {
  const pages = useMemo(() => paper.pages.map((p, i) => ({ p, i })).filter((x) => x.p.role === 'paper'), [paper.pages])
  const [pieces, setPieces] = useState<Piece[]>(initial)
  const [page, setPage] = useState(startPage ?? initial[0]?.page ?? pages[0]?.i ?? 0)
  const [sel, setSel] = useState(initial.findIndex((x) => x.page === (startPage ?? initial[0]?.page)))
  const [mode, setMode] = useState<'edit' | 'draw' | 'split'>(initial.length ? 'edit' : 'draw')
  const [draft, setDraft] = useState<Box>()
  const start = useRef<{ x: number; y: number }>(undefined)
  const area = useRef<HTMLDivElement>(null)
  const pg = paper.pages[page]
  const url = useMediaUrl(pg?.image)
  const at = pages.findIndex((x) => x.i === page)

  const toImg = (e: PointerEvent) => {
    const r = area.current!.getBoundingClientRect()
    return { x: Math.min(pg.width, Math.max(0, ((e.clientX - r.left) / r.width) * pg.width)), y: Math.min(pg.height, Math.max(0, ((e.clientY - r.top) / r.height) * pg.height)) }
  }
  const norm = (a: { x: number; y: number }, b: { x: number; y: number }): Box => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) })

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (mode === 'draw') {
      e.currentTarget.setPointerCapture(e.pointerId)
      start.current = toImg(e)
      setDraft(norm(start.current, start.current))
    } else if (mode === 'split' && sel >= 0 && onSplit) {
      const y = toImg(e).y
      const b = pieces[sel].box
      if (y > b.y0 + 10 && y < b.y1 - 10) onSplit(pieces, sel, y)
    }
  }
  const moveDraw = (e: PointerEvent<HTMLDivElement>) => {
    if (mode === 'draw' && start.current && e.currentTarget.hasPointerCapture(e.pointerId)) setDraft(norm(start.current, toImg(e)))
  }
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (mode !== 'draw' || !start.current || !draft) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    start.current = undefined
    if (draft.x1 - draft.x0 > 20 && draft.y1 - draft.y0 > 20) {
      setPieces((ps) => [...ps, { page, box: draft }])
      setSel(pieces.length)
      setMode('edit')
    }
    setDraft(undefined)
  }
  const dragEdge = (i: number, edge: Edge) => ({
    onPointerDown: (e: PointerEvent<HTMLSpanElement>) => {
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: PointerEvent<HTMLSpanElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
      const pt = toImg(e)
      setPieces((ps) =>
        ps.map((p, k) => {
          if (k !== i) return p
          const b = { ...p.box }
          if (edge === 'top') b.y0 = Math.min(pt.y, b.y1 - 20)
          if (edge === 'bottom') b.y1 = Math.max(pt.y, b.y0 + 20)
          if (edge === 'left') b.x0 = Math.min(pt.x, b.x1 - 20)
          if (edge === 'right') b.x1 = Math.max(pt.x, b.x0 + 20)
          return { ...p, box: b }
        }),
      )
    },
    onPointerUp: (e: PointerEvent<HTMLSpanElement>) => e.currentTarget.releasePointerCapture(e.pointerId),
  })
  const pct = (b: Box) => ({ left: `${(b.x0 / pg.width) * 100}%`, top: `${(b.y0 / pg.height) * 100}%`, width: `${((b.x1 - b.x0) / pg.width) * 100}%`, height: `${((b.y1 - b.y0) / pg.height) * 100}%` })
  const goPage = (d: number) => {
    const next = pages[at + d]
    if (!next) return
    setPage(next.i)
    setSel(pieces.findIndex((x) => x.page === next.i))
  }

  return (
    <Sheet open onClose={onClose} title={title} wide>
      <div className="crop-tools">
        <div className="row gap">
          <button type="button" className="icon-btn" aria-label="Previous page" disabled={at <= 0} onClick={() => goPage(-1)}>
            <ChevronLeft size={20} />
          </button>
          <span className="small">
            Page {at + 1} / {pages.length}
          </span>
          <button type="button" className="icon-btn" aria-label="Next page" disabled={at >= pages.length - 1} onClick={() => goPage(1)}>
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="row gap wrap">
          <Button size="sm" variant={mode === 'draw' ? 'primary' : 'soft'} icon={<SquarePlus size={16} />} onClick={() => setMode(mode === 'draw' ? 'edit' : 'draw')}>
            Draw a box
          </Button>
          {sel >= 0 && (
            <Button
              size="sm"
              icon={<Trash2 size={16} />}
              onClick={() => {
                setPieces((ps) => ps.filter((_, k) => k !== sel))
                setSel(-1)
              }}
            >
              Remove box
            </Button>
          )}
          {onSplit && sel >= 0 && (
            <Button size="sm" variant={mode === 'split' ? 'primary' : 'soft'} icon={<Scissors size={16} />} onClick={() => setMode(mode === 'split' ? 'edit' : 'split')}>
              Split
            </Button>
          )}
        </div>
      </div>
      <p className="muted small crop-hint">
        {mode === 'draw' ? 'Drag on the page to draw a box around the question (or the part of it on this page).' : mode === 'split' ? 'Tap where the second question starts.' : 'Drag the edges of the box. Boxes are joined top to bottom in their number order.'}
      </p>
      <div className={cx('crop-area', `crop-${mode}`)} ref={area} onPointerDown={down} onPointerMove={moveDraw} onPointerUp={up}>
        {url ? <img src={url} alt={`Page ${at + 1}`} draggable={false} /> : <div className="media media-loading" />}
        {pg &&
          pieces.map((p, i) =>
            p.page === page ? (
              <div
                key={i}
                className={cx('crop-rect', i === sel && 'sel')}
                style={pct(p.box)}
                onPointerDown={(e) => {
                  if (mode === 'edit') {
                    e.stopPropagation()
                    setSel(i)
                  }
                }}
              >
                <span className="crop-n">{i + 1}</span>
                {i === sel && mode === 'edit' && (['top', 'bottom', 'left', 'right'] as Edge[]).map((edge) => <span key={edge} className={`crop-h crop-h-${edge}`} aria-label={`Move ${edge} edge`} {...dragEdge(i, edge)} />)}
              </div>
            ) : null,
          )}
        {draft && pg && <div className="crop-rect draft" style={pct(draft)} />}
      </div>
      <div className="row gap wrap crop-foot">
        <Button variant="primary" onClick={() => onSave(pieces)} disabled={!pieces.length}>
          Save
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <span className="muted small">
          {pieces.length} box{pieces.length === 1 ? '' : 'es'}
          {pieces.some((p) => p.page !== page) ? ' (some on other pages)' : ''}
        </span>
      </div>
    </Sheet>
  )
}
