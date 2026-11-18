// "Test from paper": synthetic fixtures (tools/fixtures/make_paper_fixtures.py) — a 2-column
// paper in the AITS (Mains) shape with its key, and a JA-style PDF holding Paper 1 and
// Paper 2 with one key for both. Nothing here is real exam or coaching material.

import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const fx = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw e
  })
})

async function openUpload(page: Page) {
  await page.goto('#/tests/paper')
  // First use downloads the PDF reader once.
  await expect(page.getByText('PDF reader ready')).toBeVisible({ timeout: 60_000 })
}

async function upload(page: Page, paper: string[], key: string[]) {
  await page.locator('input[type=file][data-role=paper]').setInputFiles(paper.map(fx))
  await page.locator('input[type=file][data-role=key]').setInputFiles(key.map(fx))
}

async function waitForCheck(page: Page, timeout: number) {
  await expect(page.getByRole('heading', { name: 'Check & start' })).toBeVisible({ timeout })
}

/** Answers Q1 right (option 2), Q2 wrong (option 1), Q5 right (20), then submits. Score: 4 − 1 + 4 = 7. */
async function takeTest(page: Page) {
  await page.getByRole('button', { name: /Start/ }).first().click()
  await page.getByRole('button', { name: 'I am ready to begin' }).click()
  await expect(page.getByText('Question No. 1')).toBeVisible()
  await expect(page.getByAltText('Question from your paper')).toBeVisible()
  await page.locator('.choice[data-option="2"]').click()
  await page.getByRole('button', { name: 'Save & Next' }).click()
  await page.locator('.choice[data-option="1"]').click()
  await page.getByRole('button', { name: 'Save & Next' }).click()
  await page.getByRole('button', { name: 'Save & Next' }).click()
  await page.getByRole('button', { name: 'Save & Next' }).click()
  await expect(page.getByText('Question No. 5')).toBeVisible()
  await page.getByLabel('Your answer').fill('20')
  await page.getByRole('button', { name: 'Save & Next' }).click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await page.getByRole('button', { name: 'Yes, submit' }).click()
  await expect(page.getByRole('heading', { name: 'Test analysis' })).toBeVisible()
  await expect(page.locator('.score b')).toHaveText('7')
  await expect(page.locator('.score span')).toHaveText('/ 40')
}

test('digital PDF paper + key PDF → checked test → correct score; wrong answer reaches Galti', async ({ page }) => {
  await openUpload(page)
  await upload(page, ['sample-paper.pdf'], ['sample-key.pdf'])
  await expect(page.getByText('3 pages')).toBeVisible()
  await expect(page.getByText('2 pages')).toBeVisible()
  await page.getByRole('button', { name: 'Make test' }).click()
  await waitForCheck(page, 60_000)
  await expect(page.locator('.check-line')).toContainText('10 questions found · key read for 10 · all look right')
  // Sections, types and marks were read from the paper.
  await expect(page.getByLabel('Physics · Section I: question type')).toHaveValue('single')
  await expect(page.getByLabel('Physics · Integer: question type')).toHaveValue('integer')
  await expect(page.getByLabel('Physics · Section I (Single): marks if wrong')).toHaveValue('-1')
  await expect(page.getByRole('button', { name: 'Question 5' })).toContainText('20')
  await expect(page.getByRole('button', { name: 'Question 10' })).toContainText('8')
  await expect(page.getByLabel('Time (minutes)')).toHaveValue('60')
  // Q3 runs into the right column: one picture, two parts.
  await page.getByRole('button', { name: 'Question 3', exact: true }).click()
  await expect(page.getByRole('dialog').getByAltText('Question 3')).toBeVisible()
  await page.keyboard.press('Escape')
  await takeTest(page)
  await page.goto('#/notebooks')
  await expect(page.locator('.galti-row')).toHaveCount(1)
  // Back in Tests: the paper is listed for re-attempts.
  await page.goto('#/tests')
  // Titled from the file name ("sample-paper.pdf").
  await expect(page.locator('.my-paper', { hasText: 'sample-paper' })).toBeVisible()
  await expect(page.getByText(/10 Questions · 60 Mins · Attempts: 1/)).toBeVisible()
})

