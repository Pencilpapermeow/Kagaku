// Turning uploads into a checked-ready paper, step by step. Every page is saved as soon as it
// is done, so if the app is closed midway, opening the paper again carries on from there.
//
//   pages   PDF pages are rendered (text layer kept); photos are cleaned in the image worker
//   read    pages without a text layer go through OCR (tesseract.js, offline)
//   detect  questions, sections and the key are found and matched; crops are cut

import { db } from '../db/db'
import { mediaBlob } from '../ui/content'
import { keyLinesOf, paperNumberIn, parseAnswerKey, type KeyLine } from './answerKey'
import { detectQuestions, groupRuns, paper2Start, rowLines } from './layout'
import { buildPaper, entriesFor, keyPapers } from './match'
import { cropQuestion, newPaperId, paperBytes, putMedia, savePaper } from './store'
import { downloadTools, toolsReady } from './tools'
import { paperMediaTag, type PageText, type PaperPage, type UserPaperRow } from './types'
import type { SubjectId } from '../content/syllabus'

const running = new Map<string, Promise<void>>()

export function isRunning(id: string): boolean {
  return running.has(id)
}

/** Start (or resume) processing. Safe to call again while it runs. */
export function runPaper(id: string): Promise<void> {
  let p = running.get(id)
  if (!p) {
    p = processPaper(id).finally(() => running.delete(id))
    running.set(id, p)
  }
  return p
}

const GONE = 'paper deleted'

const isPdf = (type: string, name: string) => type === 'application/pdf' || /\.pdf$/i.test(name)

async function processPaper(id: string): Promise<void> {
  let row = await db.userPapers.get(id)
  if (!row || row.status !== 'processing') return
  const save = async (patch: Partial<UserPaperRow>) => {
    const next = await savePaper(id, patch)
    // Deleted while working: stop, and drop what was stored for it.
    if (!next) throw new Error(GONE)
    row = next
  }
  const progress = (label: string, done: number, total: number) => save({ progress: { label, done, total } })
  try {
    if (row.stage === 'pages') await pagesStage(row, save, progress)
    row = (await db.userPapers.get(id))!
    if (row.stage === 'read') await readStage(row, save, progress)
    row = (await db.userPapers.get(id))!
    if (row.stage === 'detect') await detectStage(row, save, progress)
  } catch (e) {
    if (e instanceof Error && e.message === GONE) {
      const { deletePaperImages } = await import('./store')
      await deletePaperImages(id)
      return
    }
    console.error('[paper] processing failed', e)
    await savePaper(id, { status: 'failed', error: e instanceof Error ? e.message : String(e) })
  }
}

type Save = (patch: Partial<UserPaperRow>) => Promise<void>
type Progress = (label: string, done: number, total: number) => Promise<void>

async function pagesStage(row: UserPaperRow, save: Save, progress: Progress) {
  const files = (await db.paperFiles.where('paperId').equals(row.id).toArray()).sort((a, b) => (a.role === b.role ? a.order - b.order : a.role === 'paper' ? -1 : 1))
  const tag = paperMediaTag(row.id)
  const pages: PaperPage[] = [...row.pages]
  const hasPdf = files.some((f) => isPdf(f.type, f.name))
  const pdf = hasPdf ? await import('./pdf') : undefined
  // Only one PDF may be open at a time: pdf.js 5 keeps the page count of the last opened
  // document in a global ("Invalid page request" for the other one). Count first, then
  // open each file again to render it.
  const counts = new Map<number, number>()
  for (const f of files) {
    if (pdf && isPdf(f.type, f.name)) {
      const { doc, close } = await pdf.openPdf(f.blob)
      counts.set(f.order, doc.numPages)
      await close()
    }
  }
  const total = files.reduce((a, f) => a + (counts.get(f.order) ?? 1), 0)
  let done = pages.length
  for (const f of files) {
    if (pdf && counts.has(f.order)) {
      const count = counts.get(f.order)!
      if (pages.filter((p) => p.file === f.order).length >= count) continue
      const { doc, close } = await pdf.openPdf(f.blob)
      try {
        for (let n = 1; n <= count; n++) {
          if (pages.some((p) => p.file === f.order && p.pdfPage === n)) continue
          await progress(`Preparing page ${done + 1} of ${total}`, done, total)
          const role = f.role === 'paper' && row.keyInPaper?.includes(n) ? 'key' : f.role
          const r = await pdf.renderPage(doc, n)
          let page: PaperPage
          if (r.chars >= 30) {
            page = { role, image: await putMedia(r.blob, tag), width: r.width, height: r.height, file: f.order, pdfPage: n, text: { source: 'pdf', lines: groupRuns(r.words) } }
          } else {
            // A scanned page: clean it like a photo and read it with OCR later.
            const { cleanPhoto } = await import('./images')
            const c = await cleanPhoto(r.blob, { turns: 0, auto: true, maxWidth: 1600 })
            page = { role, image: await putMedia(c.blob, tag), width: c.width, height: c.height, file: f.order, pdfPage: n }
          }
          pages.push(page)
          done++
          await save({ pages: [...pages] })
        }
      } finally {
        await close()
      }
    } else {
      if (pages.some((p) => p.file === f.order)) continue
      await progress(`Cleaning photo ${done + 1} of ${total}`, done, total)
      const { cleanPhoto } = await import('./images')
      const c = await cleanPhoto(f.blob, { turns: f.turns, corners: f.corners, auto: true, maxWidth: 1600 })
      pages.push({ role: f.role, image: await putMedia(c.blob, tag), width: c.width, height: c.height, file: f.order })
      done++
      await save({ pages: [...pages] })
    }
  }
  // Keep the pages in upload order (paper first, then key).
  const order = new Map(files.map((f, i) => [f.order, i]))
  pages.sort((a, b) => (order.get(a.file) ?? 0) - (order.get(b.file) ?? 0) || (a.pdfPage ?? 0) - (b.pdfPage ?? 0))
  await save({ pages, stage: 'read' })
  await db.paperFiles.where('paperId').equals(row.id).delete()
}

