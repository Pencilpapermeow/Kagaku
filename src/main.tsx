import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/jetbrains-mono'
import 'katex/dist/katex.min.css'
import './styles/tokens.css'
import './styles/app.css'
import { App } from './App'
import { getSetting, setSetting } from './db/settings'

async function boot() {
  // Apply the theme before first paint of the app to avoid a flash.
  const theme = await getSetting('theme').catch(() => 'dark' as const)
  document.documentElement.dataset.theme = theme
  if (!(await getSetting('installedAt').catch(() => 1))) await setSetting('installedAt', Date.now()).catch(() => {})
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

boot()
