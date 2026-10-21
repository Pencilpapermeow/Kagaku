import { useId } from 'react'

/** Kagaku mark: a benzene-like hexagon with an orbiting electron. */
export function Logo({ size = 32 }: { size?: number }) {
  // Each instance needs its own gradient id: a hidden copy (e.g. in the phone layout's
  // collapsed rail) would otherwise blank out the visible one.
  const id = `kg${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9f8cff" />
          <stop offset="1" stopColor="#2fd4f5" />
        </linearGradient>
      </defs>
      <polygon points="32,8 52.8,20 52.8,44 32,56 11.2,44 11.2,20" fill="none" stroke={`url(#${id})`} strokeWidth="5" strokeLinejoin="round" />
      <ellipse cx="32" cy="32" rx="25" ry="9" fill="none" stroke="#ff6fb1" strokeWidth="2.5" transform="rotate(-30 32 32)" opacity=".9" />
      <circle cx="32" cy="32" r="5.5" fill={`url(#${id})`} />
      <circle cx="53" cy="20.5" r="3.6" fill="#ff6fb1" />
    </svg>
  )
}
