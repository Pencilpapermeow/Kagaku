import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, KeyRound, Moon, PackagePlus, RefreshCw, Save, Sun, Upload } from 'lucide-react'
import { setSetting, useSettings, type Settings } from '../db/settings'
import { downloadBackup, restoreBackup } from '../db/backup'
import { fetchIndex } from '../content/sync'
import { Button, Field, TopBar, toast } from '../ui/kit'
import { InstallHelp } from '../ui/install'
import { lastSyncAt, syncNow, useSyncStatus } from '../sync/status'

function useDraft<K extends keyof Settings>(key: K) {
  const settings = useSettings()
  const [v, setV] = useState(settings[key])
  useEffect(() => {
    setV(settings[key])
  }, [settings, key])
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
        <p className="muted small">
          A token for the private kagaku-content repo. Reading is enough for packs; sync between devices also needs it to write. It stays on this device and is never put in
          backups.
        </p>
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

      <SyncCard />

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
        Kagaku {__APP_VERSION__} · made for Uttam's JA 2027
      </p>
    </div>
  )
}

function ago(t: number): string {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(t).toLocaleString()
}

function SyncCard() {
  const s = useSettings()
  const st = useSyncStatus()
  const [last, setLast] = useState<number>()
  // Shown at once; the saved setting catches up a moment later.
  const [on, setOn] = useState<boolean>()
  useEffect(() => {
    void lastSyncAt().then(setLast)
  }, [st.lastAt])
  const r = st.report
  const run = async () => {
    try {
      const rep = await syncNow()
      if (rep) toast(rep.pulled + rep.pushed + rep.removedHere + rep.removedThere ? `Synced: ${rep.pulled} arrived, ${rep.pushed} sent` : 'Already in sync')
    } catch (e) {
      toast((e as Error).message)
    }
  }
  return (
    <section className="card" id="sync">
      <h2 className="card-title">
        <RefreshCw size={18} /> Sync between devices
      </h2>
      <p className="muted small">
        Handwritten points, typed notes, papers from "Test from paper" (with their pictures) and packs you added by paste or file go to your private repo and appear
        on your other devices. Practice, Galti and test results still stay on each device.
      </p>
      <label className="check-row">
        <input
          type="checkbox"
          checked={on ?? s.syncEnabled}
          disabled={!s.githubToken}
          onChange={async (e) => {
            const v = e.target.checked
            setOn(v)
            await setSetting('syncEnabled', v)
            if (v) void run()
          }}
        />
        <span>Sync this device automatically</span>
      </label>
      {!s.githubToken && <p className="warn-text small">Add the token in "Content repo" above first.</p>}
      <p className="muted small" data-testid="sync-status">
        {st.running ? 'Syncing…' : last ? `Last synced ${ago(last)}` : 'Not synced yet'}
        {r && !st.running && r.pulled + r.pushed > 0 ? ` · ${r.pulled} arrived, ${r.pushed} sent` : ''}
        {r?.copies ? ` · ${r.copies} card(s) changed on both devices were kept twice` : ''}
      </p>
      {st.error && <p className="warn-text small">{st.error}</p>}
      <Button icon={<RefreshCw size={18} />} disabled={!s.githubToken || st.running} onClick={run}>
        Sync now
      </Button>
    </section>
  )
}
