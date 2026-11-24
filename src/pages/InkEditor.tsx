// Full-screen handwriting pad for one point card.
//
// Input: his Amazon Basics stylus is capacitive, so the browser sees it as a finger
// (pointerType "touch", no pressure, no palm rejection from the system). So:
//  - one finger / stylus writes; two fingers scroll (the stroke the first one began is dropped);
//  - the "hand" tool scrolls with one finger;
//  - the palm guard is a strip at the bottom of the screen that swallows every touch
//    (auto: on for iPad-size screens; he can switch it on/off and drag its height);
//  - very large contacts (when the browser reports their size) are ignored as a palm.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, Eraser, Hand, Highlighter, MoreHorizontal, PenLine, Plus, Redo2, Trash2, Undo2 } from 'lucide-react'
import { db } from '../db/db'
import { setSetting, useSettings } from '../db/settings'
import { addPoint, hitsStroke, strokeBounds, strokePath } from '../ink/geometry'
import { PaperBackground, StrokeLayers, strokeClass } from '../ink/InkView'
import { deleteInkNote, isEmptyInk, saveInkNote } from '../ink/store'
import {
  HIGHLIGHT_COLORS,
  HIGHLIGHT_WIDTH,
  INK_COLORS,
  INK_GROW,
  INK_MAX_HEIGHT,
  INK_WIDTH,
  PEN_WIDTHS,
  type HighlightColor,
  type InkColor,
  type InkNoteRow,
  type InkPaper,
  type InkStroke,
} from '../ink/types'
import { Button, Chip, Sheet, cx, toast } from '../ui/kit'

type Tool = 'pen' | 'hl' | 'eraser' | 'hand'
type Snapshot = Pick<InkNoteRow, 'strokes' | 'height'>

const ERASER_R = 16
/** Writing this close to the bottom of the card adds more space. */
const GROW_MARGIN = 80
/** Contacts wider than this (CSS px) are a palm, when the browser reports contact size. */
const PALM_PX = 44
/** Two fingers that land within this time are a scroll; a touch arriving later mid-stroke is a palm. */
const TWO_FINGER_MS = 300

export function InkEditorPage() {
  const { id = '' } = useParams()
  const row = useLiveQuery(() => db.ink.get(id).then((r) => r ?? null), [id])
  const nav = useNavigate()
  if (row === undefined) return null
  if (row === null)
    return (
      <div className="ink-missing">
        <p>This card no longer exists.</p>
        <Button variant="primary" onClick={() => nav(-1)}>
          Go back
        </Button>
      </div>
    )
  return <InkPad key={row.id} initial={row} />
}

function bigScreen(): boolean {
  return Math.min(window.screen.width, window.screen.height) >= 700 && navigator.maxTouchPoints > 0
}

