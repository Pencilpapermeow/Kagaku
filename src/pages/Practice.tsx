// Practice: the cute, light mood. Big option cards, small animations, a combo streak.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bookmark, BookmarkCheck, Flag, Flame, PartyPopper, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { db, GALTI_REASONS, GALTI_REASON_LABEL, type GaltiReason } from '../db/db'
import { getSetting, setSetting, useSettings } from '../db/settings'
import { useChapters } from '../db/queries'
import { FORMAT_LABEL, type Question, type QuestionFormat } from '../content/schema'
import { answerInWords, check, isEmpty, type Response, type Verdict } from '../engine/marking'
import { buildSlots, type PracticeMode } from '../engine/session'
import { LEVEL_UP_AFTER, levelKey, materialize, repeatOf, repeatPosition, startLevel, stepLevel, type LevelState, type Slot } from '../engine/adaptive'
import { clampLevel, LEVEL_NAME, levelOf, MAX_LEVEL, type Level } from '../engine/generate'
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
  const lvKey = levelKey(chapterIds)
  const [seed, setSeed] = useState(randomSeed)
  const [slots, setSlots] = useState<Slot[]>()
  const [i, setI] = useState(0)
  const [q, setQ] = useState<Question>()
  const [response, setResponse] = useState<Response>()
  const [verdict, setVerdict] = useState<Verdict>()
  const [done, setDone] = useState<Done[]>([])
  const [combo, setCombo] = useState(0)
  const [lv, setLv] = useState<LevelState>(startLevel(1))
  const [peak, setPeak] = useState<Level>(1)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [cheer, setCheer] = useState('')
  const started = useRef(Date.now())
  const rng = useRef(makeRng(seed ^ 0x9e3779b9))
  const shownSlot = useRef<Slot>(undefined)

  useEffect(() => {
    let alive = true
    Promise.all([buildSlots({ chapters: chapterIds, mode, format, size: settings.practiceSize, seed }), getSetting('practiceLevels')]).then(([list, levels]) => {
      if (!alive) return
      const level = clampLevel(levels?.[lvKey] ?? 1)
      rng.current = makeRng(seed ^ 0x9e3779b9)
      shownSlot.current = undefined
      setLv(startLevel(level))
      setPeak(level)
      setSlots(list)
      setI(0)
      setQ(undefined)
      setDone([])
      setCombo(0)
    })
    return () => {
      alive = false
    }
  }, [seed, mode, format, params.get('c'), settings.practiceSize])

  // Make the question for the current place when it is reached, at the level reached by then
  // (before paint, so moving on never flashes an empty screen).
  useLayoutEffect(() => {
    if (!slots || i >= slots.length) return
    const slot = slots[i]
    if (shownSlot.current === slot) return
    const made = materialize(slot, lv.level, rng.current, format)
    if (!made) {
      setSlots((list) => list?.filter((x) => x !== slot))
      return
    }
    shownSlot.current = slot
    setQ(presentQuestion(made, rng.current, { noneOfTheseRate: settings.noneOfTheseRate }))
    setResponse(undefined)
    setVerdict(undefined)
    started.current = Date.now()
  }, [slots, i])

  const bookmarked = useLiveQuery(async () => (q ? !!(await db.bookmarks.get(q.id)) : false), [q?.id], false)
  const galtiRow = useLiveQuery(async () => (q ? db.galti.get(q.id) : undefined), [q?.id])
  const meta = useLiveQuery(async () => (q ? db.qmeta.get(q.id) : undefined), [q?.id])
  const hasFacts = useMemo(() => !!slots?.some((x) => x.type === 'fact'), [slots])

  const submit = useCallback(async () => {
    if (!q || verdict || !slots) return
    const v = check(q, response)
    const timeMs = Date.now() - started.current
    setVerdict(v)
    setDone((d) => [...d, { q, verdict: v, timeMs }])
    setCombo((c) => (v.correct ? c + 1 : 0))
    setCheer(v.correct ? CHEERS[Math.floor(Math.random() * CHEERS.length)] : '')
    const slot = slots[i]
    if (slot?.type === 'fact') {
      const { next, change } = stepLevel(lv, v)
      setLv(next)
      if (change) {
        setPeak((p) => (next.level > p ? next.level : p))
        toast(change === 'up' ? `⬆ Level ${next.level} · ${LEVEL_NAME[next.level]}` : `Level ${next.level} · ${LEVEL_NAME[next.level]} — steady now`)
        getSetting('practiceLevels').then((all) => setSetting('practiceLevels', { ...all, [lvKey]: next.level }))
      }
      if (!v.correct) {
        const again = repeatOf(slot, q, response)
        if (again)
          setSlots((list) => {
            if (!list) return list
            const at = repeatPosition(i, list.length, rng.current)
            return [...list.slice(0, at), again, ...list.slice(at)]
          })
      }
    }
    const { graduated } = await recordAttempt({ q, qid: q.id, verdict: v, response, mode: mode === 'mistakes' ? 'galti' : 'practice', timeMs })
    if (graduated) toast('🎓 Graduated from the Galti Notebook!')
  }, [q, response, verdict, mode, slots, i, lv, lvKey])

  const next = () => setI((x) => x + 1)
  const chapterName = useMemo(() => new Map(chapters.map((c) => [c.id, c.name])), [chapters])

  if (!slots) return <div className="practice loading" />
  if (!slots.length)
    return (
      <div className="practice">
        <PracticeHeader onClose={() => nav(-1)} progress={0} total={0} combo={0} />
        <Empty title="Nothing to practise here">{mode === 'mistakes' ? 'No active mistakes — wonderful.' : 'Add content packs from the Update Center first.'}</Empty>
      </div>
    )

  if (i >= slots.length)
    return (
      <Summary
        done={done}
        peak={hasFacts ? peak : undefined}
        onAgain={() => setSeed(randomSeed())}
        onMistakes={() => nav('/practice?m=mistakes' + (chapterIds ? `&c=${chapterIds.join(',')}` : ''))}
        onExit={() => nav(-1)}
      />
    )
  if (!q || shownSlot.current !== slots[i]) return <div className="practice loading" />

  const empty = isEmpty(response)
  const generated = q.tags.includes('generated')
  const wrongish = !!verdict && !verdict.correct
  return (
    <div className="practice">
      <PracticeHeader
        onClose={() => (done.length && !window.confirm('Leave this practice session?') ? null : nav(-1))}
        progress={i + (verdict ? 1 : 0)}
        total={slots.length}
        combo={combo}
        level={hasFacts ? lv : undefined}
      />
      <div className={cx('pcard', verdict && (verdict.correct ? 'is-right' : 'is-wrong'))} key={q.id + i}>
        <div className="pcard-meta">
          <span className="pill">{FORMAT_LABEL[q.format]}</span>
          <span className="muted small">{chapterName.get(q.chapter)}</span>
          {q.source?.label && <span className="muted small">· {q.source.label}</span>}
          {generated && <span className="pill pill-accent">To Remember{levelOf(q) ? ` · Lv ${levelOf(q)}` : ''}</span>}
          {q.tags.includes('repeat') && <span className="pill pill-warn">Again — you missed this</span>}
          {!isTrusted(q.verified, meta) && <span className="pill pill-warn">key unverified</span>}
          {galtiRow?.status === 'active' && <span className="pill pill-bad">Galti · {galtiRow.streak}/{settings.graduateAfter}</span>}
        </div>
        <QuestionStem q={q} />
        <AnswerInput q={q} value={response} onChange={setResponse} reveal={!!verdict} />
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
              'Not quite.'
            )}
          </div>
          {wrongish && (
            <div className="right-answer">
              <span className="muted small">Correct answer</span>
              <Rich text={answerInWords(q)} />
            </div>
          )}
          {(q.solution || q.solutionImage) &&
            (wrongish ? (
              <div className="solution">
                <span className="muted small">Why</span>
                <Rich text={q.solution} />
                <MediaImage src={q.solutionImage} />
              </div>
            ) : (
              <details className="solution">
                <summary className="muted small">Why? (tap)</summary>
                <Rich text={q.solution} />
                <MediaImage src={q.solutionImage} />
              </details>
            ))}
          {generated && wrongish && <p className="muted small again-note">This will come back in a few questions, asked another way.</p>}
          {!verdict.correct && verdict.attempted && <ReasonChips qid={q.id} />}
        </div>
      )}

      <footer className="pfoot">
        <div className="pfoot-tools">
          <button type="button" className="icon-btn" aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'} onClick={() => toggleBookmark(q, bookmarked)}>
            {bookmarked ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
          </button>
          <button type="button" className="icon-btn" aria-label="Verify answer key" onClick={() => setVerifyOpen(true)}>
            <ShieldCheck size={20} />
          </button>
          <button type="button" className="icon-btn" aria-label="Report a problem" onClick={() => report(q.id)}>
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
              {i + 1 < slots.length ? 'Next' : 'Finish'}
            </Button>
          </div>
        )}
      </footer>
      <VerifySheet
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        shown={q}
        response={response}
        onFixed={(nowCorrect) => nowCorrect && setVerdict((v) => (v ? { ...v, correct: true, partial: false } : v))}
      />
    </div>
  )
}

