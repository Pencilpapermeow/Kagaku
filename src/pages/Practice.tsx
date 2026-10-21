// Practice: the cute, light mood. Big option cards, small animations, a combo streak.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bookmark, BookmarkCheck, Flag, Flame, PartyPopper, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { db, GALTI_REASONS, GALTI_REASON_LABEL, type GaltiReason } from '../db/db'
import { useSettings } from '../db/settings'
import { useChapters } from '../db/queries'
import { FORMAT_LABEL, type Question, type QuestionFormat } from '../content/schema'
import { check, isEmpty, type Response, type Verdict } from '../engine/marking'
import { buildPractice, type PracticeMode } from '../engine/session'
import { presentQuestion } from '../engine/variants'
import { makeRng, randomSeed } from '../engine/rng'
import { recordAttempt, setGaltiReason } from '../engine/progress'
import { reportQuestion } from '../engine/verify'
import { isTrusted } from '../engine/review'
import { AnswerInput } from '../ui/answer'
import { QuestionStem, Rich, MediaImage } from '../ui/content'
import { Bar, Button, Chip, Empty, Stat, cx, formatDuration, toast } from '../ui/kit'
import { VerifySheet } from '../ui/VerifySheet'

interface Done {
  q: Question
  verdict: Verdict
  timeMs: number
}

const CHEERS = ['Nice!', 'Sahi jawab!', 'Brilliant!', 'Exactly!', 'Senku would approve.', 'Ten billion percent!']

export function PracticePage() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const settings = useSettings()
  const chapters = useChapters()
  const chapterIds = params.get('c')?.split(',').filter(Boolean)
  const mode = (params.get('m') as PracticeMode) || 'mixed'
  const format = (params.get('f') as QuestionFormat) || undefined
  const [seed, setSeed] = useState(randomSeed)
  const [queue, setQueue] = useState<Question[]>()
  const [i, setI] = useState(0)
  const [response, setResponse] = useState<Response>()
  const [verdict, setVerdict] = useState<Verdict>()
  const [done, setDone] = useState<Done[]>([])
  const [combo, setCombo] = useState(0)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [cheer, setCheer] = useState('')
  const started = useRef(Date.now())

  useEffect(() => {
    let alive = true
    buildPractice({ chapters: chapterIds, mode, format, size: settings.practiceSize, seed }).then((qs) => {
      if (!alive) return
      const rng = makeRng(seed ^ 0x9e3779b9)
      setQueue(qs.map((q) => presentQuestion(q, rng, { noneOfTheseRate: settings.noneOfTheseRate })))
      setI(0)
      setDone([])
      setCombo(0)
    })
    return () => {
      alive = false
    }
  }, [seed, mode, format, params.get('c'), settings.practiceSize, settings.noneOfTheseRate])

  const q = queue?.[i]
  useEffect(() => {
    setResponse(undefined)
    setVerdict(undefined)
    started.current = Date.now()
  }, [q])

  const bookmarked = useLiveQuery(async () => (q ? !!(await db.bookmarks.get(q.id)) : false), [q?.id], false)
  const galtiRow = useLiveQuery(async () => (q ? db.galti.get(q.id) : undefined), [q?.id])
  const meta = useLiveQuery(async () => (q ? db.qmeta.get(q.id) : undefined), [q?.id])

  const submit = useCallback(async () => {
    if (!q || verdict) return
    const v = check(q, response)
    const timeMs = Date.now() - started.current
    setVerdict(v)
    setDone((d) => [...d, { q, verdict: v, timeMs }])
    setCombo((c) => (v.correct ? c + 1 : 0))
    setCheer(v.correct ? CHEERS[Math.floor(Math.random() * CHEERS.length)] : '')
    const { graduated } = await recordAttempt({ q, qid: q.id, verdict: v, response, mode: mode === 'mistakes' ? 'galti' : 'practice', timeMs })
    if (graduated) toast('🎓 Graduated from the Galti Notebook!')
  }, [q, response, verdict, mode])

  const next = () => setI((x) => x + 1)
  const chapterName = useMemo(() => new Map(chapters.map((c) => [c.id, c.name])), [chapters])

  if (!queue) return <div className="practice loading" />
  if (!queue.length)
    return (
      <div className="practice">
        <PracticeHeader onClose={() => nav(-1)} progress={0} total={0} combo={0} />
        <Empty title="Nothing to practise here">{mode === 'mistakes' ? 'No active mistakes — wonderful.' : 'Add content packs from the Update Center first.'}</Empty>
      </div>
    )

  if (i >= queue.length) return <Summary done={done} onAgain={() => setSeed(randomSeed())} onMistakes={() => nav('/practice?m=mistakes' + (chapterIds ? `&c=${chapterIds.join(',')}` : ''))} onExit={() => nav(-1)} />

  const empty = isEmpty(response)
  return (
    <div className="practice">
      <PracticeHeader onClose={() => (done.length && !window.confirm('Leave this practice session?') ? null : nav(-1))} progress={i + (verdict ? 1 : 0)} total={queue.length} combo={combo} />
      <div className={cx('pcard', verdict && (verdict.correct ? 'is-right' : 'is-wrong'))} key={q!.id + i}>
        <div className="pcard-meta">
          <span className="pill">{FORMAT_LABEL[q!.format]}</span>
          <span className="muted small">{chapterName.get(q!.chapter)}</span>
          {q!.source?.label && <span className="muted small">· {q!.source.label}</span>}
          {q!.tags.includes('generated') && <span className="pill pill-accent">from To Remember</span>}
          {!isTrusted(q!.verified, meta) && <span className="pill pill-warn">key unverified</span>}
          {galtiRow?.status === 'active' && <span className="pill pill-bad">Galti · {galtiRow.streak}/{settings.graduateAfter}</span>}
        </div>
        <QuestionStem q={q!} />
        <AnswerInput q={q!} value={response} onChange={setResponse} reveal={!!verdict} />
      </div>

      {verdict && (
        <div className={cx('feedback', verdict.correct ? 'good' : verdict.partial ? 'partial' : 'bad')} role="status">
          <div className="feedback-title">
            {verdict.correct ? (
              <>
                <PartyPopper size={22} /> {cheer}
              </>
            ) : !verdict.attempted ? (
              'Skipped — here is the answer.'
            ) : verdict.partial ? (
              'Partly right — one or more correct options missing.'
            ) : (
              'Not quite. Look at the right answer above.'
            )}
          </div>
          {(q!.solution || q!.solutionImage) && (
            <div className="solution">
              <Rich text={q!.solution} />
              <MediaImage src={q!.solutionImage} />
            </div>
          )}
          {!verdict.correct && verdict.attempted && <ReasonChips qid={q!.id} />}
        </div>
      )}

      <footer className="pfoot">
        <div className="pfoot-tools">
          <button type="button" className="icon-btn" aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'} onClick={() => toggleBookmark(q!, bookmarked)}>
            {bookmarked ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
          </button>
          <button type="button" className="icon-btn" aria-label="Verify answer key" onClick={() => setVerifyOpen(true)}>
            <ShieldCheck size={20} />
          </button>
          <button type="button" className="icon-btn" aria-label="Report a problem" onClick={() => report(q!.id)}>
            <Flag size={20} />
          </button>
        </div>
        {!verdict ? (
          <div className="pfoot-main">
            <Button variant="ghost" onClick={submit}>
              Skip
            </Button>
            <Button variant="primary" size="lg" onClick={submit} disabled={empty}>
              Check
            </Button>
          </div>
        ) : (
          <div className="pfoot-main">
            <Button variant="primary" size="lg" onClick={next} autoFocus>
              {i + 1 < queue.length ? 'Next' : 'Finish'}
            </Button>
          </div>
        )}
      </footer>
      <VerifySheet
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        shown={q!}
        response={response}
        onFixed={(nowCorrect) => nowCorrect && setVerdict((v) => (v ? { ...v, correct: true, partial: false } : v))}
      />
    </div>
  )
}

