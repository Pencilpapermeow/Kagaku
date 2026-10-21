import { Link, useNavigate } from 'react-router-dom'
import { Atom, CalendarClock, ChevronRight, ClipboardPlus, Download, Flame, FlaskConical, NotebookPen, ShieldCheck, Sigma, Target } from 'lucide-react'
import { SUBJECTS, type SubjectId } from '../content/syllabus'
import { subjectTotals, useChapterStats, useChapters, useContentCounts, useToday } from '../db/queries'
import { useSettings } from '../db/settings'
import { Bar, Button, Ring } from '../ui/kit'
import { Logo } from '../ui/Logo'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { reviewCounts } from '../engine/review'

export const SUBJECT_ICON: Record<SubjectId, typeof Atom> = { phy: Atom, chem: FlaskConical, math: Sigma }
export const SUBJECT_COLOR: Record<SubjectId, string> = { phy: 'var(--phy)', chem: 'var(--chem)', math: 'var(--math)' }

function daysUntil(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const target = new Date(y, m - 1, d).getTime()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((target - today) / 864e5)
}

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Late night grind' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export function HomePage() {
  const settings = useSettings()
  const today = useToday()
  const chapters = useChapters()
  const stats = useChapterStats()
  const counts = useContentCounts()
  const galtiActive = useLiveQuery(() => db.galti.where('status').equals('active').count(), [], 0)
  const review = useLiveQuery(reviewCounts, [], { all: 0, care: 0 })
  const nav = useNavigate()
  const days = daysUntil(settings.examDate)
  const backupDue = counts.questions > 0 && Date.now() - (settings.lastBackupAt || settings.installedAt || Date.now()) > 7 * 864e5

  return (
    <div className="home">
      <header className="home-head">
        <div className="home-brand">
          <Logo size={40} />
          <div>
            <p className="muted">{greeting()}, Uttam</p>
            <h1>
              Kagaku <span className="kanji">科学</span>
            </h1>
          </div>
        </div>
        <Link to="/update" className="icon-btn" aria-label="Update Center">
          <Download size={20} />
        </Link>
      </header>

      {backupDue && (
        <Link to="/settings#backup" className="banner banner-warn">
          <NotebookPen size={18} />
          <span>It's been a week since your last backup. Progress lives only on this device — back it up.</span>
          <ChevronRight size={18} />
        </Link>
      )}

      {review.care > 0 && (
        <Link to="/review" className="banner banner-accent">
          <ShieldCheck size={18} />
          <span>{review.care} new item(s) need your check before you trust them.</span>
          <ChevronRight size={18} />
        </Link>
      )}

      <section className="home-top">
        <div className="card goal-card">
          <Ring value={today.answered} max={settings.dailyGoal} size={104} color="var(--cyan)">
            <b>{today.answered}</b>
            <span>/ {settings.dailyGoal}</span>
          </Ring>
          <div className="goal-text">
            <div className="eyebrow">
              <Target size={14} /> Daily goal
            </div>
            <p>{today.answered >= settings.dailyGoal ? 'Goal done! Anything more is bonus XP for your brain.' : `${settings.dailyGoal - today.answered} questions to go today.`}</p>
            <div className="streak">
              <Flame size={18} className={today.streak ? 'flame on' : 'flame'} />
              <b>{today.streak}</b> day streak
            </div>
          </div>
        </div>
        <div className="card countdown-card">
          <div className="eyebrow">
            <CalendarClock size={14} /> {settings.examName}
          </div>
          <div className="countdown">
            <b>{Math.max(0, days)}</b>
            <span>days left</span>
          </div>
          <p className="muted small">Date: {settings.examDate} (tentative — edit in Settings)</p>
        </div>
      </section>

      <section>
        <h2 className="section-title">Subjects</h2>
        <div className="subject-grid">
          {SUBJECTS.map((s) => {
            const Icon = SUBJECT_ICON[s.id]
            const t = subjectTotals(stats, chapters, s.id)
            const nCh = chapters.filter((c) => c.subject === s.id).length
            return (
              <Link key={s.id} to={`/s/${s.id}`} className="card subject-card" style={{ ['--tint' as string]: SUBJECT_COLOR[s.id] }}>
                <div className="tile">
                  <Icon size={24} />
                </div>
                <div className="subject-body">
                  <h3>{s.name}</h3>
                  <p className="muted small">
                    {nCh} chapters · {t.done}/{t.total} Qs
                  </p>
                  <Bar value={t.done} max={t.total} color={SUBJECT_COLOR[s.id]} />
                </div>
                <ChevronRight size={20} className="muted" />
              </Link>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="section-title">Quick start</h2>
        <div className="quick-grid">
          <button type="button" className="card quick" onClick={() => nav('/practice?m=mistakes')} disabled={!galtiActive}>
            <div className="tile tone-bad">
              <NotebookPen size={22} />
            </div>
            <div>
              <b>Only my mistakes</b>
              <p className="muted small">{galtiActive ? `${galtiActive} in Galti Notebook` : 'No mistakes yet'}</p>
            </div>
          </button>
          <Link to="/tests/new" className="card quick">
            <div className="tile tone-accent">
              <ClipboardPlus size={22} />
            </div>
            <div>
              <b>Create your own test</b>
              <p className="muted small">CBT, like the real exam</p>
            </div>
          </Link>
        </div>
      </section>

      {counts.questions + counts.remember === 0 && (
        <section className="card onboarding">
          <h2>No content yet</h2>
          <p className="muted">
            Content arrives as packs: Claude turns your PDFs and photos into packs, and you add them from the Update Center. You can also load a small demo pack
            to try every screen.
          </p>
          <div className="row gap">
            <Button variant="primary" icon={<Download size={18} />} onClick={() => nav('/update')}>
              Open Update Center
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
