import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Shell } from './ui/Shell'
import { HomePage } from './pages/Home'
import { SubjectPage } from './pages/Subject'
import { ChapterPage } from './pages/Chapter'
import { PracticePage } from './pages/Practice'
import { TestsPage } from './pages/Tests'
import { TestBuilderPage } from './pages/TestBuilder'
import { CbtPage } from './pages/Cbt'
import { ResultPage } from './pages/Result'
import { NotebooksPage } from './pages/Notebooks'
import { UpdatePage } from './pages/Update'
import { SettingsPage } from './pages/Settings'
import { SearchPage } from './pages/Search'
import { useSettings } from './db/settings'

function ThemeSync() {
  const { theme } = useSettings()
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f5f5fb' : '#0a0f1f')
  }, [theme])
  return null
}

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  return null
}

function Toasts() {
  const [msg, setMsg] = useState<string>()
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const on = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail)
      clearTimeout(t)
      t = setTimeout(() => setMsg(undefined), 2600)
    }
    window.addEventListener('kagaku:toast', on)
    return () => window.removeEventListener('kagaku:toast', on)
  }, [])
  return msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null
}

export function App() {
  return (
    <HashRouter>
      <ThemeSync />
      <ScrollTop />
      <Toasts />
      <Routes>
        {/* Full-screen moods: practice and the CBT test hide the navigation. */}
        <Route path="/practice" element={<PracticePage />} />
        <Route path="/test/:id" element={<CbtPage />} />
        <Route element={<Shell />}>
          <Route index element={<HomePage />} />
          <Route path="/s/:subject" element={<SubjectPage />} />
          <Route path="/c/:chapter" element={<ChapterPage />} />
          <Route path="/tests" element={<TestsPage />} />
          <Route path="/tests/new" element={<TestBuilderPage />} />
          <Route path="/test/:id/result" element={<ResultPage />} />
          <Route path="/notebooks" element={<NotebooksPage />} />
          <Route path="/update" element={<UpdatePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
