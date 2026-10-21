// Kagaku content-pack format, version 1.
//
// A pack is the only way content enters the app. Claude (or any AI, or a person)
// produces one, and the app validates it with these schemas before storing anything.
// docs/CONTENT_FORMAT.md explains every field with examples; keep it in sync.
//
// Rich text: plain text with $inline$ / $$display$$ LaTeX (KaTeX + mhchem \ce{}),
// **bold**, *italic* and line breaks.
// Media refs: "img/<file>.webp" inside a .kagaku zip, a data: URI, or (after import)
// "media:<sha256>".

import { z } from 'zod'

export const PACK_FORMAT = 'kagaku-pack'
export const PACK_VERSION = 1

const idPattern = /^[A-Za-z0-9._:-]+$/
export const zId = z.string().min(1).max(160).regex(idPattern, 'use letters, digits, . _ : - only')
export const zRich = z.string().max(20_000)
export const zMedia = z.string().min(1)
export const zChapterId = z.string().regex(/^(phy|chem|math)\.[a-z0-9-]+$/, 'chapter id looks like "phy.ray-optics"')

export const FORMATS = ['single', 'multiple', 'integer', 'numerical', 'assertion', 'truefalse', 'match', 'ordering'] as const
export type QuestionFormat = (typeof FORMATS)[number]

export const FORMAT_LABEL: Record<QuestionFormat, string> = {
  single: 'Single correct',
  multiple: 'Multiple correct',
  integer: 'Integer',
  numerical: 'Numerical',
  assertion: 'Assertion & Reason',
  truefalse: 'True / False',
  match: 'Match the following',
  ordering: 'Arrange in order',
}

export const zVerified = z.enum(['official', 'checked', 'unverified'])
export type Verified = z.infer<typeof zVerified>

export const zSource = z
  .object({
    exam: z.string().max(80).optional(),
    year: z.number().int().min(1950).max(2100).optional(),
    paper: z.string().max(120).optional(),
    qno: z.string().max(20).optional(),
    label: z.string().max(200).optional(),
  })
  .strict()

export const zOption = z
  .object({
    id: z.string().min(1).max(4),
    text: zRich.optional(),
    image: zMedia.optional(),
  })
  .strict()
export type Option = z.infer<typeof zOption>

export const zDistractor = z.object({ text: zRich.optional(), image: zMedia.optional() }).strict()

const questionBase = {
  id: zId.optional(),
  chapter: zChapterId,
  topic: z.string().max(160).optional(),
  /** The full question as text + LaTeX. Never a photo of the question. */
  stem: zRich.default(''),
  /** A small crop of the diagram only, when the question has one. */
  image: zMedia.optional(),
  passage: zId.optional(),
  solution: zRich.optional(),
  solutionImage: zMedia.optional(),
  source: zSource.optional(),
  verified: zVerified.default('unverified'),
  tags: z.array(z.string().max(60)).max(30).default([]),
  difficulty: z.number().int().min(1).max(3).optional(),
  /** What the transcriber was unsure about (accuracy layer 2); shown on the review screen. */
  uncertain: z.string().max(500).optional(),
}

const choice = {
  options: z.array(zOption).min(2).max(10),
  /** Extra wrong options; practice mode picks some at random so the option set keeps changing. */
  distractors: z.array(zDistractor).max(20).optional(),
}

export const ASSERTION_CODES = ['both-explains', 'both-not-explains', 'a-only', 'r-only', 'neither'] as const

export const zQuestion = z.discriminatedUnion('format', [
  z.object({ ...questionBase, format: z.literal('single'), ...choice, answer: z.string().min(1) }).strict(),
  z.object({ ...questionBase, format: z.literal('multiple'), ...choice, answer: z.array(z.string().min(1)).min(1) }).strict(),
  z.object({ ...questionBase, format: z.literal('integer'), answer: z.number().int() }).strict(),
  z
    .object({
      ...questionBase,
      format: z.literal('numerical'),
      answer: z.number(),
      /** Absolute tolerance. Defaults to 0.01 (answers to two decimals). */
      tolerance: z.number().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      ...questionBase,
      format: z.literal('assertion'),
      assertion: zRich,
      reason: zRich,
      answer: z.enum(ASSERTION_CODES),
      /** Some papers add a fifth "both false" option. */
      withNeither: z.boolean().optional(),
    })
    .strict(),
  z.object({ ...questionBase, format: z.literal('truefalse'), answer: z.boolean() }).strict(),
  z
    .object({
      ...questionBase,
      format: z.literal('match'),
      left: z.array(zOption).min(2).max(10),
      right: z.array(zOption).min(2).max(12),
      /** left id -> right id(s). JA matrix-match can map one row to several columns. */
      answer: z.record(z.string(), z.union([z.string(), z.array(z.string()).min(1)])),
    })
    .strict(),
  z
    .object({
      ...questionBase,
      format: z.literal('ordering'),
      items: z.array(zOption).min(2).max(12),
      /** Item ids in the correct order (first to last as the stem asks). */
      answer: z.array(z.string()).min(2),
    })
    .strict(),
])
export type PackQuestion = z.input<typeof zQuestion>
export type Question = z.output<typeof zQuestion> & { id: string }

