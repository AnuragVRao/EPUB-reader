import { FIRST, expect, openBook, test } from './fixtures.ts';

const DEFINITION = {
  en: [
    {
      partOfSpeech: 'Noun',
      language: 'English',
      definitions: [
        { definition: 'A small <a href="/wiki/carnivore">carnivore</a> &amp; relative of the dog.' },
        { definition: '<img src="x" onerror="window.__xss = true">A cunning person.' },
      ],
    },
  ],
};

// Turns lookups on the way a reader would, through Display settings.
async function enableLookups(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Display settings' }).click();
  await page.getByLabel('Look up words on Wiktionary').check();
  await closePanel(page);
}

// Closing a side panel resizes the page, and epub.js rebuilds the book's
// frame; wait for that before touching the book again.
async function closePanel(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(page.locator('.side-panel')).toHaveCount(0);
  await page.waitForTimeout(800);
}

// Selects the word "Fox" in the book (the first section's sample sentence).
async function selectFox(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Section a' }).click();
  await expect(page.locator('.toolbar__chapter')).toHaveText('Section a');
  const selected = await page.frameLocator('.reader__container iframe').locator('body').evaluate((body) => {
    const doc = body.ownerDocument;
    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.nodeValue!.indexOf('Fox');
      if (at === -1) continue;
      const range = doc.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 3);
      const selection = doc.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      return range.toString();
    }
    return '';
  });
  expect(selected).toBe('Fox');
  await expect(page.getByRole('toolbar', { name: 'Selected text' })).toBeVisible();
}

test('looks nothing up until the reader opts in, then shows a safe, attributed definition', async ({ page }) => {
  const requests: string[] = [];
  await page.route('https://en.wiktionary.org/**', (route) => {
    requests.push(route.request().url());
    const url = route.request().url();
    if (url.endsWith('/Fox')) return route.fulfill({ status: 404, body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DEFINITION) });
  });

  await openBook(page, FIRST);
  await selectFox(page);
  await page.getByRole('button', { name: 'Define' }).click();

  // Off by default: a consent prompt, and no request yet.
  const dialog = page.getByRole('dialog', { name: 'Definition of Fox' });
  await expect(dialog).toContainText('en.wiktionary.org');
  expect(requests).toEqual([]);

  await dialog.getByRole('button', { name: 'Turn on lookups' }).click();
  await expect(dialog.locator('.definition__entry li').first()).toHaveText('A small carnivore & relative of the dog.');
  await expect(dialog.locator('.definition__entry li').nth(1)).toHaveText('A cunning person.');
  await expect(dialog).toContainText('Showing “fox”');
  await expect(dialog.getByRole('link', { name: 'Wiktionary' })).toHaveAttribute('href', 'https://en.wiktionary.org/wiki/fox');
  // The capitalised form had no entry, so the lower-case one was tried.
  expect(requests).toEqual([
    'https://en.wiktionary.org/api/rest_v1/page/definition/Fox',
    'https://en.wiktionary.org/api/rest_v1/page/definition/fox',
  ]);
  // Markup in the response is never rendered.
  expect(await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss)).toBeUndefined();
  await expect(dialog.locator('img')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // The choice is remembered: the next lookup goes straight through.
  await page.reload();
  await selectFox(page);
  await page.getByRole('button', { name: 'Define' }).click();
  await expect(page.getByRole('dialog', { name: 'Definition of Fox' }).locator('.definition__entry')).toHaveCount(1);
});

test('"Not now" sends nothing, and the setting can be turned off again', async ({ page }) => {
  let requests = 0;
  await page.route('https://en.wiktionary.org/**', (route) => {
    requests += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DEFINITION) });
  });

  await openBook(page, FIRST);
  await selectFox(page);
  await page.getByRole('button', { name: 'Define' }).click();
  await page.getByRole('button', { name: 'Not now' }).click();
  expect(requests).toBe(0);

  await page.getByRole('button', { name: 'Display settings' }).click();
  const toggle = page.getByLabel('Look up words on Wiktionary');
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await toggle.uncheck();
  await closePanel(page);

  await selectFox(page);
  await page.getByRole('button', { name: 'Define' }).click();
  await expect(page.getByRole('button', { name: 'Turn on lookups' })).toBeVisible();
  expect(requests).toBe(0);
});

test('reports a word with no entry and an unreachable service', async ({ page }) => {
  let online = true;
  await page.route('https://en.wiktionary.org/**', (route) =>
    online ? route.fulfill({ status: 404, body: '{}' }) : route.abort('internetdisconnected'),
  );
  await openBook(page, FIRST);
  await enableLookups(page);
  await selectFox(page);
  await page.getByRole('button', { name: 'Define' }).click();
  await expect(page.getByRole('dialog')).toContainText('No Wiktionary entry for “Fox”');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();

  online = false;
  await page.frameLocator('.reader__container iframe').locator('body').evaluate((b) => b.ownerDocument.getSelection()?.removeAllRanges());
  await selectFox(page);
  await page.getByRole('button', { name: 'Define' }).click();
  await expect(page.getByRole('dialog')).toContainText('Could not reach Wiktionary');
});
