// "Test from paper", step 1: the question paper and its answer key (photos or PDF).

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, Camera, CloudDownload, Crop, FileText, ImagePlus, KeyRound, RotateCw, ScrollText, Trash2, WifiOff } from 'lucide-react'
import { Bar, Button, TopBar, cx, toast } from '../../ui/kit'
import { CornerEditor } from '../../ui/CornerEditor'
import { photoPreview } from '../../ui/photo'
import { createPaper } from '../../paper/store'
import { runPaper } from '../../paper/job'
import { downloadTools, toolsReady, TOOLS_SIZE_MB } from '../../paper/tools'
import { classify, rowLines } from '../../paper/layout'

type Role = 'paper' | 'key'

interface Item {
  key: string
  role: Role
  file: File
  pdf: boolean
  pages?: number
  turns: number
  corners?: [number, number][]
  preview?: string
}

const isPdfFile = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)

let pdfQueue: Promise<unknown> = Promise.resolve()

/** One PDF at a time: pdf.js 5 keeps the page count of the last opened document in a global. */
function keyPagesIn(file: File): Promise<{ count: number; keyPages: number[] }> {
  const run = pdfQueue.then(() => scanPdf(file))
  pdfQueue = run.catch(() => undefined)
  return run
}

/** Answer-key pages at the end of a paper PDF: from the first page headed "ANSWER KEY"/"ANSWERS". */
async function scanPdf(file: File): Promise<{ count: number; keyPages: number[] }> {
  const { openPdf, pageWords } = await import('../../paper/pdf')
  const { doc, close } = await openPdf(file)
  let from = 0
  for (let n = 2; n <= doc.numPages && !from; n++) {
    const p = await pageWords(doc, n)
    if (rowLines(p.words).some((l) => l.y0 < p.height * 0.45 && classify(l.text).kind === 'keyhead')) from = n
  }
  const count = doc.numPages
  await close()
  return { count, keyPages: from ? Array.from({ length: count - from + 1 }, (_, i) => from + i) : [] }
}

type Tools = 'checking' | 'ready' | 'downloading' | 'offline' | 'error'

