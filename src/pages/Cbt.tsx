// CBT test screen, modelled on the NTA interface: answers count only after
// "Save & Next"; the palette shows not visited / not answered / answered / marked.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LayoutGrid, X } from 'lucide-react'
import { db, type TestRow, type TestResponse } from '../db/db'
import type { Question } from '../content/schema'
import { FORMAT_LABEL } from '../content/schema'
import { PALETTE_LABEL, loadTestQuestions, paletteState, submitTest, type PaletteState } from '../engine/cbt'
import { isEmpty, ruleFor, type Response } from '../engine/marking'
import { AnswerInput } from '../ui/answer'
import { QuestionStem } from '../ui/content'
import { Button, Sheet, cx } from '../ui/kit'

function clock(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return [h, m, s % 60].map((x) => String(x).padStart(2, '0')).join(':')
}

export function CbtPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [test, setTest] = useState<TestRow>()
  const [questions, setQuestions] = useState<Map<string, Question>>()
  const [idx, setIdx] = useState(0)
  const [draft, setDraft] = useState<Response>()
  const [remaining, setRemaining] = useState(0)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const entered = useRef(Date.now())
  const tick = useRef<{ base: number; at: number }>({ base: 0, at: Date.now() })
  const testRef = useRef<TestRow>(undefined)
  const finishing = useRef(false)
  testRef.current = test

  useEffect(() => {
    db.tests.get(id).then(async (t) => {
      if (!t) return nav('/tests', { replace: true })
      if (t.state === 'submitted') return nav(`/test/${id}/result`, { replace: true })
      setQuestions(await loadTestQuestions(t))
      setTest(t)
      const all = t.sections.flatMap((s) => s.qids)
      setIdx(Math.max(0, t.current ? all.indexOf(t.current) : 0))
      setRemaining(t.remainingSec ?? t.durationSec)
    })
  }, [id, nav])

  const order = useMemo(() => test?.sections.flatMap((s, si) => s.qids.map((qid) => ({ qid, si }))) ?? [], [test])
  const cur = order[idx]
  const q = cur && questions?.get(cur.qid)

  const persist = useCallback(async (patch: Partial<TestRow>) => {
    const t = testRef.current
    if (!t) return
    const next = { ...t, ...patch }
    setTest(next)
    testRef.current = next
    await db.tests.put(next)
  }, [])

  // Timer: pauses while the app is closed; saved every few seconds.
  useEffect(() => {
    if (test?.state !== 'running') return
    tick.current = { base: test.remainingSec ?? test.durationSec, at: Date.now() }
    const h = setInterval(() => {
      const left = tick.current.base - (Date.now() - tick.current.at) / 1000
      setRemaining(left)
      if (left <= 0) finish(true)
    }, 500)
    const save = () => {
      const left = tick.current.base - (Date.now() - tick.current.at) / 1000
      db.tests.update(id, { remainingSec: Math.max(0, left) })
    }
    const s = setInterval(save, 5000)
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', save)
    return () => {
      clearInterval(h)
      clearInterval(s)
      save()
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', save)
    }
  }, [test?.state, id])

  // Entering a question marks it visited and loads its saved answer into the draft.
  useEffect(() => {
    if (!cur || test?.state !== 'running') return
    const r = testRef.current?.responses[cur.qid]
    setDraft(r?.answer as Response | undefined)
    entered.current = Date.now()
    if (!r?.visited) persist({ current: cur.qid, responses: { ...testRef.current!.responses, [cur.qid]: { marked: false, timeMs: 0, ...r, visited: true } } })
    else persist({ current: cur.qid })
  }, [cur?.qid, test?.state, persist])

  if (!test || !questions) return <div className="cbt loading" />

  const respOf = (qid: string): TestResponse => test.responses[qid] ?? { visited: false, marked: false, timeMs: 0 }
  const leave = (patch: Partial<TestResponse>): Record<string, TestResponse> => {
    const r = respOf(cur.qid)
    const spent = Date.now() - entered.current
    entered.current = Date.now()
    return { ...test.responses, [cur.qid]: { ...r, ...patch, visited: true, timeMs: r.timeMs + spent } }
  }
  const go = async (to: number, patch: Partial<TestResponse> = {}) => {
    const target = Math.max(0, Math.min(order.length - 1, to))
    await persist({ responses: leave(patch) })
    setIdx(target)
    setPaletteOpen(false)
  }
  const saveNext = () => go(idx + 1, { answer: isEmpty(draft) ? undefined : draft, marked: false })
  const saveMark = () => go(idx + 1, { answer: isEmpty(draft) ? undefined : draft, marked: true })
  const markNext = () => go(idx + 1, { marked: true })
  const clear = async () => {
    setDraft(undefined)
    await persist({ responses: { ...test.responses, [cur.qid]: { ...respOf(cur.qid), answer: undefined, visited: true } } })
  }
  async function finish(auto = false) {
    const t = testRef.current
    if (!t || t.state !== 'running' || finishing.current) return
    finishing.current = true
    await db.tests.put(t)
    await submitTest(t.id)
    nav(`/test/${t.id}/result${auto ? '?timeup=1' : ''}`, { replace: true })
  }

  if (test.state === 'ready')
    return (
      <div className="cbt cbt-instructions">
        <header className="cbt-top">
          <b>{test.title}</b>
        </header>
        <div className="cbt-inst-body">
          <h2>General instructions</h2>
          <ol>
            <li>
              Total duration: <b>{Math.round(test.durationSec / 60)} minutes</b>. The clock in the top-right corner counts down; the test is submitted automatically at
              zero. (If you close the app, the clock pauses.)
            </li>
            <li>The Question Palette shows the status of each question:</li>
          </ol>
          <Legend counts={undefined} />
          <ol start={3}>
            <li>
              An answer is saved only when you press <b>Save &amp; Next</b> or <b>Save &amp; Mark for Review</b>. Moving to another question without saving discards the
              selection.
            </li>
            <li>Questions marked for review that have an answer will be evaluated.</li>
            <li>Wrong answers go to your Galti Notebook automatically after you submit.</li>
          </ol>
          <h3>Marking</h3>
          <ul className="scheme-list">
            {test.sections.map((s) => (
              <li key={s.name}>
                <b>{s.name}</b>: {s.qids.length} questions · {s.scheme.name}
              </li>
            ))}
          </ul>
          <Button variant="primary" size="lg" onClick={() => persist({ state: 'running', startedAt: Date.now(), remainingSec: test.durationSec })}>
            I am ready to begin
          </Button>
        </div>
      </div>
    )

  const section = test.sections[cur.si]
  const rule = q ? ruleFor(section.scheme, q.format) : undefined
  const counts = order.reduce(
    (m, o) => {
      m[paletteState(test.responses[o.qid])]++
      return m
    },
    { notVisited: 0, notAnswered: 0, answered: 0, marked: 0, answeredMarked: 0 } as Record<PaletteState, number>,
  )

  const palette = (
    <div className="palette">
      <Legend counts={counts} />
      <div className="palette-section">{section.name}</div>
      <div className="palette-grid">
        {order.map((o, i) =>
          o.si === cur.si ? (
            <button key={o.qid} type="button" className={cx('pal', `pal-${paletteState(test.responses[o.qid])}`, i === idx && 'pal-current')} onClick={() => go(i)} aria-label={`Question ${i + 1}`}>
              {order.filter((x, j) => x.si === o.si && j <= i).length}
            </button>
          ) : null,
        )}
      </div>
    </div>
  )

  return (
    <div className="cbt">
      <header className="cbt-top">
        <div className="cbt-title">
          <b>{test.title}</b>
          <span className="muted small">Candidate: Uttam</span>
        </div>
        <div className={cx('cbt-timer', remaining < 300 && 'low')} aria-label="Time left">
          <span className="small">Time Left</span>
          <b>{clock(remaining)}</b>
        </div>
      </header>
      <nav className="cbt-sections" aria-label="Sections">
        {test.sections.map((s, si) => (
          <button key={s.name} type="button" className={cx('cbt-sec', si === cur.si && 'active')} onClick={() => go(order.findIndex((o) => o.si === si))}>
            {s.name}
          </button>
        ))}
        <button type="button" className="cbt-pal-toggle" onClick={() => setPaletteOpen(true)} aria-label="Open question palette">
          <LayoutGrid size={18} /> Palette
        </button>
      </nav>
      <div className="cbt-body">
        <main className="cbt-main">
          <div className="cbt-qhead">
            <b>Question No. {order.filter((o, j) => o.si === cur.si && j <= idx).length}</b>
            <span className="muted small">
              {q && FORMAT_LABEL[q.format]}
              {rule && ` · +${rule.correct} / ${rule.wrong}`}
              {rule?.partial && ' · partial marking'}
            </span>
          </div>
          <div className="cbt-q">
            {q ? (
              <>
                <QuestionStem q={q} />
                <AnswerInput q={q} value={draft} onChange={setDraft} variant="cbt" />
              </>
            ) : (
              <p className="muted">This question is missing (its pack was removed).</p>
            )}
          </div>
        </main>
        <aside className="cbt-side">{palette}</aside>
      </div>
      <footer className="cbt-foot">
        <div className="cbt-foot-row">
          <Button variant="good" onClick={saveNext}>
            Save &amp; Next
          </Button>
          <Button onClick={clear}>Clear</Button>
          <Button className="btn-warnfill" onClick={saveMark}>
            Save &amp; Mark for Review
          </Button>
          <Button className="btn-markfill" onClick={markNext}>
            Mark for Review &amp; Next
          </Button>
        </div>
        <div className="cbt-foot-row">
          <Button variant="ghost" onClick={() => go(idx - 1)} disabled={idx === 0}>
            « Back
          </Button>
          <Button variant="ghost" onClick={() => go(idx + 1)} disabled={idx === order.length - 1}>
            Next »
          </Button>
          <Button variant="primary" onClick={() => setConfirmOpen(true)}>
            Submit
          </Button>
        </div>
      </footer>
      <Sheet open={paletteOpen} onClose={() => setPaletteOpen(false)} title="Question palette">
        {palette}
      </Sheet>
      <Sheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Submit the test?">
        <table className="rtable">
          <tbody>
            {(Object.keys(PALETTE_LABEL) as PaletteState[]).map((k) => (
              <tr key={k}>
                <td>
                  <span className={cx('pal pal-mini', `pal-${k}`)} /> {PALETTE_LABEL[k]}
                </td>
                <td>
                  <b>{counts[k]}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Unsaved selections on the current question are not counted.</p>
        <div className="row gap">
          <Button variant="primary" onClick={() => finish()}>
            Yes, submit
          </Button>
          <Button variant="ghost" icon={<X size={16} />} onClick={() => setConfirmOpen(false)}>
            No, go back
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

function Legend({ counts }: { counts?: Record<PaletteState, number> }) {
  return (
    <ul className="legend">
      {(Object.keys(PALETTE_LABEL) as PaletteState[]).map((k) => (
        <li key={k}>
          <span className={cx('pal pal-mini', `pal-${k}`)}>{counts ? counts[k] : ''}</span>
          <span>{PALETTE_LABEL[k]}</span>
        </li>
      ))}
    </ul>
  )
}
