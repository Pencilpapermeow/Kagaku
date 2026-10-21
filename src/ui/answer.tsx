// Answer inputs for every question format, shared by Practice and the CBT test.

import { Check, Delete, X } from 'lucide-react'
import type { Question } from '../content/schema'
import { ASSERTION_TEXT, effectiveAnswer, type Response } from '../engine/marking'
import { isLettersOnly, labelAt } from '../engine/variants'
import { MediaImage, Rich } from './content'
import { cx } from './kit'

export interface AnswerProps {
  q: Question
  value: Response | undefined
  onChange: (r: Response | undefined) => void
  /** After checking: lock input and colour right/wrong. */
  reveal?: boolean
  variant?: 'practice' | 'cbt'
}

export function AnswerInput(p: AnswerProps) {
  switch (p.q.format) {
    case 'single':
    case 'multiple':
    case 'assertion':
      return <ChoiceInput {...p} />
    case 'integer':
    case 'numerical':
      return <NumberInput {...p} />
    case 'truefalse':
      return <TrueFalseInput {...p} />
    case 'match':
      return <MatchInput {...p} />
    case 'ordering':
      return <OrderInput {...p} />
  }
}

function choiceList(q: Question): { id: string; text?: string; image?: string }[] {
  if (q.format === 'assertion') {
    const codes = (['both-explains', 'both-not-explains', 'a-only', 'r-only'] as const).slice()
    const all: (keyof typeof ASSERTION_TEXT)[] = q.withNeither ? [...codes, 'neither'] : [...codes]
    return all.map((id) => ({ id, text: ASSERTION_TEXT[id] }))
  }
  return q.format === 'single' || q.format === 'multiple' ? q.options : []
}

function ChoiceInput({ q, value, onChange, reveal, variant = 'practice' }: AnswerProps) {
  const multi = q.format === 'multiple'
  const chosen = value?.kind === 'options' ? value.ids : []
  const answer = effectiveAnswer(q)
  const correctIds = Array.isArray(answer) ? (answer as string[]) : [answer as string]
  const compact = isLettersOnly(q)
  const toggle = (id: string) => {
    if (reveal) return
    if (multi) {
      const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]
      onChange(next.length ? { kind: 'options', ids: next } : undefined)
    } else onChange(chosen[0] === id && variant === 'cbt' ? undefined : { kind: 'options', ids: [id] })
  }
  const opts = choiceList(q)
  return (
    <div className={cx('choices', compact && 'choices-compact', variant === 'cbt' && 'choices-cbt')} role={multi ? 'group' : 'radiogroup'}>
      {multi && !reveal && <div className="hint">One or more options can be correct.</div>}
      {opts.map((o, i) => {
        const isChosen = chosen.includes(o.id)
        const isRight = correctIds.includes(o.id)
        const state = reveal ? (isRight ? 'right' : isChosen ? 'wrong' : 'dim') : isChosen ? 'chosen' : ''
        return (
          <button
            key={o.id}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={isChosen}
            className={cx('choice', state, multi && 'multi')}
            onClick={() => toggle(o.id)}
            data-option={compact ? o.id : labelAt(i)}
          >
            <span className="choice-key">{compact ? o.id : labelAt(i)}</span>
            {!compact && (
              <span className="choice-body">
                <Rich text={o.text} as="span" />
                {o.image && <MediaImage src={o.image} alt={`Option ${labelAt(i)}`} />}
              </span>
            )}
            {reveal && isRight && <Check className="choice-mark" size={18} />}
            {reveal && isChosen && !isRight && <X className="choice-mark" size={18} />}
          </button>
        )
      })}
    </div>
  )
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '-', '0', '.']

function NumberInput({ q, value, onChange, reveal }: AnswerProps) {
  const text = value?.kind === 'number' ? (value.raw ?? String(value.value)) : ''
  const set = (raw: string) => {
    if (raw === '' || raw === '-') return onChange(raw ? { kind: 'number', value: NaN, raw } : undefined)
    onChange({ kind: 'number', value: Number(raw), raw })
  }
  const press = (k: string) => {
    if (reveal) return
    if (k === '.' && (q.format === 'integer' || text.includes('.'))) return
    if (k === '-') return set(text.startsWith('-') ? text.slice(1) : `-${text}`)
    if (text.replace(/[-.]/g, '').length >= 10) return
    set(text + k)
  }
  return (
    <div className="numpad">
      <div className={cx('num-display', reveal && 'locked')}>
        <input
          inputMode="decimal"
          aria-label="Your answer"
          value={text}
          placeholder={q.format === 'integer' ? 'Enter an integer' : 'Enter a number'}
          readOnly={reveal}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.-]/g, '')
            set(q.format === 'integer' ? v.replace(/\./g, '') : v)
          }}
        />
      </div>
      {!reveal && (
        <div className="keys">
          {KEYS.map((k) => (
            <button key={k} type="button" className="key" onClick={() => press(k)} disabled={k === '.' && q.format === 'integer'}>
              {k}
            </button>
          ))}
          <button type="button" className="key key-wide" onClick={() => set(text.slice(0, -1))} aria-label="Backspace">
            <Delete size={18} />
          </button>
          <button type="button" className="key key-wide" onClick={() => set('')}>
            Clear
          </button>
        </div>
      )}
      {reveal && (
        <div className="reveal-line">
          Answer: <b>{String(effectiveAnswer(q))}</b>
          {q.format === 'numerical' && <span className="muted"> (±{q.tolerance ?? 0.01})</span>}
        </div>
      )}
    </div>
  )
}

