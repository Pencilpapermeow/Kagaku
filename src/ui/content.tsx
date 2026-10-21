// Rendering of content: rich text, images from IndexedDB, question stems.

import { memo, useEffect, useState } from 'react'
import { db } from '../db/db'
import { renderMath, renderRich } from './rich'
import { cx } from './kit'
import type { Passage, Question } from '../content/schema'

export const Rich = memo(function Rich({ text, className, as: Tag = 'div' }: { text?: string; className?: string; as?: 'div' | 'span' }) {
  return <Tag className={cx('rich', className)} dangerouslySetInnerHTML={{ __html: renderRich(text) }} />
})

export const MathBlock = memo(function MathBlock({ tex, className }: { tex: string; className?: string }) {
  return <div className={cx('math-block', className)} dangerouslySetInnerHTML={{ __html: renderMath(tex, true) }} />
})

const urlCache = new Map<string, string>()

export async function mediaBlob(ref: string): Promise<Blob | undefined> {
  if (ref.startsWith('media:')) return (await db.media.get(ref.slice(6)))?.blob
  if (ref.startsWith('data:')) return (await fetch(ref)).blob()
  return undefined
}

export function useMediaUrl(ref: string | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => (ref ? (ref.startsWith('data:') ? ref : urlCache.get(ref)) : undefined))
  useEffect(() => {
    let alive = true
    if (!ref) return setUrl(undefined)
    if (ref.startsWith('data:')) return setUrl(ref)
    const hit = urlCache.get(ref)
    if (hit) return setUrl(hit)
    mediaBlob(ref).then((b) => {
      if (!b || !alive) return
      const u = URL.createObjectURL(b)
      urlCache.set(ref, u)
      setUrl(u)
    })
    return () => {
      alive = false
    }
  }, [ref])
  return url
}

export function MediaImage({ src, alt = '', className }: { src?: string; alt?: string; className?: string }) {
  const url = useMediaUrl(src)
  if (!src) return null
  return url ? <img className={cx('media', className)} src={url} alt={alt} loading="lazy" /> : <div className={cx('media media-loading', className)} />
}

export function PassageView({ passage }: { passage: Passage }) {
  return (
    <div className="passage">
      <div className="passage-label">{passage.title ?? 'Passage'}</div>
      <Rich text={passage.text} />
      <MediaImage src={passage.image} alt="Passage figure" />
    </div>
  )
}

export function usePassage(id: string | undefined): Passage | undefined {
  const [p, setP] = useState<Passage>()
  useEffect(() => {
    if (!id) return setP(undefined)
    db.passages.get(id).then(setP)
  }, [id])
  return p
}

/** Question text, diagram, assertion/reason. Answer inputs are separate (see answer.tsx). */
export function QuestionStem({ q }: { q: Question }) {
  const passage = usePassage(q.passage)
  return (
    <div className="stem">
      {passage && <PassageView passage={passage} />}
      {q.stem && <Rich text={q.stem} className="stem-text" />}
      {q.format === 'assertion' && (
        <div className="ar">
          <div>
            <b>Assertion (A):</b> <Rich as="span" text={q.assertion} />
          </div>
          <div>
            <b>Reason (R):</b> <Rich as="span" text={q.reason} />
          </div>
        </div>
      )}
      {q.image && <MediaImage src={q.image} alt="Diagram" className="stem-img" />}
    </div>
  )
}
