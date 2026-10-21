// "Verify" beside every question: send it to Claude (share sheet), Google, or Gemini,
// then he decides whether the key was right. Needs internet; everything else is offline.

import type { Question } from '../content/schema'
import { db } from '../db/db'
import { plainText } from '../ui/rich'
import { describeAnswer, type Response } from './marking'
import { isLettersOnly, labelAt } from './variants'

export function responseToAnswer(q: Question, r: Response): Question['answer'] | undefined {
  switch (q.format) {
    case 'single':
    case 'assertion':
      return r.kind === 'options' && r.ids[0] ? (r.ids[0] as never) : undefined
    case 'multiple':
      return r.kind === 'options' && r.ids.length ? r.ids : undefined
    case 'integer':
    case 'numerical':
      return r.kind === 'number' && Number.isFinite(r.value) ? r.value : undefined
    case 'truefalse':
      return r.kind === 'bool' ? r.value : undefined
    case 'match':
      return r.kind === 'match' ? Object.fromEntries(Object.entries(r.pairs).map(([k, v]) => [k, v.length === 1 ? v[0] : v])) : undefined
    case 'ordering':
      return r.kind === 'order' ? r.ids : undefined
  }
}

export function describeResponse(q: Question, r: Response | undefined): string {
  if (!r) return 'nothing'
  const a = responseToAnswer(q, r)
  return a === undefined ? 'nothing' : describeAnswer({ ...q, answer: a } as Question)
}

/** The question as text, with options labelled the way they are shown on screen. */
export function questionText(q: Question): string {
  const lines: string[] = []
  if (q.stem) lines.push(plainText(q.stem))
  if (q.format === 'assertion') lines.push(`Assertion: ${plainText(q.assertion)}`, `Reason: ${plainText(q.reason)}`)
  if ((q.format === 'single' || q.format === 'multiple') && !isLettersOnly(q))
    q.options.forEach((o, i) => lines.push(`(${labelAt(i)}) ${plainText(o.text) || '[figure]'}`))
  if (q.format === 'match') {
    lines.push('Column I:', ...q.left.map((l) => `${l.id}. ${plainText(l.text)}`))
    lines.push('Column II:', ...q.right.map((r) => `${r.id}. ${plainText(r.text)}`))
  }
  if (q.format === 'ordering') lines.push('Items: ' + q.items.map((i) => plainText(i.text)).join(', '))
  return lines.join('\n')
}

/** Options are shown re-lettered in practice; translate ids back to on-screen letters. */
function shownAnswer(q: Question, text: string): string {
  if ((q.format === 'single' || q.format === 'multiple') && !isLettersOnly(q)) {
    const ids = text.split(', ')
    return ids.map((id) => labelAt(q.options.findIndex((o) => o.id === id))).join(', ')
  }
  return text
}

export function verifyPrompt(q: Question, response: Response | undefined): string {
  const key = shownAnswer(q, describeAnswer(q))
  const mine = response ? shownAnswer(q, describeResponse(q, response)) : 'nothing yet'
  return [
    `I'm preparing for JEE Advanced. ${q.image ? 'The question is in the attached image.' : 'Here is the question:'}`,
    '',
    questionText(q),
    '',
    `The answer key says: ${key}. I chose: ${mine}.`,
    'Which is right? Show a short solution and point out the key idea.',
  ].join('\n')
}

export async function shareForVerify(q: Question, response: Response | undefined): Promise<'shared' | 'copied'> {
  const text = verifyPrompt(q, response)
  const files: File[] = []
  if (q.image?.startsWith('media:')) {
    const m = await db.media.get(q.image.slice(6))
    if (m) files.push(new File([m.blob], `question.${m.type.split('/')[1] ?? 'png'}`, { type: m.type }))
  }
  const data: ShareData = files.length && navigator.canShare?.({ files }) ? { text, files } : { text }
  if (navigator.share) {
    try {
      await navigator.share(data)
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'shared'
    }
  }
  await navigator.clipboard?.writeText(text)
  return 'copied'
}

export function googleSearchUrl(q: Question): string {
  return `https://www.google.com/search?q=${encodeURIComponent(questionText(q).slice(0, 400))}`
}

async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}

export async function askGemini(key: string, model: string, q: Question, response: Response | undefined): Promise<string> {
  const parts: unknown[] = [{ text: verifyPrompt(q, response) }]
  if (q.image?.startsWith('media:')) {
    const m = await db.media.get(q.image.slice(6))
    if (m) parts.push({ inline_data: { mime_type: m.type, data: await blobToBase64(m.blob) } })
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
  })
  if (!res.ok) throw new Error(`Gemini said ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') || 'No answer came back.'
}

export async function setKeyStatus(qid: string, status: 'confirmed' | 'doubtful') {
  const cur = await db.qmeta.get(qid)
  await db.qmeta.put({ ...cur, qid, keyStatus: status })
}

/** "Key was wrong → fix": stores the corrected answer; every later check uses it. */
export async function fixKey(q: Question, fixed: Question['answer']) {
  const cur = await db.qmeta.get(q.id)
  await db.qmeta.put({ ...cur, qid: q.id, keyStatus: 'fixed', fixedAnswer: fixed })
}

export async function reportQuestion(qid: string, text: string) {
  const cur = await db.qmeta.get(qid)
  await db.qmeta.put({ ...cur, qid, reports: [...(cur?.reports ?? []), { at: Date.now(), text }] })
}