function PracticeHeader({ onClose, progress, total, combo }: { onClose: () => void; progress: number; total: number; combo: number }) {
  return (
    <header className="phead">
      <button type="button" className="icon-btn" aria-label="Close practice" onClick={onClose}>
        <X size={22} />
      </button>
      <Bar value={progress} max={total} color="linear-gradient(90deg, var(--accent), var(--cyan))" />
      <div className={cx('combo', combo >= 3 && 'hot')} aria-label={`${combo} in a row`}>
        <Flame size={18} />
        <b>{combo}</b>
      </div>
    </header>
  )
}

function ReasonChips({ qid }: { qid: string }) {
  const row = useLiveQuery(() => db.galti.get(qid), [qid])
  return (
    <div className="reason">
      <span className="muted small">Why did it go wrong? (helps spot patterns)</span>
      <div className="chip-row wrap">
        {GALTI_REASONS.map((r: GaltiReason) => (
          <Chip key={r} active={row?.reason === r} onClick={() => setGaltiReason(qid, row?.reason === r ? undefined : r)}>
            {GALTI_REASON_LABEL[r]}
          </Chip>
        ))}
      </div>
    </div>
  )
}

async function toggleBookmark(q: Question, on: boolean) {
  if (on) await db.bookmarks.delete(q.id)
  else await db.bookmarks.put({ qid: q.id, chapter: q.chapter, at: Date.now() })
  toast(on ? 'Bookmark removed' : 'Bookmarked')
}

async function report(qid: string) {
  const text = window.prompt('What is wrong with this question? (typo, missing figure, wrong chapter…)')
  if (text?.trim()) {
    await reportQuestion(qid, text.trim())
    toast('Reported — Claude will see it during the content check')
  }
}

function Summary({ done, onAgain, onMistakes, onExit }: { done: Done[]; onAgain: () => void; onMistakes: () => void; onExit: () => void }) {
  const right = done.filter((d) => d.verdict.correct).length
  const attempted = done.filter((d) => d.verdict.attempted).length
  const time = done.reduce((a, d) => a + d.timeMs, 0)
  const pct = attempted ? Math.round((right / attempted) * 100) : 0
  return (
    <div className="practice summary">
      <div className="summary-hero">
        <PartyPopper size={44} />
        <h1>Session complete</h1>
        <p className="muted">{pct >= 80 ? 'Excellent recall. The neurons are wired!' : pct >= 50 ? 'Good work — the mistakes are now in your Galti Notebook.' : 'Tough round. Every mistake caught here is one less in JA.'}</p>
      </div>
      <div className="stats-row">
        <Stat label="Correct" value={`${right}/${done.length}`} tone="good" />
        <Stat label="Accuracy" value={`${pct}%`} tone="accent" />
        <Stat label="Time" value={formatDuration(time)} />
      </div>
      <div className="summary-actions">
        <Button variant="primary" size="lg" icon={<RotateCcw size={18} />} onClick={onAgain}>
          Practise again
        </Button>
        {done.some((d) => !d.verdict.correct) && <Button onClick={onMistakes}>Only my mistakes</Button>}
        <Button variant="ghost" onClick={onExit}>
          Done
        </Button>
      </div>
    </div>
  )
}
