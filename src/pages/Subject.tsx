import { useMemo } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronRight, NotebookPen } from 'lucide-react'
import { SUBJECTS, getSubject, type SubjectId } from '../content/syllabus'
import { useChapterStats, useChapters } from '../db/queries'
import { Bar, Chip, Tabs, TopBar } from '../ui/kit'
import { SUBJECT_COLOR } from './Home'

export function SubjectPage() {
  const { subject = 'phy' } = useParams()
  const sid = (SUBJECTS.some((s) => s.id === subject) ? subject : 'phy') as SubjectId
  const s = getSubject(sid)
  const [params, setParams] = useSearchParams()
  const unit = params.get('unit') ?? ''
  const cls = params.get('class') ?? ''
  const nav = useNavigate()
  const chapters = useChapters()
  const stats = useChapterStats()

  const list = useMemo(
    () => chapters.filter((c) => c.subject === sid && (!unit || c.unit === unit) && (!cls || String(c.cls) === cls)),
    [chapters, sid, unit, cls],
  )
  const setFilter = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  return (
    <div style={{ ['--tint' as string]: SUBJECT_COLOR[sid] }}>
      <TopBar title={s.name} sub={`${list.length} chapters`} back="/" />
      <Tabs value={sid} onChange={(v) => nav(`/s/${v}`, { replace: true })} items={SUBJECTS.map((x) => ({ id: x.id, label: x.name }))} className="tabs-subject" />
      <div className="filters">
        <div className="chip-row" aria-label="Units">
          <Chip active={!unit} onClick={() => setFilter('unit', '')}>
            All units
          </Chip>
          {s.units.map((u) => (
            <Chip key={u.id} active={unit === u.id} onClick={() => setFilter('unit', u.id)}>
              {u.name}
            </Chip>
          ))}
        </div>
        <div className="chip-row" aria-label="Class">
          {['', '11', '12'].map((c) => (
            <Chip key={c} active={cls === c} onClick={() => setFilter('class', c)}>
              {c ? `Class ${c}` : 'Both classes'}
            </Chip>
          ))}
        </div>
      </div>
      <ol className="chapter-list">
        {list.map((c) => {
          const st = stats?.get(c.id)
          const unitName = s.units.find((u) => u.id === c.unit)?.name ?? c.unit
          return (
            <li key={c.id}>
              <Link to={`/c/${c.id}`} className="chapter-row">
                <span className="chapter-n" title={c.no ? `Chapter ${c.no}` : 'Number not confirmed yet'}>
                  {c.no ?? '–'}
                </span>
                <span className="chapter-main">
                  <b>{c.name}</b>
                  <span className="muted small">
                    {unitName} · Class {c.cls} · {st?.remember ?? 0} to remember
                  </span>
                  <Bar value={st?.done ?? 0} max={st?.total ?? 0} color="var(--tint)" />
                </span>
                <span className="chapter-side">
                  <span className="count">
                    {st?.done ?? 0}/{st?.total ?? 0}
                  </span>
                  {st?.galti ? (
                    <span className="galti-pill" title="Active mistakes">
                      <NotebookPen size={12} /> {st.galti}
                    </span>
                  ) : null}
                </span>
                <ChevronRight size={18} className="muted" />
              </Link>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
