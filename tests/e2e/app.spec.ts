import { expect, test, type Page } from '@playwright/test'

async function loadDemo(page: Page) {
  await page.goto('#/update')
  await page.getByRole('button', { name: 'Load the demo pack' }).click()
  await expect(page.getByText('14 questions')).toBeVisible()
  await page.getByRole('button', { name: 'Add to Kagaku' }).click()
  // Wait until the pack is stored (the remove button only exists for installed packs).
  await expect(page.getByRole('button', { name: 'Remove Demo pack (try every screen)' })).toBeVisible()
}

async function noSideScroll(page: Page) {
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }))
  expect(sw, 'page must not scroll sideways').toBeLessThanOrEqual(w + 1)
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
})

test('home, subjects and every main page fit the screen', async ({ page }) => {
  await page.goto('')
  await expect(page.getByRole('heading', { name: /Kagaku/ })).toBeVisible()
  await expect(page.getByText('days left')).toBeVisible()
  await loadDemo(page)
  for (const path of ['', '#/s/phy', '#/s/chem?unit=physical', '#/c/phy.thermodynamics', '#/c/chem.mole-concept', '#/tests', '#/tests/new', '#/notebooks', '#/search', '#/settings', '#/update']) {
    await page.goto(path)
    await page.waitForTimeout(150)
    await noSideScroll(page)
  }
  await page.goto('')
  await expect(page.getByText('0/10 Qs')).toBeVisible()
})

test('To Remember renders formulas, tables and self-test mode', async ({ page }) => {
  await loadDemo(page)
  await page.goto('#/c/phy.thermodynamics')
  await expect(page.getByRole('heading', { name: 'First law of thermodynamics' })).toBeVisible()
  await expect(page.locator('.math-block .katex').first()).toBeVisible()
  await page.getByRole('button', { name: 'Self-test mode' }).click()
  await expect(page.locator('.hideable.covered').first()).toBeVisible()
  await page.locator('.hideable.covered').first().click()
  await expect(page.locator('.rcard').first().locator('.hideable.covered')).toHaveCount(0)
})

test('practice: wrong answers go to the Galti Notebook', async ({ page }) => {
  await loadDemo(page)
  await page.goto('#/practice?c=chem.periodicity&m=questions')
  for (let i = 0; i < 2; i++) {
    await expect(page.locator('.pcard .choice').first()).toBeVisible()
    const tf = page.getByRole('button', { name: 'False' })
    if (await tf.count()) await tf.click()
    else await page.locator('.choice').first().click()
    await page.getByRole('button', { name: 'Check' }).click()
    await expect(page.locator('.feedback')).toBeVisible()
    await page.getByRole('button', { name: /Next|Finish/ }).click()
  }
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()
  await page.goto('#/notebooks')
  await expect(page.locator('.galti-row').first()).toBeVisible()
  await expect(page.getByText(/Active · [12]/)).toBeVisible()
})

test('practice works for match, ordering and numerical inputs', async ({ page }) => {
  await loadDemo(page)
  await page.goto('#/practice?c=phy.units-measurements&m=questions')
  await page.getByRole('button', { name: 'P matches 2' }).click()
  await page.getByRole('button', { name: 'Q matches 4' }).click()
  await page.getByRole('button', { name: 'R matches 3' }).click()
  await page.getByRole('button', { name: 'S matches 1' }).click()
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.locator('.feedback.good')).toBeVisible()

  await page.goto('#/practice?c=chem.periodicity&m=generated&f=ordering')
  await expect(page.locator('.stem-text')).toContainText('Arrange in')
  const stem = await page.locator('.stem-text').innerText()
  // Two demo trends exist; the session may start with either.
  const order = stem.includes('electronegativity') ? ['I', 'Br', 'Cl', 'F'] : ['Li', 'B', 'Be', 'C', 'O', 'N', 'F', 'Ne']
  for (const el of stem.includes('decreasing') ? [...order].reverse() : order) await page.locator('.order-pool .order-chip', { hasText: new RegExp(`^${el}$`) }).first().click()
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.locator('.feedback.good')).toBeVisible()

  await page.goto('#/practice?c=phy.thermodynamics&m=questions&f=numerical')
  await page.getByLabel('Your answer').fill('2.5')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.locator('.feedback')).toBeVisible()
})

