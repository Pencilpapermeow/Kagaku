import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, CircleSlash, Clock, ShieldCheck, XCircle } from 'lucide-react'
import { db, type TestRow } from '../db/db'
import type { Question } from '../content/schema'
import { evaluate, loadTestQuestions, type QuestionResult } from '../engine/cbt'
import { describeAnswer, type Response } from '../engine/marking'
import { describeResponse } from '../engine/verify'
import { useChapters } from '../db/queries'
import { AnswerInput } from '../ui/answer'
import { QuestionStem, Rich } from '../ui/content'
import { Bar, Chip, Sheet, Stat, TopBar, cx, formatDuration } from '../ui/kit'
import { VerifySheet } from '../ui/VerifySheet'

type Filter = 'all' | 'wrong' | 'right' | 'skipped'

export function ResultPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const [test, setTest] = useState<TestRow>()
  const [questions, setQuestions] = useState<Map<string, Question>>()
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<QuestionResult>()
  const [verify, setVerify] = useState(false)
  const chapters = useChapters()
  const name = useMemo(() => new Map(chapters.map((c) => [c.id, c.name])), [chapters])

  useEffect(() => {
    db.tests.get(id).then(async (t) => {
      if (!t) return
      setTest(t)
      setQuestions(await loadTestQuestions(t))
    })
  }, [id, verify])

  const result = useMemo(() => (test && questions ? evaluate(test, questions) : undefined), [test, questions])
  if (!test || !result) return <TopBar title="Result" />

  const attempted = result.correct + result.wrong
  const accuracy = attempted ? Math.round((result.correct / attempted) * 100) : 0
  const list = result.perQuestion.filter((x) =>
    filter === 'all' ? true : filter === 'right' ? x.verdict.correct : filter === 'wrong' ? x.verdict.attempted && !x.verdict.correct : !x.verdict.attempted,
  )
  const oq = open && questions?.get(open.qid)
  const oresp = open && (test.responses[open.qid]?.answer as Response | undefined)

  return (
    <div>
      <TopBar title="Test analysis" sub={test.title} back="/tests" />
      {params.get('timeup') && <div className="banner banner-warn">Time was up — the test was submitted automatically.</div>}
      <section className="card score-card">
        <div className="score">
          <b>{result.total}</b>
          <span>/ {result.max}</span>
        </div>
        <Bar value={Math.max(0, result.total)} max={result.max} color="linear-gradient(90deg, var(--accent), var(--cyan))" />
        <div className="stats-row">
          <Stat label="Correct" value={result.correct} tone="good" />
          <Stat label="Wrong" value={result.wrong} tone="bad" />
          <Stat label="Skipped" value={result.unattempted} />
          <Stat label="Accuracy" value={`${accuracy}%`} tone="accent" />
          <Stat label="Time used" value={formatDuration(result.timeMs)} />
        </div>
        {result.partial > 0 && <p className="muted small">{result.partial} multiple-correct answers got partial marks.</p>}
      </section>

      <h2 className="section-title">By section</h2>
      <BreakdownTable rows={result.bySection.map((s) => ({ label: s.name, ...s }))} />
      <h2 className="section-title">By chapter</h2>
      <BreakdownTable rows={result.byChapter.map((s) => ({ label: name.get(s.chapter) ?? s.chapter, ...s }))} />

      <h2 className="section-title">Question-wise</h2>
      <div className="chip-row">
        {(['all', 'wrong', 'right', 'skipped'] as Filter[]).map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </Chip>
        ))}
      </div>
      <div className="qwise">
        {list.map((x) => {
          const n = result.perQuestion.indexOf(x) + 1
          return (
            <button key={x.qid} type="button" className={cx('card qrow', x.verdict.correct ? 'right' : x.verdict.attempted ? 'wrong' : 'skip')} onClick={() => setOpen(x)}>
              <span className="qrow-n">Q{n}</span>
              {x.verdict.correct ? <CheckCircle2 size={18} /> : x.verdict.attempted ? <XCircle size={18} /> : <CircleSlash size={18} />}
              <span className="qrow-main">
                <span className="small">{name.get(x.chapter)}</span>
                <span className="muted small">
                  <Clock size={12} /> {formatDuration(x.timeMs)}
                </span>
              </span>
              <b className={cx('qrow-marks', x.marks > 0 ? 'pos' : x.marks < 0 ? 'neg' : '')}>{x.marks > 0 ? `+${x.marks}` : x.marks}</b>
            </button>
          )
        })}
      </div>

      <Sheet open={!!oq} onClose={() => setOpen(undefined)} title={open ? `Question ${result.perQuestion.indexOf(open) + 1}` : ''} wide>
        {oq && open && (
          <div className="review">
            <QuestionStem q={oq} />
            <AnswerInput q={oq} value={oresp} onChange={() => {}} reveal variant="cbt" />
            <p>
              Your answer: <b>{describeResponse(oq, oresp)}</b> · Key: <b>{describeAnswer(oq)}</b> · Marks: <b>{open.marks}</b>
            </p>
            {oq.solution && <Rich text={oq.solution} className="solution" />}
            <button type="button" className="btn btn-soft btn-md" onClick={() => setVerify(true)}>
              <ShieldCheck size={18} />
              <span>Verify key</span>
            </button>
            <VerifySheet open={verify} onClose={() => setVerify(false)} shown={oq} response={oresp} />
          </div>
        )}
      </Sheet>
    </div>
  )
}

function BreakdownTable({ rows }: { rows: { label: string; marks: number; max: number; correct: number; wrong: number; unattempted: number }[] }) {
  return (
    <div className="table-wrap">
      <table className="rtable breakdown">
        <thead>
          <tr>
            <th>Name</th>
            <th>Marks</th>
            <th>✓</th>
            <th>✗</th>
            <th>–</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>
                <b>{r.marks}</b>/{r.max}
              </td>
              <td className="good-text">{r.correct}</td>
              <td className="bad-text">{r.wrong}</td>
              <td>{r.unattempted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
