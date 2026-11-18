// Drag the four corners of the page in a photo; the page is then straightened (perspective).

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { photoPreview } from './photo'
import { Button, Sheet } from './kit'

export const FULL: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]

export function CornerEditor({ open, file, turns, corners, onClose, onSave }: { open: boolean; file?: Blob; turns: number; corners?: [number, number][]; onClose: () => void; onSave: (c?: [number, number][]) => void }) {
  const [url, setUrl] = useState<string>()
  const [pts, setPts] = useState<[number, number][]>(corners ?? FULL)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || !file) return
    let alive = true
    let u: string | undefined
    setPts(corners ?? [
      [0.04, 0.04],
      [0.96, 0.04],
      [0.96, 0.96],
      [0.04, 0.96],
    ])
    photoPreview(file, turns, 1000).then((p) => {
      u = p.url
      if (alive) setUrl(p.url)
    })
    return () => {
      alive = false
      if (u) URL.revokeObjectURL(u)
      setUrl(undefined)
    }
  }, [open, file, turns])
  const move = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !box.current) return
    const r = box.current.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    setPts((p) => p.map((q, k) => (k === i ? [x, y] : q)))
  }
  const isFull = pts.every((p, i) => Math.abs(p[0] - FULL[i][0]) < 0.01 && Math.abs(p[1] - FULL[i][1]) < 0.01)
  return (
    <Sheet open={open} onClose={onClose} title="Page corners" wide>
      <p className="muted small">Drag the four dots onto the corners of the page. The photo is straightened to them.</p>
      <div className="corner-box" ref={box}>
        {url ? <img src={url} alt="Photo of the page" draggable={false} /> : <div className="media media-loading" />}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <polygon points={pts.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')} />
        </svg>
        {pts.map(([x, y], i) => (
          <button
            key={i}
            type="button"
            className="corner-handle"
            aria-label={['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'][i] + ' corner'}
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
            onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
            onPointerMove={move(i)}
            onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
          />
        ))}
      </div>
      <div className="row gap wrap">
        <Button variant="primary" onClick={() => onSave(isFull ? undefined : pts)}>
          Use these corners
        </Button>
        <Button variant="ghost" onClick={() => onSave(undefined)}>
          No straightening
        </Button>
      </div>
    </Sheet>
  )
}
