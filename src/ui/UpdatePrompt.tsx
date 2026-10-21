import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'
import { Button } from './kit'

/** Shows a banner when a new app version has been downloaded. Data is never affected. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Check for a new version every hour while the app is open.
      if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
    },
  })
  if (!needRefresh) return null
  return (
    <div className="banner banner-accent">
      <RefreshCw size={18} />
      <span>A new version of Kagaku is ready.</span>
      <Button size="sm" variant="primary" onClick={() => updateServiceWorker(true)}>
        Update
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        Later
      </Button>
    </div>
  )
}
