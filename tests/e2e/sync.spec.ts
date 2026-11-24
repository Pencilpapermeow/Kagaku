import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { fakeGithub, type FakeGithub } from '../../src/test/fakeGithub'

// Two devices (two browser profiles) syncing through a stand-in for GitHub's API.

async function connect(ctx: BrowserContext, gh: FakeGithub) {
  await ctx.route('https://api.github.com/**', async (route) => {
    const req = route.request()
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH' }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const res = await gh.fetch(req.url(), { method: req.method(), body: req.postData() ?? undefined })
    await route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.headers.get('content-type') ?? 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) })
  })
}

async function saveToken(page: Page) {
  await page.goto('#/settings')
  // On a brand-new device the app is still writing its first settings for a moment.
  await expect(async () => {
    await page.getByPlaceholder('github_pat_…').fill('github_pat_test')
    await page.getByRole('button', { name: 'Save token' }).click()
    await expect(page.getByLabel('Sync this device automatically')).toBeEnabled({ timeout: 1000 })
  }).toPass()
}

async function turnOnSync(page: Page) {
  await saveToken(page)
  await page.getByLabel('Sync this device automatically').check()
  await expect(page.getByTestId('sync-status')).toContainText('Last synced')
}

async function scribble(page: Page) {
  const box = (await page.getByTestId('ink-page').boundingBox())!
  await page.mouse.move(box.x + 40, box.y + 60)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 40 + i * 15, box.y + 60 + (i % 3) * 8)
  await page.mouse.up()
}

test('a card written on one device appears on the other, and a delete travels back', async ({ browser, baseURL }, info) => {
  test.skip(info.project.name !== 'ipad-landscape', 'one run is enough')
  const gh = fakeGithub('Pencilpapermeow/kagaku-content')
  const ipad = await browser.newContext({ baseURL })
  const phone = await browser.newContext({ baseURL, viewport: { width: 412, height: 915 } })
  await connect(ipad, gh)
  await connect(phone, gh)
  const A = await ipad.newPage()
  const B = await phone.newPage()
  for (const p of [A, B])
    p.on('pageerror', (e) => {
      throw e
    })

  // iPad: write a point and a typed note, then turn sync on.
  await A.goto('#/c/phy.thermodynamics?tab=notes')
  await A.getByRole('button', { name: 'Write a point' }).click()
  await scribble(A)
  await A.getByLabel('Card title').fill('Work done by gas')
  await A.getByRole('button', { name: 'Done' }).click()
  await expect(A.locator('.ink-card')).toHaveCount(1)
  await A.getByPlaceholder(/Write a note/).fill('Isothermal: $W = nRT \\ln \\frac{V_2}{V_1}$')
  await A.getByRole('button', { name: 'Save note' }).click()
  await turnOnSync(A)
  await expect(A.getByTestId('sync-status')).toContainText('2 sent')
  expect([...gh.files().keys()].filter((p) => p.startsWith('ink/') || p.startsWith('notes/'))).toHaveLength(2)

  // Phone: turn sync on → both arrive.
  await turnOnSync(B)
  await expect(B.getByTestId('sync-status')).toContainText('2 arrived')
  await B.goto('#/c/phy.thermodynamics?tab=notes')
  await expect(B.locator('.ink-card')).toHaveCount(1)
  await expect(B.locator('.ink-card').getByText('Work done by gas')).toBeVisible()
  await expect(B.locator('.ink-card .ink-layer-pen path')).toHaveCount(1)
  await expect(B.locator('.note .katex').first()).toBeVisible()

  // Phone deletes the card; the iPad loses it on its next sync.
  B.once('dialog', (d) => d.accept())
  await B.getByRole('button', { name: 'Delete Work done by gas' }).click()
  await expect(B.locator('.ink-card')).toHaveCount(0)
  await B.goto('#/settings')
  await B.getByRole('button', { name: 'Sync now' }).click()
  await expect(B.getByTestId('sync-status')).toContainText('Last synced')
  await expect.poll(() => [...gh.files().keys()].filter((p) => p.startsWith('ink/')).length).toBe(0)

  await A.getByRole('button', { name: 'Sync now' }).click()
  await A.goto('#/c/phy.thermodynamics?tab=notes')
  await expect(A.locator('.ink-card')).toHaveCount(0)
  await expect(A.locator('.note')).toHaveCount(1)

  await ipad.close()
  await phone.close()
})

test('a token that can only read gets a clear message', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'one run is enough')
  const gh = fakeGithub('Pencilpapermeow/kagaku-content')
  gh.readOnly = true
  await connect(page.context(), gh)
  await page.goto('#/c/phy.thermodynamics?tab=notes')
  await page.getByRole('button', { name: 'Write a point' }).click()
  await scribble(page)
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.ink-card')).toHaveCount(1)
  await saveToken(page)
  await page.getByLabel('Sync this device automatically').check()
  await expect(page.getByText(/Contents: Read and write/).first()).toBeVisible()
})