function InkPad({ initial }: { initial: InkNoteRow }) {
  const nav = useNavigate()
  const settings = useSettings()
  const [note, setNote] = useState(initial)
  const noteRef = useRef(note)
  noteRef.current = note
  const dirty = useRef(false)

  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState<InkColor>()
  const [width, setWidth] = useState<number>()
  const [hlColor, setHlColor] = useState<HighlightColor>('yellow')
  const penColor = color ?? (INK_COLORS.includes(settings.inkColor as InkColor) ? (settings.inkColor as InkColor) : 'ink')
  const penWidth = width ?? settings.inkWidth
  const guardOn = settings.inkPalmGuard === 'on' || (settings.inkPalmGuard === 'auto' && bigScreen())
  const [guardH, setGuardH] = useState<number>()
  const guardFrac = guardH ?? settings.inkPalmHeight
  const [menu, setMenu] = useState(false)

  const undoStack = useRef<Snapshot[]>([])
  const redoStack = useRef<Snapshot[]>([])
  const [, setHistoryTick] = useState(0)
  const bump = () => setHistoryTick((t) => t + 1)

  const pageRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const liveRef = useRef<SVGPathElement>(null)
  const clearLive = useRef(false)

  // ---- saving -------------------------------------------------------------------------
  const flush = useCallback(async () => {
    if (!dirty.current) return
    dirty.current = false
    await saveInkNote(noteRef.current)
  }, [])

  useEffect(() => {
    if (!dirty.current) return
    const t = setTimeout(flush, 500)
    return () => clearTimeout(t)
  }, [note, flush])

  useEffect(() => {
    const away = () => void flush()
    const onVis = () => document.visibilityState === 'hidden' && away()
    window.addEventListener('pagehide', away)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('pagehide', away)
      document.removeEventListener('visibilitychange', onVis)
      void flush()
    }
  }, [flush])

  const change = (next: Partial<InkNoteRow>, undoable = true) => {
    if (undoable) {
      undoStack.current.push({ strokes: noteRef.current.strokes, height: noteRef.current.height })
      if (undoStack.current.length > 200) undoStack.current.shift()
      redoStack.current = []
      bump()
    }
    dirty.current = true
    setNote((n) => {
      const out = { ...n, ...next }
      noteRef.current = out
      return out
    })
  }

  const close = async () => {
    await flush()
    const cur = noteRef.current
    if (isEmptyInk(cur)) await deleteInkNote(cur.id)
    nav(`/c/${encodeURIComponent(cur.chapter)}?tab=notes`, { replace: true })
  }

  const undo = () => {
    const s = undoStack.current.pop()
    if (!s) return
    redoStack.current.push({ strokes: noteRef.current.strokes, height: noteRef.current.height })
    change(s, false)
    bump()
  }
  const redo = () => {
    const s = redoStack.current.pop()
    if (!s) return
    undoStack.current.push({ strokes: noteRef.current.strokes, height: noteRef.current.height })
    change(s, false)
    bump()
  }

  // The live stroke is cleared only after React has drawn the committed one (no flicker).
  useLayoutEffect(() => {
    if (clearLive.current && liveRef.current) {
      liveRef.current.setAttribute('d', '')
      clearLive.current = false
    }
  }, [note.strokes])

  // ---- input --------------------------------------------------------------------------
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const drawing = useRef<{ id: number; stroke: InkStroke } | null>(null)
  const erasing = useRef<{ id: number; removed: boolean } | null>(null)
  const pan = useRef<{ y: number } | null>(null)
  const firstDownAt = useRef(0)

  const toPage = (clientX: number, clientY: number): [number, number] => {
    const r = pageRef.current!.getBoundingClientRect()
    const k = INK_WIDTH / r.width
    return [(clientX - r.left) * k, (clientY - r.top) * k]
  }
  const midY = () => {
    const ys = [...pointers.current.values()].map((p) => p.y)
    return ys.reduce((a, b) => a + b, 0) / ys.length
  }
  const dropLive = () => {
    drawing.current = null
    liveRef.current?.setAttribute('d', '')
  }
  const eraseAt = (clientX: number, clientY: number) => {
    const [x, y] = toPage(clientX, clientY)
    const cur = noteRef.current.strokes
    const keep = cur.filter((s) => !hitsStroke(s, x, y, ERASER_R))
    if (keep.length === cur.length) return
    const first = !erasing.current!.removed
    erasing.current!.removed = true
    change({ strokes: keep }, first)
  }

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (tool === 'hand') return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (e.pointerType === 'touch' && Math.max(e.width || 0, e.height || 0) > PALM_PX) return
    if (pointers.current.size >= 1) {
      // A second touch. Together with the first (two fingers) it scrolls, and the stroke the
      // first finger began was only the start of that gesture. Arriving later, it is a palm.
      if (!pan.current && e.timeStamp - firstDownAt.current > TWO_FINGER_MS) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      dropLive()
      erasing.current = null
      pan.current = { y: midY() }
      return
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    firstDownAt.current = e.timeStamp
    e.currentTarget.setPointerCapture?.(e.pointerId)
    if (tool === 'eraser') {
      erasing.current = { id: e.pointerId, removed: false }
      eraseAt(e.clientX, e.clientY)
      return
    }
    const [x, y] = toPage(e.clientX, e.clientY)
    const stroke: InkStroke = tool === 'hl' ? { k: 'hl', c: hlColor, w: HIGHLIGHT_WIDTH, p: [] } : { c: penColor, w: penWidth, p: [] }
    addPoint(stroke.p, x, y)
    drawing.current = { id: e.pointerId, stroke }
    const live = liveRef.current
    if (live) {
      live.setAttribute('class', strokeClass(stroke))
      live.setAttribute('stroke-width', String(stroke.w))
      live.setAttribute('d', strokePath(stroke.p))
    }
  }

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pan.current) {
      const m = midY()
      if (scrollRef.current) scrollRef.current.scrollTop -= m - pan.current.y
      pan.current.y = m
      return
    }
    if (erasing.current?.id === e.pointerId) {
      eraseAt(e.clientX, e.clientY)
      return
    }
    const d = drawing.current
    if (!d || d.id !== e.pointerId) return
    const native = e.nativeEvent as PointerEvent
    const events = native.getCoalescedEvents?.().length ? native.getCoalescedEvents() : [native]
    let added = false
    for (const ev of events) {
      const [x, y] = toPage(ev.clientX, ev.clientY)
      added = addPoint(d.stroke.p, x, y) || added
    }
    if (added) liveRef.current?.setAttribute('d', strokePath(d.stroke.p))
  }

  const onUp = (e: RPointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!pointers.current.delete(e.pointerId)) return
    if (pan.current) {
      if (pointers.current.size < 2) pan.current = null
      return
    }
    if (erasing.current?.id === e.pointerId) erasing.current = null
    const d = drawing.current
    if (!d || d.id !== e.pointerId) return
    drawing.current = null
    if (cancelled) {
      liveRef.current?.setAttribute('d', '')
      return
    }
    const cur = noteRef.current
    const bottom = strokeBounds(d.stroke).y1
    const height = bottom > cur.height - GROW_MARGIN ? Math.min(INK_MAX_HEIGHT, cur.height + INK_GROW) : cur.height
    clearLive.current = true
    change({ strokes: [...cur.strokes, d.stroke], height })
  }

  // ---- palm guard resize ----------------------------------------------------------------
  const startResize = (e: RPointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const move = (ev: PointerEvent) => setGuardH(Math.min(0.6, Math.max(0.1, (window.innerHeight - ev.clientY) / window.innerHeight)))
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setGuardH((h) => {
        if (h !== undefined) void setSetting('inkPalmHeight', Math.round(h * 100) / 100)
        return h
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const pickColor = (c: InkColor) => {
    setColor(c)
    setTool('pen')
    void setSetting('inkColor', c)
  }
  const pickWidth = (w: number) => {
    setWidth(w)
    setTool('pen')
    void setSetting('inkWidth', w)
  }
  const setPaper = (paper: InkPaper) => change({ paper }, false)
  const moreSpace = () => {
    if (note.height >= INK_MAX_HEIGHT) return toast('This card is as long as a card can be. Start a new card.')
    change({ height: Math.min(INK_MAX_HEIGHT, note.height + INK_GROW) })
    requestAnimationFrame(() => scrollRef.current?.scrollBy({ top: 240, behavior: 'smooth' }))
  }

  return (
    <div className="ink-screen" style={{ ['--guard-h' as string]: guardOn ? `${guardFrac * 100}vh` : '0px' }}>
      <header className="ink-top">
        <button type="button" className="icon-btn" aria-label="Done" onClick={close}>
          <ChevronLeft size={22} />
        </button>
        <input
          className="ink-title"
          value={note.title ?? ''}
          maxLength={120}
          placeholder="Title (optional)"
          aria-label="Card title"
          onChange={(e) => change({ title: e.target.value || undefined }, false)}
        />
        <button type="button" className="icon-btn" aria-label="Undo" onClick={undo} disabled={!undoStack.current.length}>
          <Undo2 size={20} />
        </button>
        <button type="button" className="icon-btn" aria-label="Redo" onClick={redo} disabled={!redoStack.current.length}>
          <Redo2 size={20} />
        </button>
        <button type="button" className="icon-btn" aria-label="Card options" onClick={() => setMenu(true)}>
          <MoreHorizontal size={20} />
        </button>
      </header>

      <div className="ink-tools" role="toolbar" aria-label="Writing tools">
        <ToolBtn on={tool === 'pen'} label="Pen" onClick={() => setTool('pen')}>
          <PenLine size={19} />
        </ToolBtn>
        <ToolBtn on={tool === 'hl'} label="Highlighter" onClick={() => setTool('hl')}>
          <Highlighter size={19} />
        </ToolBtn>
        <ToolBtn on={tool === 'eraser'} label="Eraser" onClick={() => setTool('eraser')}>
          <Eraser size={19} />
        </ToolBtn>
        <ToolBtn on={tool === 'hand'} label="Scroll with one finger" onClick={() => setTool('hand')}>
          <Hand size={19} />
        </ToolBtn>
        <span className="ink-sep" />
        {tool === 'hl'
          ? HIGHLIGHT_COLORS.map((c) => (
              <button key={c} type="button" className={cx('ink-swatch', `ink-sw-hl-${c}`, hlColor === c && 'on')} aria-label={`Highlighter ${c}`} aria-pressed={hlColor === c} onClick={() => setHlColor(c)} />
            ))
          : INK_COLORS.map((c) => (
              <button key={c} type="button" className={cx('ink-swatch', `ink-sw-${c}`, tool === 'pen' && penColor === c && 'on')} aria-label={`Pen ${c === 'ink' ? 'black' : c}`} aria-pressed={penColor === c} onClick={() => pickColor(c)} />
            ))}
        {tool !== 'hl' && (
          <>
            <span className="ink-sep" />
            {PEN_WIDTHS.map((w) => (
              <button key={w} type="button" className={cx('ink-width', tool === 'pen' && penWidth === w && 'on')} aria-label={`Pen width ${w}`} aria-pressed={penWidth === w} onClick={() => pickWidth(w)}>
                <span style={{ width: 4 + w * 2, height: 4 + w * 2 }} />
              </button>
            ))}
          </>
        )}
        <span className="ink-sep" />
        <button
          type="button"
          className={cx('ink-guard-btn', guardOn && 'on')}
          aria-pressed={guardOn}
          onClick={() => setSetting('inkPalmGuard', guardOn ? 'off' : 'on')}
        >
          Palm guard {guardOn ? 'on' : 'off'}
        </button>
      </div>

      <div className={cx('ink-scroll', tool === 'hand' && 'hand')} ref={scrollRef}>
        <div
          ref={pageRef}
          className={cx('ink-page', `tool-${tool}`)}
          style={{ aspectRatio: `${INK_WIDTH} / ${note.height}` }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={(e) => onUp(e)}
          onPointerCancel={(e) => onUp(e, true)}
          onLostPointerCapture={(e) => onUp(e, true)}
          data-testid="ink-page"
        >
          <svg className="ink-svg" viewBox={`0 0 ${INK_WIDTH} ${note.height}`} preserveAspectRatio="none">
            <PaperBackground paper={note.paper} height={note.height} id="ink-pad-paper" />
            <StrokeLayers strokes={note.strokes} />
            <path ref={liveRef} className="ink-pen" d="" />
          </svg>
        </div>
        <div className="ink-foot">
          <Button icon={<Plus size={18} />} onClick={moreSpace}>
            More space
          </Button>
          <span className="muted small">Two fingers scroll · {note.strokes.length} strokes</span>
        </div>
      </div>

      {guardOn && (
        <div className="palm-guard" onPointerDown={(e) => e.preventDefault()} aria-label="Palm guard: touches here are ignored">
          <div className="palm-handle" onPointerDown={startResize} role="separator" aria-label="Drag to resize the palm guard" />
          <span>Rest your palm here</span>
        </div>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title="Card">
        <h3 className="section-title small">Paper</h3>
        <div className="chip-row wrap">
          {(['blank', 'lines', 'grid'] as InkPaper[]).map((p) => (
            <Chip key={p} active={note.paper === p} onClick={() => setPaper(p)}>
              {p === 'blank' ? 'Plain' : p === 'lines' ? 'Ruled' : 'Squares'}
            </Chip>
          ))}
        </div>
        <div className="row gap wrap" style={{ marginTop: 16 }}>
          <Button
            disabled={!note.strokes.length}
            onClick={() => {
              change({ strokes: [] })
              setMenu(false)
              toast('Cleared — Undo brings it back')
            }}
          >
            Clear writing
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 size={18} />}
            onClick={async () => {
              if (!window.confirm('Delete this card?')) return
              dirty.current = false
              await deleteInkNote(note.id)
              nav(`/c/${encodeURIComponent(note.chapter)}?tab=notes`, { replace: true })
            }}
          >
            Delete card
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

function ToolBtn({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={cx('ink-tool', on && 'on')} aria-label={label} aria-pressed={on} title={label} onClick={onClick}>
      {children}
    </button>
  )
}
