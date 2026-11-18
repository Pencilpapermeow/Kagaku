// "Test from paper", step 2 and 3: processing (with a progress bar, resumable) and the quick
// "Check & start" screen. Only doubtful items are open; if nothing is doubtful it's one tap.

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, Check, CheckCheck, Crop, ImageOff, Loader2, Merge, Play, Plus, Trash2 } from 'lucide-react'
import { db } from '../../db/db'
import { SUBJECTS, type SubjectId } from '../../content/syllabus'
import { SCHEME_PRESETS } from '../../engine/marking'
import { MediaImage } from '../../ui/content'
import { Bar, Button, Chip, Empty, Field, Sheet, TopBar, cx, formatBytes, toast } from '../../ui/kit'
import { SchemeTable } from '../../ui/SchemeTable'
import { isRunning, runPaper } from '../../paper/job'
import { FORMAT_NAME } from '../../paper/layout'
import { assignKeys, blocking, doubtsOf, entriesFor, keyPapers, optionIds, presetRule, sectionDoubt } from '../../paper/match'
import { cropQuestion, deletePaper, deletePaperImages, savePaper, startPaperTest } from '../../paper/store'
import { PAPER_FORMATS, type PaperFormat, type PaperKey, type PaperQuestion, type PaperSection, type Piece, type UserPaperRow } from '../../paper/types'
import { CropEditor } from './CropEditor'

export function PaperCheckPage() {
  const { id = '' } = useParams()
  const paper = useLiveQuery(async () => (await db.userPapers.get(id)) ?? null, [id])
  useEffect(() => {
    if (paper?.status === 'processing' && !isRunning(id)) void runPaper(id)
  }, [paper?.status, id])
  if (paper === undefined) return <TopBar title="Paper" back="/tests" />
  if (paper === null)
    return (
      <>
        <TopBar title="Paper" back="/tests" />
        <Empty title="This paper isn't here any more" />
      </>
    )
  if (paper.status === 'processing') return <Processing paper={paper} />
  if (paper.status === 'failed') return <Failed paper={paper} />
  return <CheckScreen paper={paper} />
}

