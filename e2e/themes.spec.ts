import { FIRST, expect, openBook, test, waitForReader } from './fixtures.ts';

const pageBody = (page: import('@playwright/test').Page) =>
  page.frameLocator('.reader__container iframe').locator('body');

test('custom theme colours the app and the book, warns on low contrast, and survives a reload', async ({ page }) => {
  await openBook(page, FIRST);
  await page.getByRole('button', { name: 'Display settings' }).click();
  await page.locator('.segmented__btn', { hasText: /^Custom$/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'custom');

  await page.getByLabel('Page colour').fill('#102030');
  await page.getByLabel('Text colour').fill('#e8e0d0');
  await page.getByLabel('Links and buttons colour').fill('#335577');

  // The book page and the app shell both pick up the colours.
  await expect(pageBody(page)).toHaveCSS('background-color', 'rgb(16, 32, 48)');
  await expect(pageBody(page)).toHaveCSS('color', 'rgb(232, 224, 208)');
  await expect(page.locator('.side-panel')).toHaveCSS('background-color', 'rgb(16, 32, 48)');
  await expect(page.locator('.custom-theme__contrast')).toContainText('easy to read');

  // A dark accent on a dark page is lightened for the app's accent colour.
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  expect(accent).not.toBe('#335577');

  // Low-contrast text is allowed but flagged.
  await page.getByLabel('Text colour').fill('#203040');
  await expect(page.locator('.custom-theme__contrast')).toContainText('below the 4.5:1');

  await page.getByLabel('Text colour').fill('#e8e0d0');
  await page.reload();
  await waitForReader(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'custom');
  await expect(pageBody(page)).toHaveCSS('background-color', 'rgb(16, 32, 48)');

  // Switching to a built-in theme removes the custom colours from the shell.
  await page.getByRole('button', { name: 'Display settings' }).click();
  await page.locator('.segmented__btn', { hasText: /^Light$/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).not.toHaveAttribute('style', /--surface/);
  await expect(pageBody(page)).toHaveCSS('background-color', 'rgb(250, 248, 245)');
});

test('changing custom colours does not pile up stylesheets in the book', async ({ page }) => {
  await openBook(page, FIRST);
  await page.getByRole('button', { name: 'Display settings' }).click();
  await page.locator('.segmented__btn', { hasText: /^Custom$/ }).click();
  for (const colour of ['#111111', '#222222', '#333333', '#444444']) {
    await page.getByLabel('Page colour').fill(colour);
  }
  await expect(pageBody(page)).toHaveCSS('background-color', 'rgb(68, 68, 68)');
  const sheets = await page
    .frameLocator('.reader__container iframe')
    .locator('style#epubjs-inserted-css-custom')
    .evaluateAll((els) => els.map((el) => (el as HTMLStyleElement).sheet?.cssRules.length ?? 0));
  expect(sheets).toHaveLength(1);
  // One rule set's worth, not four.
  expect(sheets[0]).toBeLessThan(12);
});
