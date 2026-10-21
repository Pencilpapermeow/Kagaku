import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ClipboardCopy, ClipboardPaste, CloudDownload, FileUp, HardDrive, PackageCheck, Sparkles, Trash2 } from 'lucide-react'
import { db } from '../db/db'
import { useSettings } from '../db/settings'
import { useChapters } from '../db/queries'
import { allChapters, commitPack, preparePack, readPackSource, removePack, type PackPreview } from '../content/importer'
import { compareWithInstalled, downloadPack, fetchIndex, type RemoteStatus } from '../content/sync'
import { packPrompt } from '../content/prompt'
import { DEMO_PACK } from '../content/demo'
import { Button, Empty, Sheet, TopBar, formatBytes, toast } from '../ui/kit'

export function UpdatePage() {
  const settings = useSettings()
  const chapters = useChapters()
  const packs = useLiveQuery(() => db.packs.orderBy('importedAt').reverse().toArray(), [])
  const [paste, setPaste] = useState('')
  const [preview, setPreview] = useState<PackPreview>()
  const [via, setVia] = useState<'file' | 'paste'>('paste')
  const [busy, setBusy] = useState(false)
  const [remote, setRemote] = useState<RemoteStatus[]>()
  const [remoteErr, setRemoteErr] = useState<string>()

  const check = async (input: Blob | string, how: 'file' | 'paste') => {
    setBusy(true)
    try {
      const src = await readPackSource(input)
      setPreview(await preparePack(src, { knownChapters: await allChapters() }))
      setVia(how)
    } catch (e) {
      setPreview({ ok: false, issues: [{ level: 'error', path: '', message: (e as Error).message }] })
    } finally {
      setBusy(false)
    }
  }
  const add = async () => {
    if (!preview?.prepared) return
    setBusy(true)
    const row = await commitPack(preview.prepared, via)
    setBusy(false)
    setPreview(undefined)
    setPaste('')
    toast(`Added "${row.title}": ${row.counts.questions} questions, ${row.counts.remember} to remember`)
  }
  const sync = async () => {
    setRemoteErr(undefined)
    setBusy(true)
    try {
      setRemote(await compareWithInstalled(await fetchIndex(settings.githubRepo, settings.githubToken)))
    } catch (e) {
      setRemoteErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const install = async (items: RemoteStatus[]) => {
    setBusy(true)
    let ok = 0
    for (const it of items) {
      try {
        const { preview: p } = await downloadPack(settings.githubRepo, settings.githubToken, it.entry)
        if (p.ok) ok++
        else toast(`${it.entry.title}: ${p.issues[0]?.message}`)
      } catch (e) {
        toast((e as Error).message)
      }
    }
    setBusy(false)
    toast(`${ok} pack(s) installed`)
    sync()
  }

  return (
    <div>
      <TopBar title="Update Center" sub="Add content packs" />

      <section className="card">
        <h2 className="card-title">
          <CloudDownload size={20} /> From your content repo
        </h2>
        {settings.githubToken ? (
          <>
            <p className="muted small">{settings.githubRepo}</p>
            <div className="row gap wrap">
              <Button variant="primary" onClick={sync} disabled={busy}>
                Check for new packs
              </Button>
              {remote?.some((r) => r.state !== 'installed') && (
                <Button onClick={() => install(remote.filter((r) => r.state !== 'installed'))} disabled={busy}>
                  Install all new ({remote.filter((r) => r.state !== 'installed').length})
                </Button>
              )}
            </div>
            {remoteErr && <p className="bad-text small">{remoteErr}</p>}
            {remote && (
              <ul className="remote-list">
                {remote.map((r) => (
                  <li key={r.entry.id}>
                    <span>
                      <b>{r.entry.title}</b>
                      <span className="muted small"> · {formatBytes(r.entry.bytes)}</span>
                    </span>
                    {r.state === 'installed' ? (
                      <span className="pill">Installed</span>
                    ) : (
                      <Button size="sm" onClick={() => install([r])} disabled={busy}>
                        {r.state === 'new' ? 'Install' : 'Update'}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="muted small">
            Add your read-only GitHub token in <Link to="/settings">Settings</Link> once the private repo is ready. Until then, add packs by file or paste.
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">
          <ClipboardPaste size={20} /> Paste or open a pack
        </h2>
        <p className="muted small">Paste the JSON a Claude Project (or any AI) gave you, or open a .kagaku / .json file.</p>
        <textarea className="paste" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='```json { "format": "kagaku-pack", … } ```' />
        <div className="row gap wrap">
          <Button variant="primary" onClick={() => check(paste, 'paste')} disabled={!paste.trim() || busy}>
            Check pasted pack
          </Button>
          <label className="btn btn-soft btn-md">
            <FileUp size={18} />
            <span>Open file</span>
            <input
              type="file"
              accept=".kagaku,.json,.zip,application/json,application/zip"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) check(f, 'file')
                e.target.value = ''
              }}
            />
          </label>
          <Button
            variant="ghost"
            icon={<ClipboardCopy size={18} />}
            onClick={async () => {
              await navigator.clipboard?.writeText(packPrompt(chapters))
              toast('Prompt copied — paste it into any AI chat with your material')
            }}
          >
            Copy prompt for any AI
          </Button>
        </div>
        {!packs?.some((p) => p.id === 'demo') && (
          <Button variant="ghost" icon={<Sparkles size={18} />} onClick={() => check(JSON.stringify(DEMO_PACK), 'paste')}>
            Load the demo pack
          </Button>
        )}
      </section>

      <StorageCard />

      <section>
        <h2 className="section-title">
          <PackageCheck size={18} /> Installed packs
        </h2>
        {packs?.length ? (
          <div className="pack-list">
            {packs.map((p) => (
              <div key={p.id} className="card pack-row">
                <div>
                  <b>{p.title}</b>
                  <p className="muted small">
                    {p.counts.questions} questions · {p.counts.remember} to remember · {p.counts.media} images · {formatBytes(p.bytes)} · {p.via}
                  </p>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${p.title}`}
                  onClick={async () => {
                    if (window.confirm(`Remove "${p.title}"? Your progress and Galti entries stay.`)) {
                      await removePack(p.id)
                      toast('Pack removed')
                    }
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No packs yet" />
        )}
      </section>

      <Sheet open={!!preview} onClose={() => setPreview(undefined)} title={preview?.summary?.title ?? 'Pack check'}>
        {preview && <PreviewBody preview={preview} onAdd={add} busy={busy} />}
      </Sheet>
    </div>
  )
}

function PreviewBody({ preview, onAdd, busy }: { preview: PackPreview; onAdd: () => void; busy: boolean }) {
  const s = preview.summary
  const errors = preview.issues.filter((i) => i.level === 'error')
  const warnings = preview.issues.filter((i) => i.level === 'warning')
  return (
    <div className="preview">
      {s && (
        <>
          <p>
            <b>{s.questions}</b> questions · <b>{s.remember}</b> to remember · <b>{s.passages}</b> passages · <b>{s.papers}</b> papers · <b>{s.media}</b> images
          </p>
          {s.alreadyInstalled && <p className="warn-text small">This pack is already installed — adding it again replaces the old copy.</p>}
          <ul className="per-chapter">
            {s.perChapter.map((c) => (
              <li key={c.chapter}>
                {c.name}: {c.questions} Q · {c.remember} R
              </li>
            ))}
          </ul>
        </>
      )}
      {errors.length > 0 && (
        <div className="issues bad">
          <b>
            <AlertTriangle size={16} /> {errors.length} problem(s) — fix these first
          </b>
          <ul>
            {errors.slice(0, 20).map((e, i) => (
              <li key={i}>
                {e.path && <code>{e.path}</code>} {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="issues warn">
          <ul>
            {warnings.slice(0, 20).map((e, i) => (
              <li key={i}>
                {e.path && <code>{e.path}</code>} {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview.ok && (
        <Button variant="primary" size="lg" onClick={onAdd} disabled={busy}>
          Add to Kagaku
        </Button>
      )}
    </div>
  )
}

function StorageCard() {
  const [est, setEst] = useState<{ usage: number; quota: number; persisted: boolean }>()
  const mediaBytes = useLiveQuery(async () => {
    let n = 0
    await db.media.each((m) => (n += m.bytes))
    return n
  }, [])
  const refresh = async () => {
    const e = await navigator.storage?.estimate?.()
    const persisted = (await navigator.storage?.persisted?.()) ?? false
    setEst({ usage: e?.usage ?? 0, quota: e?.quota ?? 0, persisted })
  }
  useEffect(() => {
    refresh()
  }, [mediaBytes])
  return (
    <section className="card">
      <h2 className="card-title">
        <HardDrive size={20} /> Storage on this device
      </h2>
      {est ? (
        <>
          <p>
            Using <b>{formatBytes(est.usage)}</b>
            {est.quota ? ` of about ${formatBytes(est.quota)} allowed` : ''} · images {formatBytes(mediaBytes ?? 0)}
          </p>
          <p className="small">
            {est.persisted ? (
              <span className="good-text">✓ Protected: the browser won't clear Kagaku's data on its own.</span>
            ) : (
              <span className="warn-text">Not protected yet — the browser may clear data when space is low.</span>
            )}
          </p>
          {!est.persisted && (
            <Button
              size="sm"
              onClick={async () => {
                const ok = await navigator.storage?.persist?.()
                toast(ok ? 'Storage protected' : 'The browser said no — install Kagaku to the home screen, then try again')
                refresh()
              }}
            >
              Protect my data
            </Button>
          )}
        </>
      ) : (
        <p className="muted small">Checking…</p>
      )}
    </section>
  )
}
