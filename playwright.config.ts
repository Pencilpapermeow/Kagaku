import { defineConfig, devices } from '@playwright/test'

const port = 4173
// Inside the Claude container the browser lives at a fixed path; CI downloads its own.
const executablePath = process.env.KAGAKU_CHROMIUM || undefined

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}${process.env.KAGAKU_BASE ?? '/'}`,
    trace: 'retain-on-failure',
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'ipad-portrait', use: { ...devices['iPad (gen 7)'], defaultBrowserType: 'chromium' } },
    { name: 'ipad-landscape', use: { ...devices['iPad (gen 7) landscape'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: `npx vite preview --port ${port} --strictPort`,
    port,
    reuseExistingServer: !process.env.CI,
  },
})
