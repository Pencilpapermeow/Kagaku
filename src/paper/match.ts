// Joining what was found on the paper with what was read from the key, and turning a
// checked paper into ordinary Questions for the CBT. Pure functions.

import type { MarkingScheme, Question, SchemeRule } from '../content/schema'
import type { SubjectId } from '../content/syllabus'
import { SCHEME_PRESETS } from '../engine/marking'
import { keyAnswerText } from './answerKey'
import { FORMAT_NAME, SUBJECT_TITLE, type Detection } from './layout'
import { paperQuestionId, type KeyAnswer, type KeyEntry, type PaperFormat, type PaperKey, type PaperQuestion, type PaperSection, type UserPaperRow } from './types'

export function optionIds(style: 'letters' | 'numbers', count: number): string[] {
  return Array.from({ length: count }, (_, i) => (style === 'numbers' ? String(i + 1) : 'ABCDEFGH'[i]))
}

export function presetRule(format: PaperFormat, over?: Partial<SchemeRule>): SchemeRule {
  const base = SCHEME_PRESETS[0].rules[format]!
  return {
    correct: over?.correct ?? base.correct,
    wrong: over?.wrong ?? base.wrong,
    unattempted: 0,
    partial: format === 'multiple' ? (over?.partial ?? base.partial) : false,
  }
}

interface QRef {
  idx: number
  n: number
  subject?: SubjectId
}

/**
 * Which key entry belongs to which question. Numbering can be continuous (1–54) or restart
 * per subject (1–18 ×3) on either side; both are handled.
 */
export function matchKey(qs: QRef[], entries: KeyEntry[]): { byQuestion: Map<number, KeyEntry>; unmatched: KeyEntry[]; mode: string } {
  const byQuestion = new Map<number, KeyEntry>()
  const uniq = (ns: number[]) => new Set(ns).size === ns.length
  const paperUnique = uniq(qs.map((q) => q.n))
  const keyUnique = uniq(entries.map((e) => e.n))
  const keySubjects = entries.length > 0 && entries.every((e) => e.subject)
  const paperSubjects = qs.length > 0 && qs.every((q) => q.subject)

  let keyOf: (e: KeyEntry) => string
  let qKey: (q: QRef, k: number) => string
  let mode: string
  if (paperUnique && keyUnique) {
    mode = 'number'
    keyOf = (e) => String(e.n)
    qKey = (q) => String(q.n)
  } else if (keySubjects && paperSubjects) {
    mode = 'subject+number'
    keyOf = (e) => `${e.subject}:${e.n}`
    qKey = (q) => `${q.subject}:${q.n}`
  } else if (!paperUnique && !keyUnique) {
    mode = 'block+number'
    const blockOf: number[] = []
    let b = 0
    qs.forEach((q, k) => {
      if (k > 0 && q.n <= qs[k - 1].n) b++
      blockOf.push(b)
    })
    keyOf = (e) => `${e.block}:${e.n}`
    qKey = (_q, k) => `${blockOf[k]}:${qs[k].n}`
  } else if (!paperUnique && keyUnique) {
    mode = 'position'
    keyOf = (e) => String(e.n)
    qKey = (_q, k) => String(k + 1)
  } else {
    mode = 'offset'
    const maxIn = new Map<number, number>()
    for (const e of entries) maxIn.set(e.block, Math.max(maxIn.get(e.block) ?? 0, e.n))
    const offset = new Map<number, number>()
    let acc = 0
    for (const b of [...maxIn.keys()].sort((a, c) => a - c)) {
      offset.set(b, acc)
      acc += maxIn.get(b)!
    }
    keyOf = (e) => String(e.n + (offset.get(e.block) ?? 0))
    qKey = (q) => String(q.n)
  }
  const map = new Map(entries.map((e) => [keyOf(e), e]))
  const used = new Set<KeyEntry>()
  qs.forEach((q, k) => {
    const e = map.get(qKey(q, k))
    if (e) {
      byQuestion.set(q.idx, e)
      used.add(e)
    }
  })
  return { byQuestion, unmatched: entries.filter((e) => !used.has(e)), mode }
}