function TrueFalseInput({ q, value, onChange, reveal }: AnswerProps) {
  const chosen = value?.kind === 'bool' ? value.value : undefined
  const answer = effectiveAnswer(q) as boolean
  return (
    <div className="tf">
      {[true, false].map((v) => {
        const state = reveal ? (v === answer ? 'right' : chosen === v ? 'wrong' : 'dim') : chosen === v ? 'chosen' : ''
        return (
          <button key={String(v)} type="button" className={cx('choice tf-btn', state)} aria-pressed={chosen === v} onClick={() => !reveal && onChange({ kind: 'bool', value: v })}>
            <span className="choice-key">{v ? 'T' : 'F'}</span>
            <span className="choice-body">{v ? 'True' : 'False'}</span>
          </button>
        )
      })}
    </div>
  )
}

function MatchInput({ q, value, onChange, reveal }: AnswerProps) {
  if (q.format !== 'match') return null
  const pairs = value?.kind === 'match' ? value.pairs : {}
  const answer = effectiveAnswer(q) as Record<string, string | string[]>
  const want = (l: string) => {
    const a = answer[l]
    return Array.isArray(a) ? a : [a]
  }
  const toggle = (l: string, r: string) => {
    if (reveal) return
    const cur = pairs[l] ?? []
    const next = { ...pairs, [l]: cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r] }
    onChange(Object.values(next).some((v) => v.length) ? { kind: 'match', pairs: next } : undefined)
  }
  return (
    <div className="match">
      <div className="match-cols">
        <div>
          <div className="match-head">Column I</div>
          {q.left.map((l) => (
            <div key={l.id} className="match-item">
              <b>{l.id}.</b> <Rich as="span" text={l.text} />
              {l.image && <MediaImage src={l.image} />}
            </div>
          ))}
        </div>
        <div>
          <div className="match-head">Column II</div>
          {q.right.map((r) => (
            <div key={r.id} className="match-item">
              <b>{r.id}.</b> <Rich as="span" text={r.text} />
              {r.image && <MediaImage src={r.image} />}
            </div>
          ))}
        </div>
      </div>
      <div className="match-grid" style={{ gridTemplateColumns: `2.4rem repeat(${q.right.length}, minmax(2.4rem, 1fr))` }}>
        <span />
        {q.right.map((r) => (
          <span key={r.id} className="mg-head">
            {r.id}
          </span>
        ))}
        {q.left.map((l) => (
          <div key={l.id} className="mg-row" style={{ display: 'contents' }}>
            <span className="mg-head">{l.id}</span>
            {q.right.map((r) => {
              const on = (pairs[l.id] ?? []).includes(r.id)
              const right = want(l.id).includes(r.id)
              const state = reveal ? (right ? 'right' : on ? 'wrong' : '') : on ? 'chosen' : ''
              return (
                <button key={r.id} type="button" className={cx('mg-cell', state)} aria-pressed={on} aria-label={`${l.id} matches ${r.id}`} onClick={() => toggle(l.id, r.id)}>
                  {(on || (reveal && right)) && <Check size={16} />}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function OrderInput({ q, value, onChange, reveal }: AnswerProps) {
  if (q.format !== 'ordering') return null
  const seq = value?.kind === 'order' ? value.ids : []
  const byId = new Map(q.items.map((i) => [i.id, i]))
  const answer = effectiveAnswer(q) as string[]
  const add = (id: string) => !reveal && onChange({ kind: 'order', ids: [...seq, id] })
  const remove = (id: string) => {
    if (reveal) return
    const next = seq.filter((x) => x !== id)
    onChange(next.length ? { kind: 'order', ids: next } : undefined)
  }
  return (
    <div className="order">
      <div className="order-seq" aria-label="Your order">
        {seq.length === 0 && <span className="muted">Tap items in order…</span>}
        {seq.map((id, i) => (
          <button key={id} type="button" className={cx('order-chip in-seq', reveal && (answer[i] === id ? 'right' : 'wrong'))} onClick={() => remove(id)}>
            <span className="order-n">{i + 1}</span>
            <Rich as="span" text={byId.get(id)?.text} />
          </button>
        ))}
      </div>
      {!reveal && (
        <div className="order-pool">
          {q.items
            .filter((i) => !seq.includes(i.id))
            .map((i) => (
              <button key={i.id} type="button" className="order-chip" onClick={() => add(i.id)}>
                <Rich as="span" text={i.text} />
              </button>
            ))}
        </div>
      )}
      {reveal && (
        <div className="reveal-line">
          Correct order:{' '}
          {answer.map((id, i) => (
            <span key={id}>
              {i > 0 && ' → '}
              <Rich as="span" text={byId.get(id)?.text} />
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
