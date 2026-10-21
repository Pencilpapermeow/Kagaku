import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bookmark, CircleHelp, GraduationCap, ImagePlus, NotebookPen, Play, RotateCw, StickyNote, Sun, Trash2 } from 'lucide-react'
import { db, GALTI_REASONS, GALTI_REASON_LABEL, type GaltiReason, type GaltiRow, type QuestionRow } from '../db/db'
import { useChapters } from '../db/queries'
import { useSettings } from '../db/settings'
import { SUBJECTS, getSubject, subjectOf, type Chapter } from '../content/syllabus'
import type { Question } from '../content/schema'
import { sha256Hex } from '../content/hash'
import { setGaltiReason } from '../engine/progress'
import { plainText } from '../ui/rich'
import { MediaImage, Rich } from '../ui/content'
import { Bar, Button, Chip, Empty, Field, Sheet, Tabs, TopBar, cx, toast } from '../ui/kit'

type Tab = 'galti' | 'bookmarks' | 'notes' | 'doubtful'

export function NotebooksPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'galti'
  return (
    <div>
      <TopBar title="Notebooks" back={false} />
      <Tabs
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        items={[
          { id: 'galti', label: 'Galti' },
          { id: 'bookmarks', label: 'Bookmarks' },
          { id: 'notes', label: 'Notes' },
          { id: 'doubtful', label: 'Doubtful' },
        ]}
      />
      {tab === 'galti' && <GaltiList />}
      {tab === 'bookmarks' && <QuestionList kind="bookmarks" />}
      {tab === 'notes' && <AllNotes />}
      {tab === 'doubtful' && <QuestionList kind="doubtful" />}
    </div>
  )
}

function useQuestionMap(ids: string[], galti?: GaltiRow[]) {
  return useLiveQuery(async () => {
    const rows = await db.questions.bulkGet(ids)
    const m = new Map<string, Question>()
    ids.forEach((id, i) => {
      const q = rows[i] ?? galti?.find((g) => g.qid === id)?.snapshot
      if (q) m.set(id, q)
    })
    return m
  }, [ids.join('|')])
}

export function QuestionSnippet({ q }: { q?: Question }) {
  if (!q) return <span className="muted small">(question removed)</span>
  const text = plainText(q.stem || ('assertion' in q ? q.assertion : '')).slice(0, 140)
  return (
    <span className="snippet">
      {q.image && <MediaImage src={q.image} className="thumb" />}
      {text && <Rich as="span" text={text + (text.length >= 140 ? '…' : '')} />}
    </span>
  )
}

function mistakePatterns(rows: GaltiRow[], chapters: Chapter[], byChapter: boolean) {
  const unitName = (cid: string) => {
    const c = chapters.find((x) => x.id === cid)
    if (!c) return cid
    if (byChapter) return c.name
    return `${getSubject(c.subject).short} · ${getSubject(c.subject).units.find((u) => u.id === c.unit)?.name ?? c.unit}`
  }
  const groups = new Map<string, Record<GaltiReason | 'untagged', number>>()
  for (const r of rows) {
    const g = unitName(r.chapter)
    const rec = groups.get(g) ?? { concept: 0, calculation: 0, misread: 0, forgot: 0, untagged: 0 }
    rec[r.reason ?? 'untagged']++
    groups.set(g, rec)
  }
  const lines: string[] = []
  for (const [g, rec] of groups) {
    const total = Object.values(rec).reduce((a, b) => a + b, 0)
    const tagged = total - rec.untagged
    if (tagged < 2) continue
    const [top, n] = (Object.entries(rec) as [GaltiReason | 'untagged', number][]).filter(([k]) => k !== 'untagged').sort((a, b) => b[1] - a[1])[0]
    lines.push(`${Math.round((n / tagged) * 100)}% of ${g} mistakes are "${GALTI_REASON_LABEL[top as GaltiReason]}" (${n}/${tagged})`)
  }
  return lines
}