function PracticeHeader({ onClose, progress, total, combo, level }: { onClose: () => void; progress: number; total: number; combo: number; level?: LevelState }) {
  return (
    <header className="phead">
      <button type="button" className="icon-btn" aria-label="Close practice" onClick={onClose}>
        <X size={22} />
      </button>
      <Bar value={progress} max={total} color="linear-gradient(90deg, var(--accent), var(--cyan))" />
      {level && (
        <div className={cx('lv', `lv-${level.level}`)} aria-label={`Level ${level.level}, ${LEVEL_NAME[level.level]}. ${level.rightRun} of ${LEVEL_UP_AFTER} right in a row towards the next level.`} title={LEVEL_NAME[level.level]}>
          <b>Lv {level.level}</b>
          {level.level < MAX_LEVEL &&
            Array.from({ length: LEVEL_UP_AFTER }, (_, k) => <i key={k} className={k < level.rightRun ? 'on' : undefined} />)}
        </div>
      )}
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

function Summary({ done, peak, onAgain, onMistakes, onExit }: { done: Done[]; peak?: Level; onAgain: () => void; onMistakes: () => void; onExit: () => void }) {
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
        {peak && <Stat label="Top level" value={`${peak} · ${LEVEL_NAME[peak]}`} tone="accent" />}
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
