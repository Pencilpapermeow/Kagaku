import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, Brain, EyeOff, Eye, ListChecks, NotebookPen, Play, Sparkles, StickyNote, Trash2 } from 'lucide-react'
import { db, type RememberRow } from '../db/db'
import { useChapter, useChapterStats } from '../db/queries'
import { getSubject } from '../content/syllabus'
import { FORMAT_LABEL, type QuestionFormat } from '../content/schema'
import { generateFrom } from '../engine/generate'
import { makeRng } from '../engine/rng'
import { Button, Chip, Empty, Tabs, TopBar, cx, toast } from '../ui/kit'
import { MathBlock, MediaImage, Rich } from '../ui/content'
import { SUBJECT_COLOR } from './Home'
import { GaltiList } from './Notebooks'

type Tab = 'remember' | 'practice' | 'galti' | 'notes'

export function ChapterPage() {
  const { chapter: cid = '' } = useParams()
  const ch = useChapter(cid)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'remember'
  const stats = useChapterStats()?.get(cid)
  if (!ch) return <TopBar title="Chapter not found" />
  const unit = getSubject(ch.subject).units.find((u) => u.id === ch.unit)?.name

  return (
    <div style={{ ['--tint' as string]: SUBJECT_COLOR[ch.subject] }}>
      <TopBar title={ch.name} sub={`${getSubject(ch.subject).name} · ${unit} · Class ${ch.cls}`} back={`/s/${ch.subject}`} />
      <Tabs
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        items={[
          { id: 'remember', label: 'To Remember', badge: stats?.remember },
          { id: 'practice', label: 'Practice', badge: stats?.total },
          { id: 'galti', label: 'Galti', badge: stats?.galti },
          { id: 'notes', label: 'Notes' },
        ]}
      />
      {tab === 'remember' && <RememberTab chapter={cid} />}
      {tab === 'practice' && <PracticeTab chapter={cid} />}
      {tab === 'galti' && <GaltiList chapter={cid} />}
      {tab === 'notes' && <NotesTab chapter={cid} />}
    </div>
  )
}

