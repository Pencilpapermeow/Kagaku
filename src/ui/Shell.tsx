import { NavLink, Outlet } from 'react-router-dom'
import { BookMarked, ClipboardList, Home, Search, Settings2 } from 'lucide-react'
import { Logo } from './Logo'
import { UpdatePrompt } from './UpdatePrompt'

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/tests', label: 'Tests', icon: ClipboardList },
  { to: '/notebooks', label: 'Notebooks', icon: BookMarked },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/settings', label: 'More', icon: Settings2 },
]

export function Shell() {
  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <div className="rail-logo">
          <Logo size={34} />
          <span>Kagaku</span>
        </div>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
            <Icon size={22} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="page">
        <UpdatePrompt />
        <Outlet />
      </main>
    </div>
  )
}