/** What kind of question an answer looks like, when the paper didn't say. */
export function formatFromAnswer(a: KeyAnswer | undefined, style: 'letters' | 'numbers'): PaperFormat | undefined {
  if (!a) return undefined
  switch (a.kind) {
    case 'letters':
      return a.letters.length > 1 && !a.either ? 'multiple' : 'single'
    case 'number':
      if (style === 'numbers' && Number.isInteger(a.value) && a.value >= 1 && a.value <= 4) return 'single'
      return Number.isInteger(a.value) ? 'integer' : 'numerical'
    case 'range':
      return 'numerical'
    case 'bonus':
      return undefined
  }
}

/** A key answer in the shape the question's format needs, plus a note when something didn't fit. */
export function keyFor(a: KeyAnswer, format: PaperFormat, style: 'letters' | 'numbers', options: number): { key?: PaperKey; note?: string } {
  const ids = optionIds(style, options)
  const raw = keyAnswerText(a)
  const toId = (letter: string) => (style === 'numbers' ? String('ABCDEFGH'.indexOf(letter) + 1) : letter)
  if (a.kind === 'bonus') return { key: { answer: format === 'multiple' ? [ids[0]] : format === 'single' ? ids[0] : 0, bonus: true, raw: 'Bonus' } }
  if (format === 'single' || format === 'multiple') {
    let chosen: string[] | undefined
    let note: string | undefined
    if (a.kind === 'letters') chosen = a.letters.map(toId)
    else if (a.kind === 'number' && Number.isInteger(a.value)) {
      if (style === 'numbers' && a.value >= 1 && a.value <= options) chosen = [String(a.value)]
      else if (style === 'letters' && a.value >= 1 && a.value <= options) {
        chosen = [ids[a.value - 1]]
        note = `Key says ${a.value}; taken as option ${ids[a.value - 1]}`
      } else if (style === 'letters' && a.value === 8) {
        chosen = ['B']
        note = 'Key was read as "8"; taken as option B'
      }
    }
    if (!chosen?.length || chosen.some((c) => !ids.includes(c))) return { note: `Key says "${raw}", which isn't an option of this ${FORMAT_NAME[format].toLowerCase()} question` }
    if (format === 'multiple') return { key: { answer: chosen, raw }, note }
    if (chosen.length === 1) return { key: { answer: chosen[0], raw }, note }
    if (a.kind === 'letters' && a.either) return { key: { answer: chosen[0], accept: chosen.slice(1), raw }, note: note }
    return { key: { answer: chosen[0], raw }, note: `Key gives several options (${raw}) for a single-correct question — kept ${chosen[0]}` }
  }
  if (a.kind === 'letters') return { note: `Key says "${raw}" (an option) for a ${FORMAT_NAME[format].toLowerCase()} question` }
  if (format === 'integer') {
    if (a.kind === 'number' && Number.isInteger(a.value)) return { key: { answer: a.value, raw } }
    if (a.kind === 'number') return { key: { answer: a.value, raw }, note: `Key has ${a.value}, not a whole number — is this numerical?` }
    return { key: { answer: (a.min + a.max) / 2, tolerance: (a.max - a.min) / 2, raw }, note: `Key gives a range (${raw}) for an integer question — is this numerical?` }
  }
  if (a.kind === 'number') return { key: { answer: a.value, tolerance: 0.01, raw } }
  return { key: { answer: round((a.min + a.max) / 2), tolerance: round((a.max - a.min) / 2), raw } }
}

const round = (x: number) => Math.round(x * 1e6) / 1e6

export interface BuiltPaper {
  sections: PaperSection[]
  questions: PaperQuestion[]
  warnings: string[]
  matchMode: string
}

