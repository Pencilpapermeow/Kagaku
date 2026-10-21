// Small shared UI pieces. Styling lives in styles/app.css.

import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, X } from 'lucide-react'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'soft' | 'danger' | 'good'
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  block?: boolean
}

export function Button({ variant = 'soft', size = 'md', icon, block, className, children, ...rest }: BtnProps) {
  return (
    <button type="button" className={cx('btn', `btn-${variant}`, `btn-${size}`, block && 'btn-block', className)} {...rest}>
      {icon}
      {children && <span>{children}</span>}
    </button>
  )
}

export function TopBar({ title, sub, back = true, right }: { title: ReactNode; sub?: ReactNode; back?: boolean | string; right?: ReactNode }) {
  const nav = useNavigate()
  return (
    <header className="topbar">
      {back && (
        <button
          type="button"
          className="icon-btn"
          aria-label="Back"
          onClick={() => (typeof back === 'string' ? nav(back) : window.history.length > 1 ? nav(-1) : nav('/'))}
        >
          <ChevronLeft size={22} />
        </button>
      )}
      <div className="topbar-title">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {right && <div className="topbar-right">{right}</div>}
    </header>
  )
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode; badge?: number }[]; className?: string }) {
  return (
    <div className={cx('tabs', className)} role="tablist">
      {items.map((it) => (
        <button key={it.id} type="button" role="tab" aria-selected={value === it.id} className={cx('tab', value === it.id && 'active')} onClick={() => onChange(it.id)}>
          {it.label}
          {it.badge ? <span className="tab-badge">{it.badge}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function Chip({ active, onClick, children, tone }: { active?: boolean; onClick?: () => void; children: ReactNode; tone?: string }) {
  return (
    <button type="button" className={cx('chip', active && 'active', tone && `tone-${tone}`)} aria-pressed={!!active} onClick={onClick}>
      {children}
    </button>
  )
}

export function Bar({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="bar" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export function Ring({ value, max, size = 92, stroke = 9, color = 'var(--accent)', children }: { value: number; max: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(1, value / max) : 0
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray .6s ease' }}
        />
      </svg>
      <div className="ring-inner">{children}</div>
    </div>
  )
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children && <div className="empty-body">{children}</div>}
    </div>
  )
}

export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={cx('sheet', wide && 'sheet-wide')} role="dialog" aria-modal="true" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'accent' }) {
  return (
    <div className={cx('stat', tone && `tone-${tone}`)}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

export function toast(message: string) {
  window.dispatchEvent(new CustomEvent('kagaku:toast', { detail: message }))
}