function RememberTab({ chapter }: { chapter: string }) {
  const items = useLiveQuery(() => db.remember.where('chapter').equals(chapter).toArray(), [chapter])
  const [hide, setHide] = useState(false)
  const groups = useMemo(() => {
    const m = new Map<string, RememberRow[]>()
    for (const r of items ?? []) m.set(r.topic ?? '', [...(m.get(r.topic ?? '') ?? []), r])
    return [...m.entries()]
  }, [items])
  if (!items) return null
  if (!items.length)
    return (
      <Empty icon={<BookOpen />} title="Nothing to remember here yet">
        Formulas, definitions, tables and trends for this chapter will appear here once a pack adds them.
      </Empty>
    )
  return (
    <div className="remember">
      <div className="remember-bar">
        <Button variant={hide ? 'primary' : 'soft'} icon={hide ? <EyeOff size={18} /> : <Eye size={18} />} onClick={() => setHide(!hide)}>
          {hide ? 'Self-test on: tap to reveal' : 'Self-test mode'}
        </Button>
      </div>
      {groups.map(([topic, list]) => (
        <section key={topic}>
          {topic && <h3 className="topic-title">{topic}</h3>}
          <div className="remember-grid">
            {list.map((r) => (
              <RememberCard key={r.id} r={r} hide={hide} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function Hidden({ hide, children, className }: { hide: boolean; children: ReactNode; className?: string }) {
  const [shown, setShown] = useState(false)
  const covered = hide && !shown
  return (
    <div className={cx('hideable', covered && 'covered', className)} onClick={() => hide && setShown(!shown)} role={hide ? 'button' : undefined} tabIndex={hide ? 0 : undefined}>
      {children}
    </div>
  )
}

function RememberCard({ r, hide }: { r: RememberRow; hide: boolean }) {
  return (
    <article className={cx('card rcard', `rcard-${r.kind}`)}>
      <header className="rcard-head">
        <h4>
          <Rich as="span" text={r.title} />
        </h4>
        {r.verified === 'unverified' && <span className="pill pill-warn">unverified</span>}
      </header>
      {r.kind === 'formula' && (
        <>
          {r.condition && (
            <div className="condition">
              When: <Rich as="span" text={r.condition} />
            </div>
          )}
          <Hidden hide={hide}>
            <MathBlock tex={r.latex} />
          </Hidden>
          {r.where?.length ? (
            <ul className="where">
              {r.where.map((w) => (
                <li key={w.symbol}>
                  <Rich as="span" text={`$${w.symbol}$`} /> — {w.meaning}
                  {w.unit && <span className="muted"> ({w.unit})</span>}
                </li>
              ))}
            </ul>
          ) : null}
          {r.note && <Rich text={r.note} className="muted small" />}
        </>
      )}
      {r.kind === 'note' && (
        <Hidden hide={hide}>
          <Rich text={r.body} />
          <MediaImage src={r.image} />
        </Hidden>
      )}
      {r.kind === 'table' && (
        <div className="table-wrap">
          <table className="rtable">
            <thead>
              <tr>
                {r.columns.map((c) => (
                  <th key={c.key}>
                    <Rich as="span" text={c.label} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.rows.map((row, i) => (
                <tr key={i}>
                  {r.columns.map((c) => (
                    <td key={c.key}>
                      {c.key === r.keyColumn ? (
                        <Rich as="span" text={row[c.key]} />
                      ) : (
                        <Hidden hide={hide} className="cell">
                          <Rich as="span" text={row[c.key]} />
                        </Hidden>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {r.note && <Rich text={r.note} className="muted small" />}
        </div>
      )}
      {r.kind === 'trend' && (
        <>
          <div className="muted small">Increasing {r.property}</div>
          <Hidden hide={hide}>
            <div className="trend">
              {r.order.map((x, i) => (
                <span key={i} className="trend-item">
                  {i > 0 && <span className="trend-lt">&lt;</span>}
                  <Rich as="span" text={x} />
                </span>
              ))}
            </div>
          </Hidden>
          {r.basis && <Rich text={`**Why:** ${r.basis}`} className="small" />}
          {r.exceptions && <Rich text={`**Exceptions:** ${r.exceptions}`} className="small warn-text" />}
        </>
      )}
    </article>
  )
}

function PracticeTab({ chapter }: { chapter: string }) {
  const nav = useNavigate()
  const data = useLiveQuery(async () => {
    const [qs, rem, galti] = await Promise.all([
      db.questions.where('chapter').equals(chapter).toArray(),
      db.remember.where('chapter').equals(chapter).toArray(),
      db.galti.where('chapter').equals(chapter).filter((g) => g.status === 'active').count(),
    ])
    const gen = rem.flatMap((r) => generateFrom(r, makeRng(1)))
    const formats = new Map<QuestionFormat, number>()
    for (const q of [...qs, ...gen]) formats.set(q.format, (formats.get(q.format) ?? 0) + 1)
    return { questions: qs.length, generated: gen.length, galti, formats: [...formats.entries()] }
  }, [chapter])
  const go = (m: string, f?: string) => nav(`/practice?c=${encodeURIComponent(chapter)}&m=${m}${f ? `&f=${f}` : ''}`)
  if (!data) return null
  if (!data.questions && !data.generated)
    return (
      <Empty icon={<ListChecks />} title="No questions yet">
        Questions for this chapter arrive with content packs. Tables and trends in "To Remember" also turn into questions automatically.
      </Empty>
    )
  return (
    <div className="practice-start">
      <button type="button" className="card big-action" onClick={() => go('mixed')}>
        <div className="tile tone-accent">
          <Play size={24} />
        </div>
        <div>
          <b>Mixed practice</b>
          <p className="muted small">
            {data.questions} questions + {data.generated} from formulas & tables
          </p>
        </div>
      </button>
      <div className="action-grid">
        <button type="button" className="card action" onClick={() => go('questions')} disabled={!data.questions}>
          <Brain size={20} />
          <b>Questions only</b>
          <span className="muted small">{data.questions}</span>
        </button>
        <button type="button" className="card action" onClick={() => go('generated')} disabled={!data.generated}>
          <Sparkles size={20} />
          <b>From To Remember</b>
          <span className="muted small">{data.generated}</span>
        </button>
        <button type="button" className="card action" onClick={() => go('mistakes')} disabled={!data.galti}>
          <NotebookPen size={20} />
          <b>Only my mistakes</b>
          <span className="muted small">{data.galti}</span>
        </button>
      </div>
      {data.formats.length > 1 && (
        <>
          <h3 className="section-title small">By format</h3>
          <div className="chip-row wrap">
            {data.formats.map(([f, n]) => (
              <Chip key={f} onClick={() => go('mixed', f)}>
                {FORMAT_LABEL[f]} · {n}
              </Chip>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function NotesTab({ chapter }: { chapter: string }) {
  const notes = useLiveQuery(() => db.notes.where('chapter').equals(chapter).reverse().sortBy('at'), [chapter])
  const [text, setText] = useState('')
  const add = async () => {
    if (!text.trim()) return
    await db.notes.add({ chapter, text: text.trim(), at: Date.now() })
    setText('')
    toast('Note saved')
  }
  return (
    <div className="notes">
      <div className="card note-new">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a note for this chapter… ($x^2$ works for maths)" rows={3} />
        <Button variant="primary" icon={<StickyNote size={18} />} onClick={add} disabled={!text.trim()}>
          Save note
        </Button>
      </div>
      {notes?.map((n) => (
        <div key={n.id} className="card note">
          <Rich text={n.text} />
          <div className="note-foot">
            <span className="muted small">{new Date(n.at).toLocaleString()}</span>
            <button type="button" className="icon-btn" aria-label="Delete note" onClick={() => db.notes.delete(n.id!)}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