/** First full build after reading: sections with types and marks, questions with their keys. */
export function buildPaper(det: Detection, entries: KeyEntry[], fallbackSubject: SubjectId = 'phy'): BuiltPaper {
  const style = det.optionStyle
  const warnings = [...det.warnings]
  let lastSubject: SubjectId = det.sections.find((s) => s.subject)?.subject ?? fallbackSubject
  const sections: PaperSection[] = det.sections.map((s) => {
    const subject = s.subject ?? lastSubject
    lastSubject = subject
    const over = s.marks ?? det.preambleMarks
    return {
      name: s.name,
      subject,
      format: s.format ?? 'single',
      rule: presetRule(s.format ?? 'single', over),
      typeFrom: s.format ? 'instructions' : 'default',
      marksFrom: over ? 'instructions' : 'preset',
      note: s.note || undefined,
    }
  })
  if (!sections.length) sections.push({ name: SUBJECT_TITLE[fallbackSubject], subject: fallbackSubject, format: 'single', rule: presetRule('single', det.preambleMarks), typeFrom: 'default', marksFrom: det.preambleMarks ? 'instructions' : 'preset' })

  let uid = 0
  const questions: PaperQuestion[] = det.questions.map((q) => ({
    uid: ++uid,
    n: q.n,
    section: Math.min(q.section, sections.length - 1),
    format: sections[Math.min(q.section, sections.length - 1)].format,
    options: 4,
    pieces: q.pieces,
    cropNote: q.cropNote,
  }))

  const { byQuestion, unmatched, mode } = matchKey(
    questions.map((q, idx) => ({ idx, n: q.n, subject: sections[q.section].subject })),
    entries,
  )
  const keyed = new Map<PaperQuestion, KeyEntry>()
  questions.forEach((q, i) => {
    const e = byQuestion.get(i)
    if (e) keyed.set(q, e)
  })
  const entryOf = (q: PaperQuestion) => keyed.get(q)

  // Questions the key has but the paper reading missed (inside the numbering of the paper):
  // placeholders he can draw a box for. Anything else in the key is reported.
  const stillUnmatched: KeyEntry[] = []
  const exact = mode === 'number' || mode === 'subject+number'
  for (const e of unmatched.sort((a, b) => a.block - b.block || a.n - b.n)) {
    const sameSubject = (q: PaperQuestion) => !e.subject || mode === 'number' || sections[q.section].subject === e.subject
    const before = questions.reduce((best, q, i) => (sameSubject(q) && q.n < e.n ? i : best), -1)
    const after = questions.findIndex((q, i) => i > before && sameSubject(q) && q.n > e.n)
    if (!exact || before < 0 || (after < 0 && e.n > questions[before].n + 2)) {
      stillUnmatched.push(e)
      continue
    }
    const sec = questions[before].section
    const q: PaperQuestion = { uid: ++uid, n: e.n, section: sec, format: sections[sec].format, options: 4, pieces: [], cropNote: 'Not found on the paper — draw its box' }
    questions.splice(before + 1, 0, q)
    keyed.set(q, e)
  }
  if (stillUnmatched.length)
    warnings.push(`The key has answers for ${stillUnmatched.length} question(s) not found in the paper: ${stillUnmatched.slice(0, 8).map((e) => `Q${e.n}`).join(', ')}${stillUnmatched.length > 8 ? '…' : ''}`)

  // Sections whose type the paper didn't state: take it from the key answers.
  sections.forEach((s, si) => {
    if (s.typeFrom !== 'default') return
    const qs = questions.filter((q) => q.section === si)
    const counts = new Map<PaperFormat, number>()
    for (const q of qs) {
      const f = formatFromAnswer(entryOf(q)?.answer, style)
      if (f) {
        q.format = f
        counts.set(f, (counts.get(f) ?? 0) + 1)
      }
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    if (top) {
      // One right option is still a multiple-correct question in a multiple-correct section.
      if (top[0] === 'multiple')
        for (const q of qs) {
          const a = entryOf(q)?.answer
          if (q.format === 'single' && !(a?.kind === 'letters' && a.either)) q.format = 'multiple'
        }
      s.format = top[0]
      s.typeFrom = 'key'
      s.rule = presetRule(top[0], s.marksFrom === 'instructions' ? s.rule : undefined)
    }
  })

  for (const q of questions) setKeyFrom(q, entryOf(q), style)
  const without = questions.filter((q) => !entryOf(q)).length
  if (entries.length && without) warnings.push(`${without} question(s) have no answer in the key`)
  if (!entries.length) warnings.push('No answers could be read from the key')
  return { sections, questions, warnings, matchMode: mode }
}

function setKeyFrom(q: PaperQuestion, e: KeyEntry | undefined, style: 'letters' | 'numbers') {
  q.key = undefined
  q.keyNote = undefined
  if (!e?.answer) {
    if (e) q.keyNote = `Couldn't read the key for Q${q.n} ("${e.raw}")`
    return
  }
  const { key, note } = keyFor(e.answer, q.format, style, q.options)
  q.key = key
  const unclear = e.conf !== undefined && e.conf < 65 ? `Key read unclearly ("${e.raw}") — check it` : undefined
  q.keyNote = [note, unclear].filter(Boolean).join('. ') || undefined
}

/** Papers whose answers a key holds ("PAPER-1", "PAPER-2" headings). */
export function keyPapers(entries: KeyEntry[]): number[] {
  return [...new Set(entries.map((e) => e.paper).filter((p): p is number => !!p))].sort()
}

/** The key entries for one paper (all of them when the key doesn't name papers). */
export function entriesFor(entries: KeyEntry[], paper: number | undefined): KeyEntry[] {
  return keyPapers(entries).length > 1 && paper ? entries.filter((e) => e.paper === paper) : entries
}

/** Match a key again to the questions as they are now (e.g. Paper 2's answers instead of Paper 1's). */
export function assignKeys(paper: Pick<UserPaperRow, 'optionStyle' | 'sections' | 'questions'>, entries: KeyEntry[]): PaperQuestion[] {
  const questions = paper.questions.map((q) => ({ ...q }))
  const { byQuestion } = matchKey(
    questions.map((q, idx) => ({ idx, n: q.n, subject: paper.sections[q.section]?.subject })),
    entries,
  )
  questions.forEach((q, i) => setKeyFrom(q, byQuestion.get(i), paper.optionStyle))
  return questions
}

// ───────────────────────────── checks ─────────────────────────────

export function keyFits(q: PaperQuestion, style: 'letters' | 'numbers'): boolean {
  const k = q.key
  if (!k) return false
  if (k.bonus) return true
  const ids = optionIds(style, q.options)
  switch (q.format) {
    case 'single':
      return typeof k.answer === 'string' && ids.includes(k.answer) && (k.accept ?? []).every((x) => ids.includes(x))
    case 'multiple':
      return Array.isArray(k.answer) && k.answer.length > 0 && k.answer.every((x) => ids.includes(x))
    case 'integer':
      return typeof k.answer === 'number' && Number.isInteger(k.answer)
    case 'numerical':
      return typeof k.answer === 'number' && Number.isFinite(k.answer)
  }
}

/** What still needs his eye on this question. Empty = fine. */
export function doubtsOf(paper: Pick<UserPaperRow, 'optionStyle'>, q: PaperQuestion): string[] {
  const out: string[] = []
  if (!q.pieces.length) out.push('Not found on the paper — draw its box')
  if (!q.key) out.push(q.keyNote ?? 'No answer in the key')
  else if (!keyFits(q, paper.optionStyle)) out.push(`The key (${q.key.raw ?? '?'}) doesn't fit a ${FORMAT_NAME[q.format].toLowerCase()} question`)
  if (q.ok) return out
  if (q.key && q.keyNote) out.push(q.keyNote)
  if (q.pieces.length && q.cropNote) out.push(q.cropNote)
  return out
}

/** Blocking problems: the question can't be in the test as it is. */
export function blocking(paper: Pick<UserPaperRow, 'optionStyle'>, q: PaperQuestion): boolean {
  return !q.pieces.length || !q.key || !keyFits(q, paper.optionStyle)
}

export function sectionDoubt(s: PaperSection): string | undefined {
  if (s.ok || s.typeFrom === 'instructions' || s.typeFrom === 'user') return undefined
  return s.typeFrom === 'key' ? 'Question type guessed from the key answers — check it' : "The paper doesn't say the question type — choose it"
}

// ───────────────────────────── into the CBT ─────────────────────────────

export function paperChapter(subject: SubjectId): string {
  return `${subject}.from-papers`
}

export function toQuestion(paper: Pick<UserPaperRow, 'id' | 'title' | 'optionStyle' | 'sections'>, q: PaperQuestion): Question {
  const s = paper.sections[q.section]
  const k = q.key!
  const base = {
    id: paperQuestionId(paper.id, q.uid),
    chapter: q.chapter ?? paperChapter(s.subject),
    stem: '',
    image: q.image,
    source: { label: `${paper.title} · Q${q.n}`, qno: String(q.n) },
    verified: 'checked' as const,
    tags: ['paper'],
    bonus: k.bonus || undefined,
  }
  const options = optionIds(paper.optionStyle, q.options).map((id) => ({ id }))
  switch (q.format) {
    case 'single':
      return { ...base, format: 'single', options, answer: String(k.answer), accept: k.accept?.length ? k.accept : undefined }
    case 'multiple':
      return { ...base, format: 'multiple', options, answer: Array.isArray(k.answer) ? k.answer : [String(k.answer)] }
    case 'integer':
      return { ...base, format: 'integer', answer: Number(k.answer) }
    case 'numerical':
      return { ...base, format: 'numerical', answer: Number(k.answer), tolerance: k.tolerance ?? 0.01 }
  }
}

/**
 * CBT sections: one tab per subject (as in the NTA interface). A subject is split into more
 * tabs only when two of its sections give the same question type different marks.
 */
export function cbtSections(paper: Pick<UserPaperRow, 'id' | 'title' | 'optionStyle' | 'sections' | 'questions'>): { name: string; questions: Question[]; scheme: MarkingScheme }[] {
  const out: { name: string; subject: SubjectId; questions: Question[]; rules: Partial<Record<PaperFormat, SchemeRule>> }[] = []
  const sameRule = (a: SchemeRule, b: SchemeRule) => a.correct === b.correct && a.wrong === b.wrong && a.partial === b.partial && a.unattempted === b.unattempted
  for (const q of paper.questions) {
    if (blocking(paper, q)) continue
    const s = paper.sections[q.section]
    const rule = q.format === s.format ? s.rule : presetRule(q.format, s.rule)
    let tab = out[out.length - 1]
    if (!tab || tab.subject !== s.subject || (tab.rules[q.format] && !sameRule(tab.rules[q.format]!, rule))) {
      tab = { name: SUBJECT_TITLE[s.subject], subject: s.subject, questions: [], rules: {} }
      out.push(tab)
    }
    tab.rules[q.format] = rule
    tab.questions.push(toQuestion(paper, q))
  }
  const names = new Map<string, number>()
  return out.map((t) => {
    const k = (names.get(t.name) ?? 0) + 1
    names.set(t.name, k)
    const name = out.filter((x) => x.name === t.name).length > 1 ? `${t.name} ${k}` : t.name
    return { name, questions: t.questions, scheme: { name: `${paper.title} marking`, rules: t.rules } }
  })
}
