// "Create your own test": Subject → Chapters → Preferences, like the PW stepper.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { SUBJECTS, getSubject, type SubjectId } from '../content/syllabus'
import { FORMATS, FORMAT_LABEL, type MarkingScheme, type QuestionFormat } from '../content/schema'
import { useChapterStats, useChapters } from '../db/queries'
import { createTest } from '../engine/cbt'
import { SCHEME_PRESETS } from '../engine/marking'
import { pickTestQuestions } from '../engine/session'
import { randomSeed } from '../engine/rng'
import { Button, Chip, Field, TopBar, cx, toast } from '../ui/kit'

export function TestBuilderPage() {
  const nav = useNavigate()
  const chapters = useChapters()
  const stats = useChapterStats()
  const [step, setStep] = useState(1)
  const [subjects, setSubjects] = useState<SubjectId[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [count, setCount] = useState(20)
  const [minutes, setMinutes] = useState(40)
  const [schemeId, setSchemeId] = useState('ja')
  const [scheme, setScheme] = useState<MarkingScheme>(SCHEME_PRESETS[0])
  const [generated, setGenerated] = useState(true)
  const [formats, setFormats] = useState<QuestionFormat[]>([])
  const [busy, setBusy] = useState(false)

  const available = useMemo(() => chapters.filter((c) => subjects.includes(c.subject)), [chapters, subjects])
  const pool = picked.reduce((a, id) => a + (stats?.get(id)?.total ?? 0), 0)

  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x])

  const start = async () => {
    setBusy(true)
    const qs = await pickTestQuestions({ chapters: picked, count, includeGenerated: generated, formats, seed: randomSeed() })
    setBusy(false)
    if (!qs.length) return toast('No questions in these chapters yet')
    // One section per subject, in Physics → Chemistry → Maths order, as in JA.
    const sections = SUBJECTS.map((s) => ({ name: s.name, questions: qs.filter((q) => q.chapter.startsWith(`${s.id}.`)), scheme })).filter((s) => s.questions.length)
    const t = await createTest({ title: `Custom test · ${qs.length} Qs`, kind: 'custom', durationMin: minutes, sections })
    nav(`/test/${t.id}`, { replace: true })
  }

  const setRule = (f: QuestionFormat, k: 'correct' | 'wrong', v: number) =>
    setScheme((s) => ({ ...s, id: undefined, name: 'Custom', rules: { ...s.rules, [f]: { ...(s.rules[f] ?? { correct: 4, wrong: 0, unattempted: 0, partial: false }), [k]: v } } }))

  return (
    <div>
      <TopBar title="Create your own test" />
      <ol className="stepper">
        {['Subject', 'Chapters', 'Preferences'].map((label, i) => (
          <li key={label} className={cx(step > i + 1 && 'done', step === i + 1 && 'current')}>
            <span className="step-dot">{step > i + 1 ? <Check size={14} /> : i + 1}</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="builder">
          <h2 className="section-title">Select subjects</h2>
          <div className="pick-grid">
            {SUBJECTS.map((s) => (
              <button key={s.id} type="button" className={cx('card pick', subjects.includes(s.id) && 'active')} onClick={() => setSubjects(toggle(subjects, s.id))}>
                <b>{s.name}</b>
                {subjects.includes(s.id) && <Check size={18} />}
              </button>
            ))}
          </div>
          <div className="builder-foot">
            <Button variant="primary" size="lg" disabled={!subjects.length} onClick={() => setStep(2)}>
              Next
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="builder">
          <div className="row between">
            <h2 className="section-title">Select chapters</h2>
            <span className="pill">
              {picked.length}/{available.length} selected
            </span>
          </div>
          {subjects.map((sid) => (
            <div key={sid}>
              <div className="row between">
                <h3 className="topic-title">{getSubject(sid).name}</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const ids = available.filter((c) => c.subject === sid).map((c) => c.id)
                    const all = ids.every((id) => picked.includes(id))
                    setPicked(all ? picked.filter((p) => !ids.includes(p)) : [...new Set([...picked, ...ids])])
                  }}
                >
                  Select all
                </Button>
              </div>
              <div className="pick-grid">
                {available
                  .filter((c) => c.subject === sid)
                  .map((c) => (
                    <button key={c.id} type="button" className={cx('card pick pick-chapter', picked.includes(c.id) && 'active')} onClick={() => setPicked(toggle(picked, c.id))}>
                      <span>
                        <b>{c.name}</b>
                        <span className="muted small">{stats?.get(c.id)?.total ?? 0} Questions</span>
                      </span>
                      <span className={cx('checkbox', picked.includes(c.id) && 'on')}>{picked.includes(c.id) && <Check size={14} />}</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
          <div className="builder-foot">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button variant="primary" size="lg" disabled={!picked.length} onClick={() => setStep(3)}>
              Next
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="builder">
          <p className="muted small">{pool} stored questions in the chosen chapters{generated ? ', plus questions generated from To Remember' : ''}.</p>
          <div className="form-grid">
            <Field label="Number of questions">
              <input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} />
            </Field>
            <Field label="Time (minutes)">
              <input type="number" min={1} max={600} value={minutes} onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))} />
            </Field>
          </div>
          <label className="switch-row">
            <input type="checkbox" checked={generated} onChange={(e) => setGenerated(e.target.checked)} />
            <span>Include questions generated from tables & trends</span>
          </label>
          <h3 className="section-title small">Formats (none selected = all)</h3>
          <div className="chip-row wrap">
            {FORMATS.map((f) => (
              <Chip key={f} active={formats.includes(f)} onClick={() => setFormats(toggle(formats, f))}>
                {FORMAT_LABEL[f]}
              </Chip>
            ))}
          </div>
          <h3 className="section-title small">Marking scheme</h3>
          <div className="chip-row wrap">
            {SCHEME_PRESETS.map((p) => (
              <Chip
                key={p.id}
                active={schemeId === p.id}
                onClick={() => {
                  setSchemeId(p.id!)
                  setScheme(p)
                }}
              >
                {p.name}
              </Chip>
            ))}
          </div>
          <div className="table-wrap">
            <table className="rtable scheme-table">
              <thead>
                <tr>
                  <th>Format</th>
                  <th>Correct</th>
                  <th>Wrong</th>
                </tr>
              </thead>
              <tbody>
                {FORMATS.map((f) => (
                  <tr key={f}>
                    <td>
                      {FORMAT_LABEL[f]}
                      {scheme.rules[f]?.partial && <span className="muted small"> (partial)</span>}
                    </td>
                    <td>
                      <input type="number" value={scheme.rules[f]?.correct ?? 0} onChange={(e) => (setSchemeId(''), setRule(f, 'correct', Number(e.target.value)))} />
                    </td>
                    <td>
                      <input type="number" value={scheme.rules[f]?.wrong ?? 0} onChange={(e) => (setSchemeId(''), setRule(f, 'wrong', Number(e.target.value)))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="builder-foot">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button variant="primary" size="lg" onClick={start} disabled={busy}>
              Start test
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
