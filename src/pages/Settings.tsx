import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, KeyRound, Moon, PackagePlus, Save, Sun, Upload } from 'lucide-react'
import { setSetting, useSettings, type Settings } from '../db/settings'
import { downloadBackup, restoreBackup } from '../db/backup'
import { fetchIndex } from '../content/sync'
import { Button, Field, TopBar, toast } from '../ui/kit'
import { InstallHelp } from '../ui/install'

function useDraft<K extends keyof Settings>(key: K) {
  const settings = useSettings()
  const [v, setV] = useState(settings[key])
  useEffect(() => setV(settings[key]), [settings, key])
  return [v, setV, () => setSetting(key, v).then(() => toast('Saved'))] as const
}

export function SettingsPage() {
  const s = useSettings()
  const [goal, setGoal, saveGoal] = useDraft('dailyGoal')
  const [examName, setExamName, saveExamName] = useDraft('examName')
  const [examDate, setExamDate, saveExamDate] = useDraft('examDate')
  const [repo, setRepo, saveRepo] = useDraft('githubRepo')
  const [token, setToken, saveToken] = useDraft('githubToken')
  const [gkey, setGkey, saveGkey] = useDraft('geminiKey')
  const [gmodel, setGmodel, saveGmodel] = useDraft('geminiModel')

  useEffect(() => {
    if (location.hash.includes('backup')) document.getElementById('backup')?.scrollIntoView()
  }, [])

  return (
    <div className="settings">
      <TopBar title="Settings" back={false} right={<Link to="/update" className="icon-btn" aria-label="Update Center"><PackagePlus size={20} /></Link>} />

      <section className="card" id="install">
        <h2 className="card-title">
          <Download size={18} /> Download the app
        </h2>
        <InstallHelp />
      </section>

      <section className="card">
        <h2 className="card-title">Look</h2>
        <div className="row gap">
          <Button variant={s.theme === 'dark' ? 'primary' : 'soft'} icon={<Moon size={18} />} onClick={() => setSetting('theme', 'dark')}>
            Dark
          </Button>
          <Button variant={s.theme === 'light' ? 'primary' : 'soft'} icon={<Sun size={18} />} onClick={() => setSetting('theme', 'light')}>
            Light
          </Button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Goals</h2>
        <div className="form-grid">
          <Field label="Daily goal (questions)">
            <input type="number" min={1} max={1000} value={goal} onChange={(e) => setGoal(Number(e.target.value) || 1)} onBlur={saveGoal} />
          </Field>
          <Field label="Exam name">
            <input value={examName} onChange={(e) => setExamName(e.target.value)} onBlur={saveExamName} />
          </Field>
          <Field label="Exam date" hint="JA 2027 isn't announced yet — change it when it is.">
            <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} onBlur={saveExamDate} />
          </Field>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Practice</h2>
        <div className="form-grid">
          <Field label="Questions per practice session">
            <input type="number" min={5} max={100} value={s.practiceSize} onChange={(e) => setSetting('practiceSize', Math.max(5, Number(e.target.value) || 20))} />
          </Field>
          <Field label="Galti: graduate after correct answers in a row">
            <select value={s.graduateAfter} onChange={(e) => setSetting('graduateAfter', Number(e.target.value))}>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </Field>
          <Field label={`"None of these" swap chance: ${Math.round(s.noneOfTheseRate * 100)}%`}>
            <input type="range" min={0} max={0.4} step={0.02} value={s.noneOfTheseRate} onChange={(e) => setSetting('noneOfTheseRate', Number(e.target.value))} />
          </Field>
        </div>
      </section>

      <section className="card" id="backup">
        <h2 className="card-title">Backup</h2>
        <p className="muted small">
          Progress, Galti Notebook, notes and test history live only on this device. Clearing browser data wipes them. Download a backup every week and keep it in
          Google Drive.
          {s.lastBackupAt ? ` Last backup: ${new Date(s.lastBackupAt).toLocaleString()}.` : ' No backup yet.'}
        </p>
        <div className="row gap wrap">
          <Button variant="primary" icon={<Download size={18} />} onClick={downloadBackup}>
            Download backup
          </Button>
          <label className="btn btn-soft btn-md">
            <Upload size={18} />
            <span>Restore from file</span>
            <input
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f || !window.confirm('Restore replaces all progress on this device with the backup. Continue?')) return
                try {
                  const r = await restoreBackup(f)
                  toast(`Restored ${r.attempts} attempts and ${r.galti} Galti entries`)
                } catch (err) {
                  toast((err as Error).message)
                }
              }}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">
          <KeyRound size={18} /> Content repo (GitHub)
        </h2>
        <p className="muted small">A read-only token for the private kagaku-content repo. It stays on this device and is never put in backups.</p>
        <div className="form-grid">
          <Field label="Repository">
            <input value={repo} onChange={(e) => setRepo(e.target.value.trim())} onBlur={saveRepo} />
          </Field>
          <Field label="Token">
            <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value.trim())} placeholder="github_pat_…" />
          </Field>
        </div>
        <div className="row gap">
          <Button icon={<Save size={18} />} onClick={saveToken}>
            Save token
          </Button>
          <Button
            variant="ghost"
            disabled={!token}
            onClick={async () => {
              try {
                const idx = await fetchIndex(repo, token)
                await saveToken()
                toast(`Connected — ${idx.packs.length} packs in the repo`)
              } catch (e) {
                toast((e as Error).message)
              }
            }}
          >
            Test connection
          </Button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">
          <KeyRound size={18} /> Gemini (optional)
        </h2>
        <p className="muted small">Only for "Ask Gemini" in Verify. Free-tier keys: Google may use the data, and limits change.</p>
        <div className="form-grid">
          <Field label="API key">
            <input type="password" autoComplete="off" value={gkey} onChange={(e) => setGkey(e.target.value.trim())} onBlur={saveGkey} />
          </Field>
          <Field label="Model name" hint="Google retires model names; change this if Gemini stops answering.">
            <input value={gmodel} onChange={(e) => setGmodel(e.target.value.trim())} onBlur={saveGmodel} />
          </Field>
        </div>
      </section>

      <p className="muted small pad center">
        Kagaku {__APP_VERSION__} · made for Uttam's JA 2027 · 科学 = science
      </p>
    </div>
  )
}