test('JA style: Paper 1 and Paper 2 in one PDF become two papers, each with its own key and section marks', async ({ page }) => {
  await openUpload(page)
  await upload(page, ['sample-ja.pdf'], ['sample-ja-key.pdf'])
  await expect(page.getByText('4 pages')).toBeVisible()
  await page.getByRole('button', { name: 'Make test' }).click()
  await waitForCheck(page, 60_000)
  await expect(page.locator('.check-line')).toContainText('5 questions found · key read for 5 · all look right')
  await expect(page.getByText(/Paper 2 is now its own paper/)).toBeVisible()
  await expect(page.getByLabel('Physics · Section 2: question type')).toHaveValue('multiple')
  await expect(page.getByLabel('Physics · Section 2 (Multi): partial marking')).toBeChecked()
  await expect(page.getByLabel('Physics · Section 2 (Multi): marks if wrong')).toHaveValue('-2')
  await expect(page.getByLabel('Physics · Section 1 (Single): marks if correct')).toHaveValue('3')
  await expect(page.getByRole('button', { name: 'Question 3' })).toContainText('A,C')
  await expect(page.getByRole('button', { name: 'Question 5' })).toContainText('0.5')
  // Q1 right (+3), Q3 one of two right options (+1 partial), Q5 right (+3) = 7 of 17.
  await page.getByRole('button', { name: /Start/ }).first().click()
  await page.getByRole('button', { name: 'I am ready to begin' }).click()
  await page.locator('.choice[data-option="C"]').click()
  await page.getByRole('button', { name: 'Save & Next' }).click()
  await page.getByRole('button', { name: 'Save & Next' }).click()
  await page.locator('.choice[data-option="A"]').click()
  await page.getByRole('button', { name: 'Save & Next' }).click()
  await page.getByRole('button', { name: 'Save & Next' }).click()
  await page.getByLabel('Your answer').fill('0.5')
  await page.getByRole('button', { name: 'Save & Next' }).click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await page.getByRole('button', { name: 'Yes, submit' }).click()
  await expect(page.locator('.score b')).toHaveText('7')
  await expect(page.locator('.score span')).toHaveText('/ 17')
  // Paper 2 was made too, with Paper 2's answers.
  await page.goto('#/tests')
  const p2 = page.locator('.my-paper', { hasText: 'Paper 2' })
  await expect(p2).toContainText('5 Questions', { timeout: 30_000 })
  await p2.getByRole('link').click()
  await expect(page.getByRole('button', { name: 'Question 3' })).toContainText('A,B,D')
  await expect(page.getByRole('button', { name: 'Question 5' })).toContainText('9')
})

test('after the first visit, everything works offline (fixing a crop and the key included)', async ({ page, context }) => {
  await openUpload(page)
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await page.reload()
  await expect(page.getByText('PDF reader ready')).toBeVisible()
  await context.setOffline(true)
  expect(await page.evaluate(() => fetch('/__offline-probe__').then(() => 'online', () => 'offline'))).toBe('offline')
  await page.reload()
  await expect(page.getByText('PDF reader ready')).toBeVisible()
  await upload(page, ['sample-paper.pdf'], ['sample-key.pdf'])
  await expect(page.getByText('3 pages')).toBeVisible()
  await page.getByRole('button', { name: 'Make test' }).click()
  await waitForCheck(page, 60_000)
  // Change Q1's key to option 1, so answering 2 is now wrong.
  await page.getByRole('button', { name: 'Question 1', exact: true }).click()
  const dlg = page.getByRole('dialog')
  await dlg.getByRole('button', { name: 'Key option 1' }).click()
  await expect(dlg.getByRole('button', { name: 'Key option 1' })).toHaveAttribute('aria-pressed', 'true')
  await expect(dlg.getByRole('button', { name: 'Key option 2' })).toHaveAttribute('aria-pressed', 'false')
  // The crop editor opens on the page with Q1's box.
  await dlg.getByRole('button', { name: 'Fix crop' }).click()
  await expect(page.locator('.crop-rect.sel')).toBeVisible()
  await page.getByRole('button', { name: 'Save' }).click()
  // Back on the question, with its new picture.
  await expect(page.getByRole('dialog').getByAltText('Question 1')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: /Start/ }).first().click()
  await page.getByRole('button', { name: 'I am ready to begin' }).click()
  await page.locator('.choice[data-option="2"]').click()
  await page.getByRole('button', { name: 'Save & Next' }).click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await page.getByRole('button', { name: 'Yes, submit' }).click()
  await expect(page.locator('.score b')).toHaveText('-1')
  await context.setOffline(false)
})

test('the check and upload screens fit the screen', async ({ page }) => {
  await openUpload(page)
  const fits = async () => {
    const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }))
    expect(sw).toBeLessThanOrEqual(w + 1)
  }
  await upload(page, ['sample-paper.pdf', 'photo-paper-1.jpg'], ['sample-key.pdf'])
  await expect(page.locator('img.file-thumb')).toHaveCount(1)
  await page.getByRole('button', { name: 'Rotate' }).click()
  await fits()
  // Remove the photo again (PDFs are the real path).
  await page.locator('.file-item', { has: page.locator('img.file-thumb') }).getByRole('button', { name: 'Remove' }).click()
  await expect(page.locator('.file-item')).toHaveCount(2)
  await page.getByRole('button', { name: 'Make test' }).click()
  await waitForCheck(page, 60_000)
  await fits()
  await page.getByRole('button', { name: 'Show every question with its picture' }).click()
  await fits()
})
