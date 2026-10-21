// Renders public/icon.svg to the PNG sizes the PWA manifest and iOS need.
// Run: node tools/icons/render.mjs   (uses Playwright's Chromium)
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const svg = readFileSync(new URL('../../public/icon.svg', import.meta.url), 'utf8')
const out = (f) => new URL(`../../public/${f}`, import.meta.url).pathname
const browser = await chromium.launch({ executablePath: process.env.KAGAKU_CHROMIUM || undefined })
const page = await browser.newPage()
async function render(size, file, { maskable = false } = {}) {
  await page.setViewportSize({ width: size, height: size })
  // Maskable icons need the artwork inside the central 80% safe zone.
  const inner = maskable ? Math.round(size * 0.8) : size
  await page.setContent(
    `<html><body style="margin:0;background:${maskable ? '#0a0f1f' : 'transparent'};display:grid;place-items:center;width:${size}px;height:${size}px">` +
      svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `) +
      '</body></html>',
  )
  await page.screenshot({ path: out(file), omitBackground: !maskable })
}
await render(192, 'icon-192.png')
await render(512, 'icon-512.png')
await render(512, 'icon-maskable-512.png', { maskable: true })
await render(180, 'apple-touch-icon.png', { maskable: true })
await browser.close()
console.log('icons written')
