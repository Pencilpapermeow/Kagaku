import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, ClipboardPlus, FileText, History, NotebookPen, Timer } from 'lucide-react'
import { db } from '../db/db'
import { createTest } from '../engine/cbt'
import { resolveScheme } from '../engine/marking'
import { buildPractice, questionsByIds } from '../engine/session'
import { randomSeed } from '../engine/rng'
import { Button, Empty, TopBar, toast } from '../ui/kit'

export function TestsPage() {
  const nav = useNavigate()
  const papers = useLiveQuery(() => db.papers.toArray(), [])
  const tests = useLiveQuery(() => db.tests.orderBy('createdAt').reverse().limit(30).toArray(), [])
  const galti = useLiveQuery(() => db.galti.where('status').equals('active').count(), [], 0)

  const startPaper = async (paperId: string) => {
    const p = await db.papers.get(paperId)
    if (!p) return
    const sections = await Promise.all(
      p.sections.map(async (s) => ({ name: s.name, questions: await questionsByIds(s.questionIds), scheme: resolveScheme(s.scheme ?? p.scheme) })),
    )
    const t = await createTest({ title: p.title, kind: 'paper', paperId: p.id, durationMin: p.durationMin, sections })
    nav(`/test/${t.id}`)
  }
  const startMistakes = async () => {
    const qs = await buildPractice({ mode: 'mistakes', size: 30, seed: randomSeed() })
    if (!qs.length) return toast('No active mistakes')
    const t = await createTest({ title: 'Only my mistakes', kind: 'mistakes', durationMin: Math.max(10, qs.length * 3), sections: [{ name: 'Mistakes', questions: qs, scheme: resolveScheme('ja') }] })
    nav(`/test/${t.id}`)
  }

  return (
    <div>
      <TopBar title="Tests" sub="CBT practice in the NTA layout" back={false} />
      <div className="test-hero">
        <Link to="/tests/new" className="card hero-card tone-accent-border">
          <div className="tile tone-accent">
            <ClipboardPlus size={26} />
          </div>
          <div>
            <h3>Create your own test</h3>
            <p className="muted small">Pick chapters, number of questions, time and marking scheme.</p>
          </div>
          <ChevronRight className="muted" />
        </Link>
        <button type="button" className="card hero-card tone-pink-border" onClick={startMistakes} disabled={!galti}>
          <div className="tile tone-bad">
            <NotebookPen size={26} />
          </div>
          <div>
            <h3>Mistakes test</h3>
            <p className="muted small">{galti ? `${galti} questions from your Galti Notebook` : 'No active mistakes'}</p>
          </div>
          <ChevronRight className="muted" />
        </button>
      </div>

      <h2 className="section-title">Question papers</h2>
      {papers?.length ? (
        <div className="paper-list">
          {papers.map((p) => {
            const n = p.sections.reduce((a, s) => a + s.questionIds.length, 0)
            const attempts = tests?.filter((t) => t.paperId === p.id && t.state === 'submitted').length ?? 0
            return (
              <div key={p.id} className="card paper">
                <div className="paper-main">
                  <FileText size={20} />
                  <div>
                    <b>{p.title}</b>
                    <p className="muted small">
                      {n} Questions · {p.durationMin} Mins · Attempts: {attempts}
                    </p>
                  </div>
                </div>
                <Button variant="primary" size="sm" onClick={() => startPaper(p.id)}>
                  Start
                </Button>
              </div>
            )
          })}
        </div>
      ) : (
        <Empty icon={<FileText />} title="No papers yet">
          PYQ and AITS papers arrive as packs. Each becomes a full CBT test here.
        </Empty>
      )}

      <h2 className="section-title">
        <History size={18} /> History
      </h2>
      {tests?.length ? (
        <div className="history">
          {tests.map((t) => (
            <Link key={t.id} to={t.state === 'submitted' ? `/test/${t.id}/result` : `/test/${t.id}`} className="card history-row">
              <div>
                <b>{t.title}</b>
                <p className="muted small">
                  {new Date(t.createdAt).toLocaleString()} · {t.sections.reduce((a, s) => a + s.qids.length, 0)} Qs
                </p>
              </div>
              <span className={t.state === 'submitted' ? 'pill' : 'pill pill-warn'}>
                {t.state === 'submitted' ? (
                  'Result'
                ) : (
                  <>
                    <Timer size={12} /> Resume
                  </>
                )}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="muted small pad">Tests you take will be listed here.</p>
      )}
    </div>
  )
}
