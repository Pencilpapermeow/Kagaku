// "Download the app": Kagaku is a PWA, so installing it puts an icon on the home screen and
// makes it open full-screen and offline. Android Chrome offers a one-tap install prompt;
// iPad/iPhone Safari has no prompt, only Share → Add to Home Screen.

import { useEffect, useState } from 'react'
import { CheckCircle2, Download, MoreVertical, Share, SquarePlus } from 'lucide-react'
import { Button } from './kit'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export type Platform = 'ios' | 'android' | 'other'

export function detectPlatform(ua = navigator.userAgent, platform = navigator.platform, touch = navigator.maxTouchPoints): Platform {
  // iPadOS Safari calls itself a Mac; the touch screen gives it away.
  if (/iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && touch > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
}

export function isInstalled(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

export function useInstall() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return {
    installed: isInstalled(),
    canPrompt: !!deferred,
    platform: detectPlatform(),
    async install() {
      if (!deferred) return false
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      deferred = null
      notify()
      return outcome === 'accepted'
    },
  }
}

/** Install button where the browser allows it, otherwise the steps for this device. */
export function InstallHelp({ compact }: { compact?: boolean }) {
  const { installed, canPrompt, platform, install } = useInstall()
  if (installed)
    return (
      <p className="good-text small install-done">
        <CheckCircle2 size={16} /> Kagaku is installed on this device.
      </p>
    )
  return (
    <div className="install">
      {canPrompt && (
        <Button variant="primary" icon={<Download size={18} />} onClick={install}>
          Download app
        </Button>
      )}
      {!canPrompt && platform === 'ios' && (
        <ol className="install-steps">
          <li>
            Open this page in <b>Safari</b>.
          </li>
          <li>
            Tap <Share size={16} className="inline-icon" /> <b>Share</b> (top right on iPad).
          </li>
          <li>
            Tap <SquarePlus size={16} className="inline-icon" /> <b>Add to Home Screen</b>, then <b>Add</b>.
          </li>
        </ol>
      )}
      {!canPrompt && platform === 'android' && (
        <ol className="install-steps">
          <li>
            Open this page in <b>Chrome</b>.
          </li>
          <li>
            Tap <MoreVertical size={16} className="inline-icon" /> (top right) → <b>Install app</b> (or <b>Add to Home screen</b>).
          </li>
        </ol>
      )}
      {!canPrompt && platform === 'other' && <p className="muted small">Open Kagaku in Chrome on Android or Safari on iPad to install it.</p>}
      {!compact && <p className="muted small">Installed, it opens full-screen from its own icon and works offline. Your data stays the same.</p>}
    </div>
  )
}