export function PaperNewPage() {
  const nav = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [keyInPaper, setKeyInPaper] = useState<number[]>()
  const [suggest, setSuggest] = useState<number[]>()
  const [tools, setTools] = useState<Tools>('checking')
  const [mb, setMb] = useState(0)
  const [busy, setBusy] = useState(false)
  const [corners, setCorners] = useState<Item>()
  const itemsRef = useRef(items)
  itemsRef.current = items

  const getTools = async () => {
    if (!navigator.onLine) return setTools('offline')
    setTools('downloading')
    try {
      await downloadTools('pdf', setMb)
      setTools('ready')
    } catch {
      setTools(navigator.onLine ? 'error' : 'offline')
    }
  }
  useEffect(() => {
    toolsReady('pdf').then((ok) => (ok ? setTools('ready') : getTools()))
    return () => itemsRef.current.forEach((i) => i.preview && URL.revokeObjectURL(i.preview))
  }, [])

  const add = async (role: Role, list: FileList | null) => {
    if (!list?.length) return
    const added: Item[] = []
    for (const file of Array.from(list)) {
      const pdf = isPdfFile(file)
      if (!pdf && !file.type.startsWith('image/')) {
        toast(`${file.name}: only photos and PDFs`)
        continue
      }
      added.push({ key: `${Date.now()}-${Math.random()}`, role, file, pdf, turns: 0 })
    }
    setItems((xs) => [...xs, ...added])
    for (const it of added) {
      if (it.pdf) {
        try {
          const r = await keyPagesIn(it.file)
          setItems((xs) => xs.map((x) => (x.key === it.key ? { ...x, pages: r.count } : x)))
          if (role === 'paper' && r.keyPages.length) setSuggest(r.keyPages)
        } catch {
          toast(`${it.file.name}: this PDF couldn't be opened`)
          setItems((xs) => xs.filter((x) => x.key !== it.key))
        }
      } else {
        const p = await photoPreview(it.file, 0, 360).catch(() => undefined)
        if (p) setItems((xs) => xs.map((x) => (x.key === it.key ? { ...x, preview: p.url } : x)))
      }
    }
  }

  const update = async (key: string, patch: Partial<Item>) => {
    const it = items.find((x) => x.key === key)
    if (!it) return
    const next = { ...it, ...patch }
    if (patch.turns !== undefined && !it.pdf) {
      const p = await photoPreview(it.file, next.turns, 360)
      if (it.preview) URL.revokeObjectURL(it.preview)
      next.preview = p.url
      next.corners = undefined
    }
    setItems((xs) => xs.map((x) => (x.key === key ? next : x)))
  }
  const move = (key: string, d: -1 | 1) =>
    setItems((xs) => {
      const it = xs.find((x) => x.key === key)!
      const same = xs.filter((x) => x.role === it.role)
      const i = same.indexOf(it)
      const j = i + d
      if (j < 0 || j >= same.length) return xs
      const swapped = [...same]
      ;[swapped[i], swapped[j]] = [swapped[j], swapped[i]]
      return [...xs.filter((x) => x.role !== it.role), ...swapped]
    })
  const remove = (key: string) => {
    const it = items.find((x) => x.key === key)
    if (it?.preview) URL.revokeObjectURL(it.preview)
    if (it?.role === 'paper' && it.pdf) {
      setSuggest(undefined)
      setKeyInPaper(undefined)
    }
    setItems((xs) => xs.filter((x) => x.key !== key))
  }

  const paperItems = items.filter((x) => x.role === 'paper')
  const keyItems = items.filter((x) => x.role === 'key')
  const ready = paperItems.length > 0 && (keyItems.length > 0 || !!keyInPaper?.length) && !items.some((x) => x.pdf && x.pages === undefined)

  const make = async () => {
    setBusy(true)
    try {
      const id = await createPaper(
        [...paperItems, ...keyItems].map((x) => ({ role: x.role, file: x.file, name: x.file.name, turns: x.turns, corners: x.corners })),
        { keyInPaper },
      )
      void runPaper(id)
      nav(`/tests/paper/${id}`, { replace: true })
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
    }
  }

  const zone = (role: Role, title: string, icon: ReactNode, list: Item[]) => (
    <section
      className={cx('card drop', list.length > 0 && 'has-files')}
      aria-label={title}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        add(role, e.dataTransfer.files)
      }}
    >
      <h2 className="card-title">
        {icon} {title}
      </h2>
      {role === 'key' && keyInPaper?.length ? (
        <div className="banner banner-accent">
          <KeyRound size={18} />
          <span>
            Using pages {keyInPaper[0]}–{keyInPaper[keyInPaper.length - 1]} of the paper PDF as the key.
          </span>
          <Button size="sm" variant="ghost" onClick={() => setKeyInPaper(undefined)}>
            Undo
          </Button>
        </div>
      ) : role === 'key' && suggest?.length ? (
        <div className="banner banner-accent">
          <KeyRound size={18} />
          <span>
            The paper PDF has an answer key on page{suggest.length > 1 ? `s ${suggest[0]}–${suggest[suggest.length - 1]}` : ` ${suggest[0]}`}.
          </span>
          <Button size="sm" onClick={() => setKeyInPaper(suggest)}>
            Use it
          </Button>
        </div>
      ) : null}
      {list.length > 0 && (
        <ol className="file-list">
          {list.map((it, i) => (
            <li key={it.key} className="file-item">
              {it.pdf ? (
                <span className="file-pdf">
                  <FileText size={22} />
                </span>
              ) : it.preview ? (
                <img src={it.preview} alt={`Photo ${i + 1}`} className="file-thumb" />
              ) : (
                <span className="file-thumb media-loading" />
              )}
              <span className="file-name">
                <b>{it.pdf ? it.file.name : `Photo ${i + 1}`}</b>
                <span className="muted small">{it.pdf ? (it.pages === undefined ? 'Opening…' : `${it.pages} pages`) : it.corners ? 'Corners set' : 'Straightened automatically'}</span>
              </span>
              <span className="file-tools">
                <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(it.key, -1)}>
                  <ArrowUp size={16} />
                </button>
                <button type="button" className="icon-btn" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(it.key, 1)}>
                  <ArrowDown size={16} />
                </button>
                {!it.pdf && (
                  <>
                    <button type="button" className="icon-btn" aria-label="Rotate" onClick={() => update(it.key, { turns: (it.turns + 1) % 4 })}>
                      <RotateCw size={16} />
                    </button>
                    <button type="button" className="icon-btn" aria-label="Page corners" onClick={() => setCorners(it)}>
                      <Crop size={16} />
                    </button>
                  </>
                )}
                <button type="button" className="icon-btn" aria-label="Remove" onClick={() => remove(it.key)}>
                  <Trash2 size={16} />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="row gap wrap">
        <label className="btn btn-soft btn-md">
          <Camera size={18} />
          <span>Camera</span>
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => (add(role, e.target.files), (e.target.value = ''))} />
        </label>
        <label className="btn btn-soft btn-md">
          <ImagePlus size={18} />
          <span>Photos or PDF</span>
          <input type="file" accept="image/*,application/pdf,.pdf" multiple hidden data-role={role} onChange={(e) => (add(role, e.target.files), (e.target.value = ''))} />
        </label>
      </div>
    </section>
  )

  return (
    <div className="paper-new">
      <TopBar title="Test from paper" sub="Your paper + its answer key → a CBT test, made on this device" back="/tests" />
      {tools !== 'ready' && (
        <div className={cx('banner', tools === 'offline' || tools === 'error' ? 'banner-warn' : 'banner-accent')} role="status">
          {tools === 'offline' ? <WifiOff size={18} /> : <CloudDownload size={18} />}
          <span>
            {tools === 'checking' && 'Checking the reading tools…'}
            {tools === 'downloading' && `Downloading the PDF reader once (about ${TOOLS_SIZE_MB.pdf} MB) · ${mb.toFixed(1)} MB. After this it works offline.`}
            {tools === 'offline' && `Connect to the internet once so Kagaku can download its PDF reader (about ${TOOLS_SIZE_MB.pdf} MB). After that, papers work offline.`}
            {tools === 'error' && "The PDF reader couldn't be downloaded."}
          </span>
          {(tools === 'offline' || tools === 'error') && (
            <Button size="sm" onClick={getTools}>
              Try again
            </Button>
          )}
          {tools === 'downloading' && <Bar value={mb} max={TOOLS_SIZE_MB.pdf} />}
        </div>
      )}
      {tools === 'ready' && <p className="muted small tools-ok">PDF reader ready — this works offline.</p>}
      {zone('paper', 'Question paper', <ScrollText size={20} />, paperItems)}
      {zone('key', 'Answer key', <KeyRound size={20} />, keyItems)}
      <p className="muted small">PDFs are best. Photos work too (one page per photo, in order); they need a one-time 7 MB download of the text reader. Nothing leaves this device.</p>
      <div className="builder-foot">
        <Button variant="primary" size="lg" onClick={make} disabled={!ready || busy || (tools !== 'ready' && tools !== 'downloading')}>
          Make test
        </Button>
      </div>
      <CornerEditor
        open={!!corners}
        file={corners?.file}
        turns={corners?.turns ?? 0}
        corners={corners?.corners}
        onClose={() => setCorners(undefined)}
        onSave={(c) => {
          if (corners) setItems((xs) => xs.map((x) => (x.key === corners.key ? { ...x, corners: c } : x)))
          setCorners(undefined)
        }}
      />
    </div>
  )
}