export const zPassage = z
  .object({
    id: zId,
    chapter: zChapterId,
    title: z.string().max(200).optional(),
    text: zRich.default(''),
    image: zMedia.optional(),
  })
  .strict()
export type Passage = z.output<typeof zPassage>

const rememberBase = {
  id: zId.optional(),
  chapter: zChapterId,
  topic: z.string().max(160).optional(),
  title: z.string().min(1).max(300),
  source: zSource.optional(),
  verified: zVerified.default('unverified'),
  tags: z.array(z.string().max(60)).max(30).default([]),
  uncertain: z.string().max(500).optional(),
}

export const zRemember = z.discriminatedUnion('kind', [
  z
    .object({
      ...rememberBase,
      kind: z.literal('formula'),
      latex: z.string().min(1).max(5000),
      /** When the formula applies, e.g. "isothermal, ideal gas" or "concave mirror, real image". */
      condition: zRich.optional(),
      where: z
        .array(z.object({ symbol: z.string().max(60), meaning: z.string().max(200), unit: z.string().max(60).optional() }).strict())
        .max(30)
        .optional(),
      note: zRich.optional(),
    })
    .strict(),
  z
    .object({
      ...rememberBase,
      kind: z.literal('note'),
      body: zRich,
      image: zMedia.optional(),
    })
    .strict(),
  z
    .object({
      ...rememberBase,
      kind: z.literal('table'),
      columns: z
        .array(
          z
            .object({
              key: z.string().min(1).max(40),
              label: z.string().min(1).max(120),
              /** Set false for columns that shouldn't become quiz questions (e.g. remarks). */
              quiz: z.boolean().default(true),
            })
            .strict(),
        )
        .min(2)
        .max(12),
      /** The column that names each row (asked about: "What is W for an isothermal process?"). */
      keyColumn: z.string().min(1),
      rows: z.array(z.record(z.string(), zRich)).min(2).max(200),
      note: zRich.optional(),
    })
    .strict(),
  z
    .object({
      ...rememberBase,
      kind: z.literal('trend'),
      /** What is being compared, e.g. "first ionisation enthalpy". */
      property: z.string().min(1).max(200),
      /** Items from LOWEST to HIGHEST value of the property. */
      order: z.array(zRich).min(2).max(20),
      basis: zRich.optional(),
      exceptions: zRich.optional(),
    })
    .strict(),
])
export type PackRemember = z.input<typeof zRemember>
export type Remember = z.output<typeof zRemember> & { id: string }
export type RememberKind = Remember['kind']

export const zSchemeRule = z
  .object({
    correct: z.number(),
    wrong: z.number(),
    unattempted: z.number().default(0),
    /** JEE Advanced partial marking for multiple-correct: +1 per correct option chosen if no wrong one is chosen. */
    partial: z.boolean().default(false),
  })
  .strict()
export type SchemeRule = z.output<typeof zSchemeRule>

export const zScheme = z
  .object({
    id: z.string().max(60).optional(),
    name: z.string().max(120),
    rules: z.partialRecord(z.enum(FORMATS), zSchemeRule),
  })
  .strict()
export type MarkingScheme = z.output<typeof zScheme>

export const zPaper = z
  .object({
    id: zId,
    title: z.string().min(1).max(200),
    exam: z.string().max(80).optional(),
    year: z.number().int().optional(),
    durationMin: z.number().int().min(1).max(600),
    /** A preset id (see engine/marking.ts) or an inline scheme. */
    scheme: z.union([z.string(), zScheme]).optional(),
    instructions: zRich.optional(),
    sections: z
      .array(
        z
          .object({
            name: z.string().min(1).max(80),
            questionIds: z.array(zId).min(1),
            scheme: z.union([z.string(), zScheme]).optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
export type Paper = z.output<typeof zPaper>

export const zChapterDef = z
  .object({
    id: zChapterId,
    unit: z.string().min(1).max(40),
    cls: z.union([z.literal(11), z.literal(12)]),
    name: z.string().min(1).max(160),
    aliases: z.array(z.string()).optional(),
    topics: z.array(z.string().max(160)).optional(),
  })
  .strict()

export const zPack = z
  .object({
    format: z.literal(PACK_FORMAT),
    version: z.literal(PACK_VERSION),
    id: zId,
    title: z.string().min(1).max(200),
    createdAt: z.string().max(40),
    description: z.string().max(2000).optional(),
    chapters: z.array(zChapterDef).optional(),
    passages: z.array(zPassage).optional(),
    questions: z.array(zQuestion).optional(),
    remember: z.array(zRemember).optional(),
    papers: z.array(zPaper).optional(),
  })
  .strict()
export type PackInput = z.input<typeof zPack>
export type Pack = z.output<typeof zPack>

/** Index file at the root of the private content repo, listing every pack. */
export const zContentIndex = z.object({
  format: z.literal('kagaku-index'),
  version: z.literal(1),
  updatedAt: z.string(),
  packs: z.array(
    z.object({
      id: zId,
      file: z.string().min(1),
      title: z.string(),
      chapters: z.array(z.string()),
      bytes: z.number().int().nonnegative(),
      sha256: z.string().length(64),
      counts: z.record(z.string(), z.number()).optional(),
    }),
  ),
})
export type ContentIndex = z.output<typeof zContentIndex>
