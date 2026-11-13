import { FIXED_BOOK, RTL_BOOK, expect, makeFixedLayoutEpub, openBook, test } from './fixtures.ts';

const progress = (page: import('@playwright/test').Page) =>
  page.locator('.reader__progress').getAttribute('aria-valuenow').then(Number);

test.describe('right-to-left books', () => {
  test.beforeEach(async ({ page }) => {
    await openBook(page, RTL_BOOK);
    await expect(page.locator('.toolbar__progress')).toContainText('%');
  });

  test('ArrowLeft goes forward and ArrowRight goes back', async ({ page }) => {
    const start = await progress(page);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => progress(page)).toBeGreaterThan(start);
    const ahead = await progress(page);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => progress(page)).toBeLessThan(ahead);
  });

  test('the left page-edge button turns forward', async ({ page }) => {
    const next = page.getByRole('button', { name: 'Next page' });
    const prev = page.getByRole('button', { name: 'Previous page' });
    const nextBox = await next.boundingBox();
    const prevBox = await prev.boundingBox();
    expect(nextBox!.x).toBeLessThan(prevBox!.x);

    const start = await progress(page);
    await next.click();
    await next.click();
    await expect.poll(() => progress(page)).toBeGreaterThan(start);
  });

  test('the progress bar fills from the right', async ({ page }) => {
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => progress(page)).toBeGreaterThan(0);
    const bar = await page.locator('.reader__progress').boundingBox();
    const fill = await page.locator('.reader__progress-fill').boundingBox();
    expect(Math.round(fill!.x + fill!.width)).toBe(Math.round(bar!.x + bar!.width));
  });

  test('the book text is laid out right to left', async ({ page }) => {
    const dir = await page
      .frameLocator('.reader__container iframe')
      .locator('p')
      .first()
      .evaluate((p) => getComputedStyle(p).direction);
    expect(dir).toBe('rtl');
  });
});

test.describe('fixed-layout books', () => {
  test.beforeEach(async ({ page }) => {
    await openBook(page, FIXED_BOOK, await makeFixedLayoutEpub(FIXED_BOOK, 4));
  });

  test('shows one whole page scaled to fit, and turns pages', async ({ page }) => {
    const frame = page.frameLocator('.reader__container iframe').first();
    await expect(frame.locator('#label')).toHaveText('Fixed page 1');

    // The whole 600x800 page fits inside the reading area.
    const area = await page.locator('.reader__container').boundingBox();
    const iframe = await page.locator('.reader__container iframe').first().boundingBox();
    expect(iframe!.height).toBeLessThanOrEqual(area!.height + 1);
    expect(iframe!.width).toBeLessThanOrEqual(area!.width + 1);

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.toolbar__chapter')).toHaveText('Page 2');
    await page.keyboard.press('End');
    await expect(page.locator('.toolbar__chapter')).toHaveText('Page 4');
  });

  test("keeps the book's own design: no reader theme colours or font size", async ({ page }) => {
    await page.getByRole('button', { name: 'Display settings' }).click();
    await page.locator('.segmented__btn', { hasText: /^Sepia$/ }).click();
    await page.getByRole('button', { name: 'Increase font size' }).click();
    await page.getByRole('button', { name: 'Increase font size' }).click();

    const frame = page.frameLocator('.reader__container iframe').first();
    // epub.js makes the scaled page body transparent; the publisher's colour
    // is kept on the root element.
    await expect(frame.locator('html')).toHaveCSS('background-color', 'rgb(32, 64, 96)');
    await expect(frame.locator('#label')).toHaveCSS('font-size', '40px');
    await expect(frame.locator('#label')).toHaveCSS('color', 'rgb(255, 255, 255)');
    // The panel says why the text settings have no effect.
    await expect(page.locator('.settings-panel')).toContainText('fixed layout');
  });
});