async function readStage(row: UserPaperRow, save: Save, progress: Progress) {
  const todo = row.pages.map((p, i) => (p.text ? -1 : i)).filter((i) => i >= 0)
  if (todo.length) {
    if (!(await toolsReady('ocr'))) {
      if (!navigator.onLine) throw new Error('Photos and scanned pages need the text-reading tools (about 7 MB, downloaded once). Connect to the internet once and tap Try again.')
      await progress('Getting the text-reading tools (once, about 7 MB)…', 0, 1)
      await downloadTools('ocr', (mb) => void progress(`Getting the text-reading tools (once) · ${mb.toFixed(1)} MB`, 0, 1))
    }
    const { recognize } = await import('./ocr')
    const { turnImage } = await import('./images')
    const pages = [...row.pages]
    for (const [k, i] of todo.entries()) {
      await progress(`Reading page ${k + 1} of ${todo.length}`, k, todo.length)
      const blob = await mediaBlob(pages[i].image)
      if (!blob) throw new Error('A page image is missing')
      let res = await recognize(blob)
      let page = pages[i]
      // Lines tell sideways from upright, not upright from upside down: OCR decides that.
      if (res.conf < 70 || res.good < 8) {
        const turned = await turnImage(blob, 180)
        const res2 = await recognize(turned.blob)
        if (res2.good > res.good * 1.3 + 2) {
          res = res2
          page = { ...page, image: await putMedia(turned.blob, paperMediaTag(row.id)), width: turned.width, height: turned.height }
        }
      }
      const text: PageText = { source: 'ocr', lines: groupRuns(res.words), conf: Math.round(res.conf) }
      pages[i] = { ...page, text }
      await save({ pages: [...pages] })
    }
  }
  await save({ stage: 'detect' })
}

function guessSubject(title: string): SubjectId {
  return /chem/i.test(title) ? 'chem' : /math/i.test(title) ? 'math' : 'phy'
}

/** Paper 2 found inside the same PDF: it becomes its own paper (pages from `from` on, plus the key). */
async function splitOff(row: UserPaperRow, paperIdx: number[], from: number): Promise<string> {
  const id = newPaperId()
  const keep = [...paperIdx.slice(from), ...row.pages.map((p, i) => (p.role === 'key' ? i : -1)).filter((i) => i >= 0)]
  const pages = keep.map((i) => row.pages[i])
  const tag = paperMediaTag(id)
  const oldTag = paperMediaTag(row.id)
  for (const p of pages) {
    const hash = p.image.slice(6)
    const m = await db.media.get(hash)
    // Paper 2's own pages move to it; key pages are shared by both papers.
    if (m) await db.media.update(hash, { packs: [...new Set([...m.packs.filter((t) => p.role === 'key' || t !== oldTag), tag])] })
  }
  const base = row.title.replace(/\s*·?\s*paper\s*[-–]?\s*(1|I)\b/i, '')
  const now = Date.now()
  await db.userPapers.put({ ...row, id, title: `${base} · Paper 2`, createdAt: now + 1, updatedAt: now, status: 'processing', stage: 'detect', pages, questions: [], sections: [], key: [], warnings: [], bytes: 0 })
  return id
}