test('CBT: NTA palette, save & next, submit and analysis', async ({ page }) => {
  await loadDemo(page)
  await page.goto('#/tests')
  await page.getByRole('button', { name: 'Start' }).first().click()
  await page.getByRole('button', { name: 'I am ready to begin' }).click()
  await expect(page.getByText('Question No. 1')).toBeVisible()
  await page.locator('.choice').first().click()
  await page.getByRole('button', { name: 'Save & Next' }).click()
  await expect(page.getByText('Question No. 2')).toBeVisible()
  await page.getByRole('button', { name: 'Mark for Review & Next' }).click()
  await page.getByRole('button', { name: 'Chemistry' }).click()
  await expect(page.getByText('Question No. 1')).toBeVisible()
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByRole('dialog')).toContainText('Marked for Review')
  await page.getByRole('button', { name: 'Yes, submit' }).click()
  await expect(page.getByRole('heading', { name: 'Test analysis' })).toBeVisible()
  await expect(page.getByText('By chapter')).toBeVisible()
  await noSideScroll(page)
})

test('custom test builder creates a CBT test', async ({ page }) => {
  await loadDemo(page)
  await page.goto('#/tests/new')
  await page.getByRole('button', { name: 'Physics' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: /^Thermodynamics/ }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Start test' }).click()
  await expect(page.getByRole('button', { name: 'I am ready to begin' })).toBeVisible()
})

test('settings: theme switch and backup download', async ({ page }) => {
  await page.goto('#/settings')
  await page.getByRole('button', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download backup' }).click()
  expect((await download).suggestedFilename()).toMatch(/^kagaku-backup-\d{4}-\d\d-\d\d\.json$/)
})

test('search finds formulas and ions', async ({ page }) => {
  await loadDemo(page)
  await page.goto('#/search')
  await page.getByLabel('Search').fill('nitrate')
  await expect(page.getByText('Common polyatomic ions')).toBeVisible()
})

test('imports a .kagaku file; photo questions hide options until "think first" is tapped', async ({ page }) => {
  const { zipSync, strToU8 } = await import('fflate')
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#fff"/><text x="20" y="60" font-size="28">Q. Photo question</text><text x="20" y="220" font-size="28">(A) 1  (B) 2  (C) 3  (D) 4</text></svg>'
  const pack = {
    format: 'kagaku-pack',
    version: 1,
    id: 'e2e-photo',
    title: 'Photo pack',
    createdAt: '2026-10-21',
    questions: [{ chapter: 'phy.ray-optics', format: 'single', image: 'img/q.svg', imageSplit: 0.55, optionsInImage: true, options: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }], answer: 'C' }],
  }
  const zip = zipSync({ 'pack.json': strToU8(JSON.stringify(pack)), 'img/q.svg': strToU8(svg) })
  await page.goto('#/update')
  await page.locator('input[type=file]').setInputFiles({ name: 'photo.kagaku', mimeType: 'application/zip', buffer: Buffer.from(zip) })
  await expect(page.getByText('1 images')).toBeVisible()
  await page.getByRole('button', { name: 'Add to Kagaku' }).click()
  await expect(page.getByRole('button', { name: 'Remove Photo pack' })).toBeVisible()
  await page.goto('#/practice?c=phy.ray-optics&m=questions')
  await expect(page.getByText(/Think first/)).toBeVisible()
  await expect(page.locator('.choice')).toHaveCount(0)
  await page.getByText(/Think first/).click()
  await page.locator('.choice[data-option="C"]').click()
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.locator('.feedback.good')).toBeVisible()
})
