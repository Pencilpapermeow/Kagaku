import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
})

/** Draws a wavy line across the pad with the mouse (a pointer like the stylus). */
async function scribble(page: Page, fromX: number, fromY: number, w = 220) {
  const box = (await page.getByTestId('ink-page').boundingBox())!
  const x0 = box.x + box.width * fromX
  const y0 = box.y + box.height * fromY
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (let i = 1; i <= 16; i++) await page.mouse.move(x0 + (w * i) / 16, y0 + Math.sin(i / 2) * 12)
  await page.mouse.up()
}

async function noSideScroll(page: Page) {
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }))
  expect(sw, 'page must not scroll sideways').toBeLessThanOrEqual(w + 1)
}

test('handwritten point cards: write, undo, title, self-test, reopen', async ({ page }) => {
  await page.goto('#/c/phy.thermodynamics?tab=notes')
  await page.getByRole('button', { name: 'Write a point' }).click()
  await expect(page.getByTestId('ink-page')).toBeVisible()
  await noSideScroll(page)

  await scribble(page, 0.1, 0.2)
  await scribble(page, 0.1, 0.45)
  await page.getByRole('button', { name: 'Pen red' }).click()
  await scribble(page, 0.1, 0.7)
  await expect(page.getByText('3 strokes')).toBeVisible()
  await expect(page.locator('.ink-layer-pen path.ink-c-red')).toHaveCount(1)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('2 strokes')).toBeVisible()
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(page.getByText('3 strokes')).toBeVisible()

  // Eraser removes the stroke it touches.
  await page.getByRole('button', { name: 'Eraser' }).click()
  await scribble(page, 0.1, 0.7, 120)
  await expect(page.getByText('2 strokes')).toBeVisible()

  await page.getByLabel('Card title').fill('First law sign convention')
  await page.getByRole('button', { name: 'Done' }).click()

  await expect(page.getByText('Handwritten points · 1')).toBeVisible()
  const card = page.locator('.ink-card').first()
  await expect(card.getByText('First law sign convention')).toBeVisible()
  await expect(card.locator('.ink-layer-pen path')).toHaveCount(2)

  await page.getByRole('button', { name: 'Self-test' }).click()
  await expect(card.locator('.ink-cover')).toBeVisible()
  await card.getByRole('button', { name: /Reveal/ }).click()
  await expect(card.locator('.ink-cover')).toHaveCount(0)
  await noSideScroll(page)

  // Saved: still there after a reload, and it opens again for more writing.
  await page.reload()
  await expect(page.locator('.ink-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Edit First law sign convention' }).click()
  await expect(page.getByText('2 strokes')).toBeVisible()

  // Notebooks lists the chapter.
  await page.getByRole('button', { name: 'Done' }).click()
  await page.goto('#/notebooks?tab=notes')
  await expect(page.getByText('1 card')).toBeVisible()
})

test('an empty card is not kept, and the palm guard ignores touches', async ({ page }) => {
  await page.goto('#/c/phy.thermodynamics?tab=notes')
  await page.getByRole('button', { name: 'Write a point' }).click()
  const guard = page.getByRole('button', { name: /Palm guard/ })
  if ((await guard.getAttribute('aria-pressed')) !== 'true') await guard.click()
  await expect(page.getByLabel('Palm guard: touches here are ignored')).toBeVisible()
  // A "palm" on the guard draws nothing.
  const g = (await page.getByLabel('Palm guard: touches here are ignored').boundingBox())!
  await page.mouse.move(g.x + 40, g.y + g.height / 2)
  await page.mouse.down()
  await page.mouse.move(g.x + 200, g.y + g.height / 2 + 10)
  await page.mouse.up()
  await expect(page.getByText('0 strokes')).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.ink-card')).toHaveCount(0)
  await expect(page.getByText(/one card per point/)).toBeVisible()
})
