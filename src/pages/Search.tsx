import { useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Search } from 'lucide-react'
import { db, type RememberRow } from '../db/db'
import { useChapters } from '../db/queries'
import { plainText } from '../ui/rich'
import { Rich } from '../ui/content'
import { Empty, TopBar } from '../ui/kit'
import { QuestionSnippet } from './Notebooks'

function rememberText(r: RememberRow): string {
  const parts = [r.title, r.topic ?? '']
  if (r.kind === 'formula') parts.push(r.latex, r.condition ?? '', r.note ?? '')
  if (r.kind === 'note') parts.push(r.body)
  if (r.kind === 'table') parts.push(...r.columns.map((c) => c.label), ...r.rows.flatMap((row) => Object.values(row)))
  if (r.kind === 'trend') parts.push(r.property, ...r.order, r.exceptions ?? '')
  return parts.map(plainText).join(' ').toLowerCase()
}

export function SearchPage() {
  const [text, setText] = useState('')
  const q = useDeferredValue(text.trim().toLowerCase())
  const chapters = useChapters()
  const name = useMemo(() => new Map(chapters.map((c) => [c.id, c.name])), [chapters])
  const index = useLiveQuery(async () => {
    const [rem, qs] = await Promise.all([db.remember.toArray(), db.questions.toArray()])
    return {
      rem: rem.map((r) => ({ r, text: rememberText(r) })),
      qs: qs.map((x) => ({
        x,
        text: [x.stem, x.topic ?? '', 'options' in x ? x.options.map((o) => o.text ?? '').join(' ') : '', 'assertion' in x ? `${x.assertion} ${x.reason}` : '', x.source?.label ?? '']
          .map(plainText)
          .join(' ')
          .toLowerCase(),
      })),
    }
  }, [])

  const words = q.split(/\s+/).filter(Boolean)
  const match = (t: string) => words.every((w) => t.includes(w))
  const chapterHits = words.length ? chapters.filter((c) => match(c.name.toLowerCase())) : []
  const remHits = words.length && index ? index.rem.filter((x) => match(x.text)).slice(0, 40) : []
  const qHits = words.length && index ? index.qs.filter((x) => match(x.text)).slice(0, 40) : []

  return (
    <div>
      <TopBar title="Search" back={false} />
      <div className="search-box">
        <Search size={18} />
        <input autoFocus type="search" placeholder="Formulas, questions, chapters…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search" />
      </div>
      {!words.length ? (
        <Empty icon={<Search />} title="Search everything">
          Try "isothermal", "parabola focus", "nitrate" or a chapter name.
        </Empty>
      ) : (
        <div className="search-results">
          {chapterHits.length > 0 && (
            <section>
              <h2 className="section-title small">Chapters</h2>
              {chapterHits.map((c) => (
                <Link key={c.id} to={`/c/${c.id}`} className="card result">
                  <b>{c.name}</b>
                </Link>
              ))}
            </section>
          )}
          {remHits.length > 0 && (
            <section>
              <h2 className="section-title small">To Remember</h2>
              {remHits.map(({ r }) => (
                <Link key={r.id} to={`/c/${r.chapter}`} className="card result">
                  <span className="muted small">{name.get(r.chapter)}</span>
                  <Rich text={r.title} />
                </Link>
              ))}
            </section>
          )}
          {qHits.length > 0 && (
            <section>
              <h2 className="section-title small">Questions</h2>
              {qHits.map(({ x }) => (
                <Link key={x.id} to={`/c/${x.chapter}?tab=practice`} className="card result">
                  <span className="muted small">{name.get(x.chapter)}</span>
                  <QuestionSnippet q={x} />
                </Link>
              ))}
            </section>
          )}
          {!chapterHits.length && !remHits.length && !qHits.length && <Empty title="No matches" />}
        </div>
      )}
    </div>
  )
}