async function detectStage(row: UserPaperRow, save: Save, progress: Progress) {
  await progress('Finding questions and reading the key…', 0, 1)
  let paperIdx = row.pages.map((p, i) => (p.role === 'paper' ? i : -1)).filter((i) => i >= 0)
  const notes: string[] = []
  // JA Paper 1 and Paper 2 in one PDF → two papers (two tests).
  const at = paper2Start(paperIdx.map((i) => ({ width: row.pages[i].width, height: row.pages[i].height, lines: row.pages[i].text?.lines ?? [] })))
  if (at > 0) {
    const other = await splitOff(row, paperIdx, at)
    // This paper keeps Paper 1's pages and the key (saved now, so a resume can't split twice).
    const kept = [...paperIdx.slice(0, at), ...row.pages.map((p, i) => (p.role === 'key' ? i : -1)).filter((i) => i >= 0)].map((i) => row.pages[i])
    row = { ...row, pages: kept, title: paperNumberIn(row.title) ? row.title : `${row.title} · Paper 1` }
    await save({ pages: kept, title: row.title })
    paperIdx = row.pages.map((p, i) => (p.role === 'paper' ? i : -1)).filter((i) => i >= 0)
    notes.push('This PDF had Paper 1 and Paper 2: Paper 2 is now its own paper in My papers')
    void runPaper(other)
  }
  const det = detectQuestions(paperIdx.map((i) => ({ width: row.pages[i].width, height: row.pages[i].height, lines: row.pages[i].text?.lines ?? [] })))
  for (const q of det.questions) for (const p of q.pieces) p.page = paperIdx[p.page]

  let keyIdx = row.pages.map((p, i) => (p.role === 'key' ? i : -1)).filter((i) => i >= 0)
  const warnings: string[] = [...notes]
  if (!keyIdx.length && det.keyPages.length) {
    keyIdx = det.keyPages.map((k) => paperIdx[k])
    warnings.push('The answer key was read from the last pages of the paper itself')
  }
  const keyRows: KeyLine[][] = keyIdx.map((i) => rowLines(row.pages[i].text?.lines.flatMap((l) => l.words) ?? []).map((l) => ({ text: l.text, words: l.words })))
  const sel = keyLinesOf(keyRows)
  const parsed = parseAnswerKey(sel.lines, { strict: sel.strict })
  // A key with Paper 1 and Paper 2: use the answers of this paper.
  const papers = keyPapers(parsed.entries)
  let keyPaper: number | undefined
  if (papers.length > 1) {
    const own = paperNumberIn(row.title) ?? paperNumberIn(det.preamble) ?? paperNumberIn(det.title ?? '') ?? paperNumberIn(row.sources.map((s) => s.name).join(' '))
    keyPaper = own && papers.includes(own) ? own : papers[0]
    warnings.push(`The key has answers for Paper ${papers.join(' and Paper ')}: Paper ${keyPaper}'s are used${own ? '' : ' — if this is the other paper, change it below'}`)
  }
  const built = buildPaper(det, entriesFor(parsed.entries, keyPaper), guessSubject(row.title))

  const questions = built.questions
  const draft = { ...row, questions }
  for (const [k, q] of questions.entries()) {
    if (k % 3 === 0) await progress(`Cutting question ${k + 1} of ${questions.length}`, k, questions.length)
    q.image = await cropQuestion(draft, q)
    if (q.pieces.length && !q.image) q.cropNote = 'The cut area looks empty — check the box'
  }
  const n = questions.length
  await save({
    status: 'ready',
    stage: undefined,
    progress: undefined,
    sections: built.sections,
    questions,
    key: parsed.entries,
    keyPaper,
    warnings: [...warnings, ...built.warnings, ...parsed.warnings.slice(0, 5)],
    optionStyle: det.optionStyle,
    durationMin: det.durationMin ?? (n >= 30 ? 180 : Math.max(10, Math.ceil((n * 3) / 5) * 5)),
    title: row.title.startsWith('Paper · ') && det.title ? det.title.slice(0, 80) + (paperNumberIn(row.title) && !paperNumberIn(det.title) ? ` · Paper ${paperNumberIn(row.title)}` : '') : row.title,
    bytes: await paperBytes(row.id),
  })
}