function Processing({ paper }: { paper: UserPaperRow }) {
  const nav = useNavigate()
  const p = paper.progress
  return (
    <div>
      <TopBar title={paper.title} sub="Making the test" back="/tests" />
      <section className="card processing" aria-live="polite">
        <Loader2 className="spin" size={28} />
        <b>{p?.label ?? 'Working…'}</b>
        <Bar value={p?.done ?? 0} max={Math.max(1, p?.total ?? 1)} />
        <p className="muted small">Everything happens on this device. You can leave this screen; if the app closes, it carries on from here next time you open the paper.</p>
      </section>
      <div className="row gap">
        <Button variant="ghost" onClick={() => nav('/tests')}>
          Back to tests
        </Button>
        <Button
          variant="ghost"
          icon={<Trash2 size={16} />}
          onClick={async () => {
            if (!window.confirm('Stop and delete this paper?')) return
            await deletePaper(paper.id)
            nav('/tests', { replace: true })
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  )
}

function Failed({ paper }: { paper: UserPaperRow }) {
  const nav = useNavigate()
  return (
    <div>
      <TopBar title={paper.title} back="/tests" />
      <section className="card">
        <h2 className="card-title">
          <AlertTriangle size={20} /> Something went wrong
        </h2>
        <p className="muted">{paper.error}</p>
        <div className="row gap wrap">
          <Button
            variant="primary"
            onClick={async () => {
              await savePaper(paper.id, { status: 'processing', error: undefined })
              void runPaper(paper.id)
            }}
          >
            Try again
          </Button>
          <Button
            variant="ghost"
            icon={<Trash2 size={16} />}
            onClick={async () => {
              await deletePaper(paper.id)
              nav('/tests', { replace: true })
            }}
          >
            Delete paper
          </Button>
        </div>
      </section>
    </div>
  )
}

const FORMAT_SHORT: Record<PaperFormat, string> = { single: 'Single', multiple: 'Multi', integer: 'Integer', numerical: 'Numerical' }

function keyText(q: PaperQuestion): string {
  const k = q.key
  if (!k) return '—'
  if (k.bonus) return 'Bonus'
  if (Array.isArray(k.answer)) return k.answer.join(',')
  if (q.format === 'numerical' && k.tolerance && k.tolerance > 0.011) return `${k.answer} ± ${k.tolerance}`
  return [String(k.answer), ...(k.accept ?? [])].join(' or ')
}

/** Moving a key between formats keeps what can be kept. */
function convertKey(k: PaperKey | undefined, from: PaperFormat, to: PaperFormat): PaperKey | undefined {
  if (!k || from === to) return k
  const letters = from === 'single' || from === 'multiple'
  if (k.bonus) return { ...k, answer: to === 'multiple' ? [String(k.answer)] : to === 'single' ? String(Array.isArray(k.answer) ? k.answer[0] : k.answer) : 0 }
  if (letters && to === 'multiple') return { answer: Array.isArray(k.answer) ? k.answer : [String(k.answer), ...(k.accept ?? [])] }
  if (letters && to === 'single') return Array.isArray(k.answer) ? { answer: k.answer[0], accept: k.answer.length > 1 ? k.answer.slice(1) : undefined } : k
  if (!letters && typeof k.answer === 'number' && (to === 'integer' || to === 'numerical')) return to === 'numerical' ? { answer: k.answer, tolerance: k.tolerance ?? 0.01 } : { answer: Math.round(k.answer) }
  return undefined
}

function CheckScreen({ paper }: { paper: UserPaperRow }) {
  const nav = useNavigate()
  const [open, setOpen] = useState<number>()
  const [crop, setCrop] = useState<{ uid?: number; startPage?: number }>()
  const [adding, setAdding] = useState(false)
  const [starting, setStarting] = useState(false)
  const [title, setTitle] = useState(paper.title)
  const [showAll, setShowAll] = useState(false)
  useEffect(() => setTitle(paper.title), [paper.title])

  const save = (patch: Partial<UserPaperRow>) => savePaper(paper.id, patch)
  const setQ = (uid: number, patch: Partial<PaperQuestion>) => save({ questions: paper.questions.map((q) => (q.uid === uid ? { ...q, ...patch } : q)) })
  const setSection = (si: number, patch: Partial<PaperSection>) => {
    const sections = paper.sections.map((s, i) => (i === si ? { ...s, ...patch } : s))
    let questions = paper.questions
    if (patch.format && patch.format !== paper.sections[si].format)
      questions = questions.map((q) => (q.section === si ? { ...q, format: patch.format!, key: convertKey(q.key, q.format, patch.format!) } : q))
    return save({ sections, questions })
  }

  const doubtful = paper.questions.filter((q) => doubtsOf(paper, q).length)
  const sectionDoubts = paper.sections.map(sectionDoubt).filter(Boolean).length
  const keyed = paper.questions.filter((q) => q.key).length
  const usable = paper.questions.filter((q) => !blocking(paper, q) && q.image).length
  const needs = doubtful.length + sectionDoubts

  const start = async () => {
    setStarting(true)
    try {
      const tid = await startPaperTest(paper.id)
      nav(`/test/${tid}`)
    } catch (e) {
      toast((e as Error).message)
      setStarting(false)
    }
  }

  const recrop = async (uid: number, pieces: Piece[], extra: Partial<PaperQuestion> = {}) => {
    const q = { ...paper.questions.find((x) => x.uid === uid)!, pieces, ...extra }
    const image = await cropQuestion(paper, q)
    await setQ(uid, { ...extra, pieces, image, cropNote: image ? undefined : 'The box looks empty — check it', ok: q.ok })
  }

  const split = async (uid: number, pieces: Piece[], index: number, y: number) => {
    const qi = paper.questions.findIndex((x) => x.uid === uid)
    const q = paper.questions[qi]
    const a = pieces.slice(0, index + 1).map((p, i) => (i === index ? { ...p, box: { ...p.box, y1: y } } : p))
    const b = [{ ...pieces[index], box: { ...pieces[index].box, y0: y } }, ...pieces.slice(index + 1)]
    const uidNew = Math.max(...paper.questions.map((x) => x.uid)) + 1
    const draft = { ...paper }
    const [imgA, imgB] = await Promise.all([cropQuestion(draft, { ...q, pieces: a }), cropQuestion(draft, { ...q, pieces: b })])
    const nq: PaperQuestion = { ...q, uid: uidNew, n: q.n + 1, pieces: b, image: imgB, key: undefined, keyNote: undefined, cropNote: undefined, ok: undefined }
    const questions = [...paper.questions]
    questions.splice(qi, 1, { ...q, pieces: a, image: imgA, cropNote: undefined }, nq)
    await save({ questions })
    setCrop(undefined)
    toast(`Split: the new question is Q${nq.n} — check its number and key`)
  }

  const merge = async (uid: number) => {
    const qi = paper.questions.findIndex((x) => x.uid === uid)
    const a = paper.questions[qi]
    const b = paper.questions[qi + 1]
    if (!b) return
    const pieces = [...a.pieces, ...b.pieces]
    const image = await cropQuestion(paper, { ...a, pieces })
    const questions = paper.questions.filter((x) => x.uid !== b.uid).map((x) => (x.uid === uid ? { ...x, pieces, image, key: x.key ?? b.key, cropNote: undefined } : x))
    await save({ questions })
    toast(`Q${b.n} joined to Q${a.n}`)
  }

  const addQuestion = async (pieces: Piece[]) => {
    const first = pieces[0]
    // Place it after the last question that starts before it on the paper.
    const startOf = (q: PaperQuestion) => (q.pieces[0] ? q.pieces[0].page * 1e6 + q.pieces[0].box.x0 * 10 + q.pieces[0].box.y0 / 1e3 : Infinity)
    const key = first.page * 1e6 + first.box.x0 * 10 + first.box.y0 / 1e3
    let after = -1
    paper.questions.forEach((q, i) => {
      if (startOf(q) < key) after = i
    })
    const prev = paper.questions[after]
    const section = prev?.section ?? 0
    const q: PaperQuestion = { uid: Math.max(0, ...paper.questions.map((x) => x.uid)) + 1, n: (prev?.n ?? 0) + 1, section, format: paper.sections[section]?.format ?? 'single', options: 4, pieces }
    q.image = await cropQuestion(paper, q)
    const questions = [...paper.questions]
    questions.splice(after + 1, 0, q)
    await save({ questions })
    setAdding(false)
    setOpen(q.uid)
  }

  const cropTarget = crop?.uid !== undefined ? paper.questions.find((q) => q.uid === crop.uid) : undefined
  const prevPage = (q: PaperQuestion) => {
    const i = paper.questions.indexOf(q)
    for (let k = i - 1; k >= 0; k--) {
      const ps = paper.questions[k].pieces
      if (ps.length) return ps[ps.length - 1].page
    }
    return undefined
  }

  if (paper.imagesDeleted)
    return (
      <div>
        <TopBar title={paper.title} back="/tests" />
        <Empty icon={<ImageOff />} title="Pictures deleted">
          The pictures of this paper were deleted to free space. Your results are still in Tests → History.
        </Empty>
      </div>
    )

  const qCard = (q: PaperQuestion, inSheet = false) => (
    <QuestionCard
      key={q.uid}
      paper={paper}
      q={q}
      onChange={(patch) => setQ(q.uid, patch)}
      onCrop={() => setCrop({ uid: q.uid, startPage: q.pieces[0]?.page ?? prevPage(q) })}
      onMerge={paper.questions.indexOf(q) < paper.questions.length - 1 ? () => merge(q.uid) : undefined}
      onRemove={async () => {
        if (!window.confirm(`Remove Q${q.n} from this paper?`)) return
        await save({ questions: paper.questions.filter((x) => x.uid !== q.uid) })
        if (inSheet) setOpen(undefined)
      }}
    />
  )

  return (
    <div className="paper-check">
      <TopBar title="Check & start" sub={paper.title} back="/tests" />
      <section className={cx('card check-summary', needs ? 'has-doubts' : 'all-good')}>
        <p className="check-line">
          <b>{paper.questions.length}</b> questions found · key read for <b>{keyed}</b> · {needs ? <b className="warn-text">{needs} need a look</b> : <b className="good-text">all look right</b>}
        </p>
        {paper.warnings.length > 0 && (
          <ul className="check-warnings">
            {paper.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        <div className="row gap wrap">
          <Button variant="primary" size="lg" icon={needs ? <Play size={18} /> : <CheckCheck size={18} />} onClick={start} disabled={starting || !usable}>
            {needs ? 'Start test' : 'Looks right → Start'}
          </Button>
          {needs > 0 && usable < paper.questions.length && <span className="muted small">{paper.questions.length - usable} without a box or key will be left out.</span>}
        </div>
      </section>

      <section className="card">
        <div className="form-grid">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== paper.title && save({ title: title.trim() })} />
          </Field>
          <Field label="Time (minutes)">
            <input type="number" min={1} max={600} value={paper.durationMin} onChange={(e) => save({ durationMin: Math.min(600, Math.max(1, Number(e.target.value) || 1)) })} />
          </Field>
          {keyPapers(paper.key).length > 1 && (
            <Field label="Answers from the key of">
              <select
                value={paper.keyPaper ?? keyPapers(paper.key)[0]}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  save({ keyPaper: n, questions: assignKeys(paper, entriesFor(paper.key, n)) })
                }}
              >
                {keyPapers(paper.key).map((n) => (
                  <option key={n} value={n}>
                    Paper {n}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </section>

      <h2 className="section-title">Sections</h2>
      <div className="psec-list">
        {paper.sections.map((s, si) => {
          const n = paper.questions.filter((q) => q.section === si).length
          const doubt = sectionDoubt(s)
          return (
            <div key={si} className={cx('card psec', doubt && 'doubt')}>
              <div className="psec-row">
                <input className="psec-name" aria-label="Section name" defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && setSection(si, { name: e.target.value.trim() })} />
                <span className="muted small">{n} Qs</span>
              </div>
              <div className="psec-row">
                <select aria-label={`${s.name}: subject`} value={s.subject} onChange={(e) => setSection(si, { subject: e.target.value as SubjectId })}>
                  {SUBJECTS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
                <select aria-label={`${s.name}: question type`} value={s.format} onChange={(e) => setSection(si, { format: e.target.value as PaperFormat, typeFrom: 'user', rule: s.marksFrom === 'user' ? s.rule : presetRule(e.target.value as PaperFormat, s.marksFrom === 'instructions' ? s.rule : undefined) })}>
                  {PAPER_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {FORMAT_NAME[f]}
                    </option>
                  ))}
                </select>
              </div>
              {doubt && (
                <div className="psec-doubt">
                  <AlertTriangle size={16} /> <span>{doubt}</span>
                  <Button size="sm" onClick={() => setSection(si, { ok: true })}>
                    Looks right
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <h3 className="section-title small">Marking</h3>
      <div className="chip-row wrap">
        {SCHEME_PRESETS.map((p) => (
          <Chip key={p.id} onClick={() => save({ sections: paper.sections.map((s) => ({ ...s, rule: { ...p.rules[s.format]!, partial: s.format === 'multiple' && !!p.rules[s.format]?.partial }, marksFrom: 'user' })) })}>
            {p.name}
          </Chip>
        ))}
      </div>
      <SchemeTable
        head="Section"
        rows={paper.sections.map((s, si) => ({ key: String(si), label: `${s.name} (${FORMAT_SHORT[s.format]})`, rule: s.rule, partial: s.format === 'multiple' }))}
        onChange={(k, patch) => setSection(Number(k), { rule: { ...paper.sections[Number(k)].rule, ...patch }, marksFrom: 'user' })}
      />

      {doubtful.length > 0 && (
        <>
          <h2 className="section-title">
            <AlertTriangle size={18} /> Need a look ({doubtful.length})
          </h2>
          <div className="pq-list">{doubtful.map((q) => qCard(q))}</div>
        </>
      )}

      <div className="row between">
        <h2 className="section-title">All questions</h2>
        <Button size="sm" icon={<Plus size={16} />} onClick={() => setAdding(true)}>
          Add a missed question
        </Button>
      </div>
      <div className="pq-grid">
        {paper.questions.map((q) => {
          const d = doubtsOf(paper, q).length > 0
          return (
            <button key={q.uid} type="button" className={cx('pq-chip', d && 'doubt')} onClick={() => setOpen(q.uid)} aria-label={`Question ${q.n}`}>
              <b>Q{q.n}</b>
              <span>{keyText(q)}</span>
              <span className="muted">{FORMAT_SHORT[q.format]}</span>
            </button>
          )
        })}
      </div>
      <Button size="sm" variant="ghost" onClick={() => setShowAll(!showAll)}>
        {showAll ? 'Hide pictures' : 'Show every question with its picture'}
      </Button>
      {showAll && <div className="pq-list">{paper.questions.map((q) => qCard(q))}</div>}

      <section className="card paper-space">
        <p className="muted small">
          Pictures of this paper use {formatBytes(paper.bytes)} on this device. Deleting them keeps your results but you can't re-attempt the paper.
        </p>
        <div className="row gap wrap">
          <Button
            size="sm"
            icon={<ImageOff size={16} />}
            onClick={async () => {
              if (!window.confirm('Delete the pictures of this paper? Results stay; re-attempts will not be possible.')) return
              await deletePaperImages(paper.id)
              nav('/tests', { replace: true })
            }}
          >
            Delete paper images
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 size={16} />}
            onClick={async () => {
              if (!window.confirm('Delete this paper completely? Test results stay in History.')) return
              await deletePaper(paper.id)
              nav('/tests', { replace: true })
            }}
          >
            Delete paper
          </Button>
        </div>
      </section>

      <Sheet open={open !== undefined && !crop} onClose={() => setOpen(undefined)} title={open !== undefined ? `Question ${paper.questions.find((q) => q.uid === open)?.n ?? ''}` : ''} wide>
        {open !== undefined && paper.questions.find((q) => q.uid === open) && qCard(paper.questions.find((q) => q.uid === open)!, true)}
      </Sheet>
      {crop && (cropTarget || crop.uid === undefined) && (
        <CropEditor
          paper={paper}
          title={cropTarget ? `Q${cropTarget.n}: its box on the page` : 'Draw the missed question'}
          initial={cropTarget?.pieces ?? []}
          startPage={crop.startPage}
          onClose={() => setCrop(undefined)}
          onSave={async (pieces) => {
            if (cropTarget) await recrop(cropTarget.uid, pieces)
            setCrop(undefined)
          }}
          onSplit={cropTarget ? (pieces, i, y) => split(cropTarget.uid, pieces, i, y) : undefined}
        />
      )}
      {adding && <CropEditor paper={paper} title="Draw the missed question" initial={[]} onClose={() => setAdding(false)} onSave={addQuestion} />}
    </div>
  )
}

function QuestionCard({ paper, q, onChange, onCrop, onMerge, onRemove }: { paper: UserPaperRow; q: PaperQuestion; onChange: (p: Partial<PaperQuestion>) => void; onCrop: () => void; onMerge?: () => void; onRemove: () => void }) {
  const doubts = doubtsOf(paper, q)
  const softOnly = doubts.length > 0 && !blocking(paper, q)
  return (
    <article className={cx('card pq', doubts.length > 0 && 'doubt')}>
      <header className="pq-head">
        <label className="pq-no">
          Q
          <input type="number" aria-label="Question number" value={q.n} min={1} onChange={(e) => onChange({ n: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
        <span className="pill">{paper.sections[q.section]?.name}</span>
        <select aria-label="Question type" value={q.format} onChange={(e) => onChange({ format: e.target.value as PaperFormat, key: convertKey(q.key, q.format, e.target.value as PaperFormat), keyNote: undefined })}>
          {PAPER_FORMATS.map((f) => (
            <option key={f} value={f}>
              {FORMAT_NAME[f]}
            </option>
          ))}
        </select>
      </header>
      {doubts.length > 0 && (
        <ul className="pq-doubts">
          {doubts.map((d) => (
            <li key={d}>
              <AlertTriangle size={14} /> {d}
            </li>
          ))}
        </ul>
      )}
      {q.image ? <MediaImage src={q.image} alt={`Question ${q.n}`} className="pq-crop" /> : <div className="pq-nocrop">No picture yet — draw its box.</div>}
      <KeyEditor paper={paper} q={q} onChange={(key) => onChange({ key, keyNote: undefined })} />
      <div className="row gap wrap pq-actions">
        <Button size="sm" icon={<Crop size={16} />} onClick={onCrop}>
          {q.pieces.length ? 'Fix crop' : 'Draw its box'}
        </Button>
        {onMerge && (
          <Button size="sm" icon={<Merge size={16} />} onClick={onMerge}>
            Join with next
          </Button>
        )}
        {softOnly && (
          <Button size="sm" variant="good" icon={<Check size={16} />} onClick={() => onChange({ ok: true })}>
            Looks fine
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={<Trash2 size={16} />} onClick={onRemove}>
          Remove
        </Button>
      </div>
    </article>
  )
}

function KeyEditor({ paper, q, onChange }: { paper: UserPaperRow; q: PaperQuestion; onChange: (k: PaperKey | undefined) => void }) {
  const k = q.key
  const bonus = (
    <label className="switch-row">
      <input type="checkbox" checked={!!k?.bonus} onChange={(e) => onChange(e.target.checked ? { answer: k?.answer ?? (q.format === 'multiple' ? [optionIds(paper.optionStyle, q.options)[0]] : q.format === 'single' ? optionIds(paper.optionStyle, q.options)[0] : 0), bonus: true } : k ? { ...k, bonus: undefined } : undefined)} />
      <span>Bonus (full marks to all)</span>
    </label>
  )
  if (q.format === 'single' || q.format === 'multiple') {
    const ids = optionIds(paper.optionStyle, q.options)
    const chosen = k ? (Array.isArray(k.answer) ? k.answer : [String(k.answer), ...(k.accept ?? [])]) : []
    const either = q.format === 'single' && !!k?.accept?.length
    const toggle = (id: string) => {
      // Single correct: a tap picks the key (unless "more than one accepted" is on).
      if (q.format === 'single' && !either) return onChange({ ...k, answer: id, accept: undefined })
      const next = ids.filter((x) => (x === id ? !chosen.includes(x) : chosen.includes(x)))
      if (!next.length) return onChange(undefined)
      if (q.format === 'multiple') return onChange({ ...k, answer: next })
      const main = next.includes(chosen[0]) ? chosen[0] : next[0]
      const rest = next.filter((x) => x !== main)
      onChange({ ...k, answer: main, accept: rest.length ? rest : undefined })
    }
    return (
      <div className="pq-key">
        <span className="muted small">Key</span>
        <div className="chip-row">
          {ids.map((id) => (
            <button key={id} type="button" className={cx('choice choice-letter', chosen.includes(id) && 'chosen')} aria-pressed={chosen.includes(id)} aria-label={`Key option ${id}`} onClick={() => toggle(id)}>
              <span className="choice-key">{id}</span>
            </button>
          ))}
        </div>
        {q.format === 'single' && (
          <label className="switch-row">
            <input
              type="checkbox"
              checked={either}
              onChange={(e) => k && onChange(e.target.checked ? { ...k, accept: ids.filter((x) => x !== k.answer).slice(0, 1) } : { ...k, accept: undefined })}
            />
            <span>More than one option accepted (e.g. "A or C")</span>
          </label>
        )}
        {bonus}
      </div>
    )
  }
  return (
    <div className="pq-key">
      <span className="muted small">Key</span>
      <input inputMode="decimal" aria-label="Key answer" defaultValue={k ? String(k.answer) : ''} key={`${q.uid}-${String(k?.answer)}`} onBlur={(e) => {
        const v = e.target.value.trim()
        if (!v) return onChange(undefined)
        const n = Number(v)
        if (Number.isFinite(n)) onChange({ ...k, answer: n, tolerance: q.format === 'numerical' ? (k?.tolerance ?? 0.01) : undefined })
      }} />
      {q.format === 'numerical' && (
        <label className="pq-tol">
          ±
          <input inputMode="decimal" aria-label="Tolerance" defaultValue={String(k?.tolerance ?? 0.01)} key={`${q.uid}-t-${k?.tolerance}`} onBlur={(e) => k && Number.isFinite(Number(e.target.value)) && onChange({ ...k, tolerance: Math.abs(Number(e.target.value)) })} />
        </label>
      )}
      {bonus}
    </div>
  )
}
