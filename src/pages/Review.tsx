// Review screen: one new item at a time, rendered exactly as practice will show it,
// with the answer revealed. Tick it, fix the key, or report a transcription problem.

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, CheckCircle2, Flag, PartyPopper, SkipForward, Wrench } from 'lucide-react'
import { useChapters } from '../db/queries'
import { FORMAT_LABEL } from '../content/schema'
import { markReviewed, reviewQueue, type ReviewFilter, type ReviewItem } from '../engine/review'
import { reportQuestion } from '../engine/verify'
import { withFix } from '../engine/session'
import { AnswerInput } from '../ui/answer'
import { QuestionStem, Rich, MediaImage } from '../ui/content'
import { Bar, Button, Chip, Empty, TopBar, toast } from '../ui/kit'
import { VerifySheet } from '../ui/VerifySheet'
import { RememberCard } from './Chapter'

export function ReviewPage() {
  const [filter, setFilter] = useState<ReviewFilter>('care')
  const [skipped, setSkipped] = useState<string[]>([])
  const [fixing, setFixing] = useState(false)
  const chapters = useChapters()
  const queue = useLiveQuery(() => reviewQueue(filter), [filter])
  const total = useLiveQuery(async () => (await reviewQueue('all')).length, [], 0)
  useEffect(() => setSkipped([]), [filter])

  const idOf = (i: ReviewItem) => (i.kind === 'question' ? i.q.id : i.r.id)
  const rest = queue?.filter((i) => !skipped.includes(idOf(i))) ?? []
  const item = rest[0]
  const done = (queue?.length ?? 0) - rest.length

  const tick = async () => {
    if (!item) return
    await markReviewed(idOf(item), true)
  }
  const report = async () => {
    if (!item) return
    const text = window.prompt('What is wrong? (a symbol, a number, an option, the chapter…)')
    if (!text?.trim()) return
    await reportQuestion(idOf(item), text.trim())
    setSkipped((s) => [...s, idOf(item)])
    toast('Reported — Claude fixes it in the next content check')
  }

  const x = item && (item.kind === 'question' ? item.q : item.r)
  const chapterName = x && chapters.find((c) => c.id === x.chapter)
  const q = item?.kind === 'question' ? withFix(item.q, item.meta) : undefined

  return (
    <div className="review-page">
      <TopBar title="Review new content" sub={`${total} waiting for your tick`} back="/update" />
      <div className="chip-row">
        <Chip active={filter === 'care'} onClick={() => setFilter('care')}>
          Needs care first
        </Chip>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
          Everything new
        </Chip>
      </div>
      {!queue ? null : !item ? (
        <Empty icon={<PartyPopper />} title={filter === 'care' ? 'Nothing needs special care' : 'All caught up'}>
          {filter === 'care' && total > 0 ? 'Switch to "Everything new" to tick the rest.' : 'Every item has your tick.'}
        </Empty>
      ) : (
        <>
          <div className="review-progress">
            <Bar value={done} max={queue.length} color="var(--good)" />
            <span className="muted small">
              {done + 1} / {queue.length}
            </span>
          </div>
          <article className="card review-card">
            <div className="pcard-meta">
              <span className="pill">{item.kind === 'question' ? FORMAT_LABEL[item.q.format] : 'To Remember'}</span>
              <span className="muted small">
                {chapterName ? `Ch ${chapterName.no ?? '–'} · ${chapterName.name}` : x!.chapter}
              </span>
              {x!.source?.label && <span className="muted small">· {x!.source.label}</span>}
              {x!.verified === 'unverified' && <span className="pill pill-warn">answer not from an official key</span>}
              {item.meta?.reports?.length ? <span className="pill pill-bad">reported</span> : null}
            </div>
            {x!.uncertain && (
              <div className="uncertain">
                <AlertTriangle size={16} />
                <span>
                  <b>Check this:</b> {x!.uncertain}
                </span>
              </div>
            )}
            {q ? (
              <>
                <QuestionStem q={q} />
                <AnswerInput q={q} value={undefined} onChange={() => {}} reveal variant="cbt" />
                {(q.solution || q.solutionImage) && (
                  <div className="solution">
                    <Rich text={q.solution} />
                    <MediaImage src={q.solutionImage} />
                  </div>
                )}
              </>
            ) : (
              item.kind === 'remember' && <RememberCard r={item.r} hide={false} />
            )}
          </article>
          <div className="review-actions">
            <Button variant="good" size="lg" icon={<CheckCircle2 size={20} />} onClick={tick}>
              Looks right
            </Button>
            {q && (
              <Button variant="danger" icon={<Wrench size={18} />} onClick={() => setFixing(true)}>
                Fix answer
              </Button>
            )}
            <Button icon={<Flag size={18} />} onClick={report}>
              Report
            </Button>
            <Button variant="ghost" icon={<SkipForward size={18} />} onClick={() => setSkipped((s) => [...s, idOf(item)])}>
              Later
            </Button>
          </div>
          {q && (
            <VerifySheet
              open={fixing}
              onClose={() => setFixing(false)}
              shown={q}
              onFixed={() => {
                markReviewed(q.id, false)
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
