import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PenLine, Trash2 } from 'lucide-react'
import { contentBottom } from './geometry'
import { InkView } from './InkView'
import { deleteInkNote } from './store'
import type { InkNoteRow } from './types'

/** Lists show the written part only (plus a margin), not the empty rest of the card. */
export function shownHeight(row: Pick<InkNoteRow, 'strokes' | 'height'>): number {
  return Math.min(row.height, Math.max(150, Math.ceil(contentBottom(row.strokes) + 36)))
}

export function InkCard({ row, n, hide, showChapter }: { row: InkNoteRow; n?: number; hide?: boolean; showChapter?: string }) {
  const nav = useNavigate()
  const [shown, setShown] = useState(false)
  const covered = hide && !shown
  const label = row.title?.trim() || (n ? `Point ${n}` : 'Handwritten point')
  return (
    <article className="card ink-card">
      <header className="ink-card-head">
        {n !== undefined && <span className="ink-no">{n}</span>}
        <b>{row.title?.trim() || <span className="muted">{showChapter ?? 'Untitled'}</span>}</b>
        <button type="button" className="icon-btn" aria-label={`Edit ${label}`} onClick={() => nav(`/ink/${row.id}`)}>
          <PenLine size={17} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Delete ${label}`}
          onClick={async () => {
            if (window.confirm('Delete this handwritten card?')) await deleteInkNote(row.id)
          }}
        >
          <Trash2 size={16} />
        </button>
      </header>
      <button type="button" className="ink-body" aria-label={covered ? `Reveal ${label}` : `Open ${label}`} onClick={() => (hide ? setShown(!shown) : nav(`/ink/${row.id}`))}>
        <InkView strokes={row.strokes} paper={row.paper} height={shownHeight(row)} label={label} />
        {covered && <span className="ink-cover">{row.title?.trim() ? 'Recall it, then tap to check' : 'Tap to reveal'}</span>}
      </button>
    </article>
  )
}