export function GaltiList({ chapter }: { chapter?: string }) {
  const nav = useNavigate()
  const settings = useSettings()
  const chapters = useChapters()
  const [status, setStatus] = useState<'active' | 'graduated'>('active')
  const [subject, setSubject] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [adding, setAdding] = useState(false)
  const all = useLiveQuery(() => (chapter ? db.galti.where('chapter').equals(chapter).toArray() : db.galti.toArray()), [chapter])
  const rows = useMemo(
    () =>
      (all ?? [])
        .filter((r) => r.status === status && (!subject || subjectOf(r.chapter) === subject) && (!reason || (r.reason ?? 'untagged') === reason))
        .sort((a, b) => b.lastAt - a.lastAt),
    [all, status, subject, reason],
  )
  const qmap = useQuestionMap(
    rows.map((r) => r.qid),
    rows,
  )
  const name = useMemo(() => new Map(chapters.map((c) => [c.id, c.name])), [chapters])
  const patterns = useMemo(() => mistakePatterns((all ?? []).filter((r) => r.status === 'active'), chapters, !!chapter), [all, chapters, chapter])
  const activeCount = (all ?? []).filter((r) => r.status === 'active').length

  return (
    <div className="galti">
      <div className="row between wrap gap">
        <div className="chip-row">
          <Chip active={status === 'active'} onClick={() => setStatus('active')}>
            Active · {activeCount}
          </Chip>
          <Chip active={status === 'graduated'} onClick={() => setStatus('graduated')}>
            <GraduationCap size={14} /> Graduated
          </Chip>
        </div>
        <div className="row gap">
          <Button size="sm" icon={<ImagePlus size={16} />} onClick={() => setAdding(true)}>
            Add a mistake
          </Button>
          <Button size="sm" variant="primary" icon={<Play size={16} />} disabled={!activeCount} onClick={() => nav(`/practice?m=mistakes${chapter ? `&c=${chapter}` : ''}`)}>
            Practise
          </Button>
        </div>
      </div>
      {!chapter && (
        <div className="chip-row">
          <Chip active={!subject} onClick={() => setSubject('')}>
            All subjects
          </Chip>
          {SUBJECTS.map((s) => (
            <Chip key={s.id} active={subject === s.id} onClick={() => setSubject(s.id)}>
              {s.short}
            </Chip>
          ))}
        </div>
      )}
      <div className="chip-row">
        <Chip active={!reason} onClick={() => setReason('')}>
          Any reason
        </Chip>
        {GALTI_REASONS.map((r) => (
          <Chip key={r} active={reason === r} onClick={() => setReason(r)}>
            {GALTI_REASON_LABEL[r]}
          </Chip>
        ))}
        <Chip active={reason === 'untagged'} onClick={() => setReason('untagged')}>
          Untagged
        </Chip>
      </div>
      {patterns.length > 0 && (
        <div className="card patterns">
          <b>Mistake patterns</b>
          <ul>
            {patterns.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {!rows.length ? (
        <Empty icon={<NotebookPen />} title={status === 'active' ? 'No mistakes here' : 'Nothing graduated yet'}>
          {status === 'active' ? 'Wrong answers from practice and tests land here automatically. You can also add a photo of a mistake from paper.' : `A question graduates after ${settings.graduateAfter} correct answers in a row.`}
        </Empty>
      ) : (
        <div className="galti-list">
          {rows.map((r) => (
            <div key={r.qid} className="card galti-row">
              <div className="galti-main">
                {!chapter && (
                  <Link to={`/c/${r.chapter}?tab=galti`} className="muted small">
                    {name.get(r.chapter) ?? r.chapter}
                  </Link>
                )}
                <QuestionSnippet q={qmap?.get(r.qid)} />
                {r.note && <Rich text={r.note} className="muted small" />}
                <div className="galti-meta">
                  <span className="small">
                    Wrong ×{r.wrongCount} · in a row {r.streak}/{settings.graduateAfter}
                  </span>
                  <Bar value={r.streak} max={settings.graduateAfter} color="var(--good)" />
                </div>
                <div className="chip-row wrap">
                  {GALTI_REASONS.map((x) => (
                    <Chip key={x} active={r.reason === x} onClick={() => setGaltiReason(r.qid, r.reason === x ? undefined : x)}>
                      {GALTI_REASON_LABEL[x]}
                    </Chip>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Remove from Galti"
                onClick={async () => {
                  if (window.confirm('Remove this from the Galti Notebook?')) await db.galti.delete(r.qid)
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <AddMistakeSheet open={adding} onClose={() => setAdding(false)} defaultChapter={chapter} />
    </div>
  )
}

function QuestionList({ kind }: { kind: 'bookmarks' | 'doubtful' }) {
  const nav = useNavigate()
  const chapters = useChapters()
  const name = useMemo(() => new Map(chapters.map((c) => [c.id, c.name])), [chapters])
  const ids = useLiveQuery(
    async () => (kind === 'bookmarks' ? (await db.bookmarks.orderBy('at').reverse().toArray()).map((b) => b.qid) : (await db.qmeta.where('keyStatus').equals('doubtful').toArray()).map((m) => m.qid)),
    [kind],
  )
  const qmap = useQuestionMap(ids ?? [])
  if (!ids) return null
  if (!ids.length)
    return kind === 'bookmarks' ? (
      <Empty icon={<Bookmark />} title="No bookmarks">
        Tap the bookmark icon during practice to keep a question here.
      </Empty>
    ) : (
      <Empty icon={<CircleHelp />} title="Nothing doubtful">
        When you verify a key and are still unsure, choose "Still doubtful" and it waits here.
      </Empty>
    )
  return (
    <div className="galti">
      <div className="row end">
        <Button size="sm" variant="primary" icon={<Play size={16} />} onClick={() => nav(`/practice?m=${kind}`)}>
          Practise these
        </Button>
      </div>
      <div className="galti-list">
        {ids.map((id) => {
          const q = qmap?.get(id)
          return (
            <div key={id} className="card galti-row">
              <div className="galti-main">
                {q && (
                  <Link to={`/c/${q.chapter}`} className="muted small">
                    {name.get(q.chapter)}
                  </Link>
                )}
                <QuestionSnippet q={q} />
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Remove"
                onClick={() => (kind === 'bookmarks' ? db.bookmarks.delete(id) : db.qmeta.update(id, { keyStatus: undefined }))}
              >
                <Trash2 size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AllNotes() {
  const chapters = useChapters()
  const name = useMemo(() => new Map(chapters.map((c) => [c.id, c.name])), [chapters])
  const notes = useLiveQuery(() => db.notes.orderBy('at').reverse().toArray(), [])
  if (!notes) return null
  if (!notes.length)
    return (
      <Empty icon={<StickyNote />} title="No notes yet">
        Add notes from any chapter's Notes tab.
      </Empty>
    )
  return (
    <div className="notes">
      {notes.map((n) => (
        <div key={n.id} className="card note">
          <Link to={`/c/${n.chapter}?tab=notes`} className="muted small">
            {name.get(n.chapter) ?? n.chapter}
          </Link>
          <Rich text={n.text} />
        </div>
      ))}
    </div>
  )
}

/** Rotate, brighten and shrink a photo in the browser before storing it. */
async function processPhoto(file: Blob, quarterTurns: number, bright: boolean): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const maxW = 1400
  const turned = quarterTurns % 2 === 1
  const srcW = turned ? bmp.height : bmp.width
  const scale = Math.min(1, maxW / srcW)
  const w = Math.round((turned ? bmp.height : bmp.width) * scale)
  const h = Math.round((turned ? bmp.width : bmp.height) * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  if (bright) ctx.filter = 'brightness(1.25) contrast(1.25) saturate(0.6)'
  ctx.translate(w / 2, h / 2)
  ctx.rotate((quarterTurns * Math.PI) / 2)
  const dw = bmp.width * scale
  const dh = bmp.height * scale
  ctx.drawImage(bmp, -dw / 2, -dh / 2, dw, dh)
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q))
  const webp = await toBlob('image/webp', 0.8)
  return webp && webp.type === 'image/webp' ? webp : ((await toBlob('image/jpeg', 0.82)) as Blob)
}

function AddMistakeSheet({ open, onClose, defaultChapter }: { open: boolean; onClose: () => void; defaultChapter?: string }) {
  const chapters = useChapters()
  const [chapter, setChapter] = useState(defaultChapter ?? '')
  const [file, setFile] = useState<Blob>()
  const [turns, setTurns] = useState(0)
  const [bright, setBright] = useState(true)
  const [preview, setPreview] = useState<string>()
  const [kind, setKind] = useState<'single' | 'multiple' | 'number'>('single')
  const [letters, setLetters] = useState<string[]>([])
  const [num, setNum] = useState('')
  const [reason, setReason] = useState<GaltiReason>()
  const [note, setNote] = useState('')

  const refresh = async (f = file, t = turns, b = bright) => {
    if (!f) return setPreview(undefined)
    const out = await processPhoto(f, t, b)
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(out)
    })
  }
  const ready = chapter && file && (kind === 'number' ? num.trim() !== '' && Number.isFinite(Number(num)) : letters.length > 0)

  const save = async () => {
    if (!ready || !file) return
    const blob = await processPhoto(file, turns, bright)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const hash = await sha256Hex(bytes as BufferSource)
    await db.media.put({ hash, blob, type: blob.type, bytes: bytes.byteLength, packs: ['user'] })
    const id = `u_${Date.now().toString(36)}`
    const base = { id, chapter, stem: '', image: `media:${hash}`, verified: 'checked' as const, tags: ['manual'], packId: 'user', origin: 'user' as const }
    const opts = ['A', 'B', 'C', 'D'].map((x) => ({ id: x }))
    const q: QuestionRow =
      kind === 'number'
        ? { ...base, format: Number.isInteger(Number(num)) ? 'integer' : 'numerical', answer: Number(num) }
        : kind === 'single'
          ? { ...base, format: 'single', options: opts, optionsInImage: true, answer: letters[0] }
          : { ...base, format: 'multiple', options: opts, optionsInImage: true, answer: letters }
    await db.questions.put(q)
    const now = Date.now()
    await db.galti.put({ qid: id, chapter, addedAt: now, lastAt: now, origin: 'manual', reason, streak: 0, wrongCount: 1, status: 'active', note: note.trim() || undefined })
    toast('Added to the Galti Notebook')
    setFile(undefined)
    setPreview(undefined)
    setLetters([])
    setNum('')
    setNote('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add a mistake from paper">
      <div className="add-mistake">
        <Field label="Chapter">
          <select value={chapter} onChange={(e) => setChapter(e.target.value)}>
            <option value="">Choose…</option>
            {SUBJECTS.map((s) => (
              <optgroup key={s.id} label={s.name}>
                {chapters
                  .filter((c) => c.subject === s.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Photo of the question">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0]
              setFile(f)
              setTurns(0)
              refresh(f, 0, bright)
            }}
          />
        </Field>
        {preview && (
          <div className="photo-edit">
            <img src={preview} alt="Preview" />
            <div className="row gap">
              <Button
                size="sm"
                icon={<RotateCw size={16} />}
                onClick={() => {
                  const t = (turns + 1) % 4
                  setTurns(t)
                  refresh(file, t, bright)
                }}
              >
                Rotate
              </Button>
              <Button
                size="sm"
                variant={bright ? 'primary' : 'soft'}
                icon={<Sun size={16} />}
                onClick={() => {
                  setBright(!bright)
                  refresh(file, turns, !bright)
                }}
              >
                Brighten
              </Button>
            </div>
          </div>
        )}
        <Field label="Correct answer">
          <div className="chip-row">
            <Chip active={kind === 'single'} onClick={() => (setKind('single'), setLetters(letters.slice(0, 1)))}>
              One option
            </Chip>
            <Chip active={kind === 'multiple'} onClick={() => setKind('multiple')}>
              Several options
            </Chip>
            <Chip active={kind === 'number'} onClick={() => setKind('number')}>
              A number
            </Chip>
          </div>
        </Field>
        {kind === 'number' ? (
          <input inputMode="decimal" placeholder="e.g. 3 or 0.25" value={num} onChange={(e) => setNum(e.target.value.replace(/[^0-9.-]/g, ''))} />
        ) : (
          <div className="chip-row">
            {['A', 'B', 'C', 'D'].map((x) => (
              <button
                key={x}
                type="button"
                className={cx('choice choice-letter', letters.includes(x) && 'chosen')}
                onClick={() => setLetters(kind === 'single' ? [x] : letters.includes(x) ? letters.filter((y) => y !== x) : [...letters, x].sort())}
              >
                <span className="choice-key">{x}</span>
              </button>
            ))}
          </div>
        )}
        <Field label="Why did it go wrong?">
          <div className="chip-row wrap">
            {GALTI_REASONS.map((r) => (
              <Chip key={r} active={reason === r} onClick={() => setReason(reason === r ? undefined : r)}>
                {GALTI_REASON_LABEL[r]}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Note (optional)">
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. forgot sign convention for concave mirror" />
        </Field>
        <Button variant="primary" size="lg" onClick={save} disabled={!ready}>
          Save mistake
        </Button>
      </div>
    </Sheet>
  )
}
