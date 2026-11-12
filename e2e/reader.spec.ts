import { FIRST, SECOND, chapterLabel, expect, openBook, test, waitForReader } from './fixtures.ts';

test('opens a book, navigates, bookmarks, and restores both after a reload', async ({ page }) => {
  await openBook(page, FIRST);
  await expect(page.locator('.toolbar__title')).toHaveText('First Test Book');
  await expect(chapterLabel(page)).toHaveText('Chapter 1');

  // The location index finishes in the background; wait for the percentage.
  await expect(page.locator('.toolbar__progress')).toContainText('%');

  // Jump through the table of contents.
  await page.getByRole('button', { name: 'Section c' }).click();
  await expect(chapterLabel(page)).toHaveText('Section c');
  await expect(page.locator('.toc-item--active')).toHaveText('Section c');

  await page.getByRole('button', { name: 'Add bookmark' }).click();
  await expect(page.getByRole('button', { name: 'Remove bookmark' })).toBeVisible();

  // Back to the start with the keyboard, then a page into Section b.
  await page.keyboard.press('Home');
  await expect(chapterLabel(page)).toHaveText('Chapter 1');
  await page.getByRole('button', { name: 'Section b' }).click();
  await expect(chapterLabel(page)).toHaveText('Section b');
  const progress = page.locator('.reader__progress');
  const atSection = await progress.getAttribute('aria-valuenow');
  await page.keyboard.press('ArrowRight');
  await expect(progress).not.toHaveAttribute('aria-valuenow', atSection ?? '');
  // Let the page turn's save land before reloading.
  await page.waitForTimeout(500);
  const position = await progress.getAttribute('aria-valuenow');
  const label = await chapterLabel(page).textContent();

  await page.reload();
  await waitForReader(page);
  await expect(chapterLabel(page)).toHaveText(label ?? '');
  await expect(progress).toHaveAttribute('aria-valuenow', position ?? '');

  await page.getByRole('button', { name: 'Bookmarks list' }).click();
  const bookmark = page.locator('.bookmark-item__main');
  await expect(bookmark).toHaveCount(1);
  await expect(bookmark.locator('.bookmark-item__label')).toHaveText('Section c');
  await bookmark.click();
  await expect(chapterLabel(page)).toHaveText('Section c');
});

test('refuses a file that is not an EPUB', async ({ page }) => {
  await page.locator('.drop-zone input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a book'),
  });
  await expect(page.locator('.drop-zone__error')).toContainText("doesn't look like an EPUB");
});

test('keeps display settings across a reload', async ({ page }) => {
  await openBook(page, FIRST);
  await page.getByRole('button', { name: 'Display settings' }).click();
  await page.locator('.segmented__btn', { hasText: /^Sepia$/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');

  await page.reload();
  await waitForReader(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  const pageColour = await page
    .frameLocator('.reader__container iframe')
    .locator('body')
    .evaluate((body) => getComputedStyle(body).backgroundColor);
  expect(pageColour).toBe('rgb(243, 230, 208)');
});

test('searches with options and marks the chosen match on the page', async ({ page }) => {
  await openBook(page, FIRST);
  await page.getByRole('button', { name: 'Search' }).click();
  const box = page.getByRole('searchbox', { name: 'Search in book' });

  await box.fill('fox');
  await page.getByRole('button', { name: 'Search', exact: true }).last().click();
  await expect(page.locator('.search-panel__nav')).toContainText('12 matches');

  await page.getByLabel('Match case').check();
  await page.getByLabel('Whole words').check();
  await page.locator('.search-panel__form').getByRole('button', { name: 'Search' }).click();
  await expect(page.locator('.search-panel__nav')).toContainText('3 matches');

  await page.getByRole('button', { name: 'Next match' }).click();
  await expect(page.locator('.search-panel__nav')).toContainText('1 of 3');
  await expect(chapterLabel(page)).toHaveText('Section a');
  await expect(page.locator('.reader__container svg g.search-match')).toHaveCount(1);

  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(page.locator('.reader__container svg g.search-match')).toHaveCount(0);
});

test('puts closed books on the shelf and reopens them from it', async ({ page }) => {
  await openBook(page, FIRST);
  await page.getByRole('button', { name: 'Close book' }).click();
  await openBook(page, SECOND);
  await page.getByRole('button', { name: 'Close book' }).click();

  const titles = page.locator('.library-book__title');
  await expect(titles).toHaveText(['Second Test Book', 'First Test Book']);

  await page.locator('.library-book__open', { hasText: 'First Test Book' }).click();
  await waitForReader(page);
  await expect(page.locator('.toolbar__title')).toHaveText('First Test Book');
});

test('shows a footnote in a popup without leaving the page', async ({ page }) => {
  await openBook(page, FIRST);
  await page.frameLocator('.reader__container iframe').locator('#ref1').click();
  await expect(page.getByText('This is the text of footnote one.')).toBeVisible();
  await expect(chapterLabel(page)).toHaveText('Chapter 1');
  await page.keyboard.press('Escape');
  await expect(page.getByText('This is the text of footnote one.')).toHaveCount(0);
});
