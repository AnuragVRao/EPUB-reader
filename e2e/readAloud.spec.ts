import { FIRST, chapterLabel, expect, openBook, test } from './fixtures.ts';

// Headless Chrome has no voices, so speech is replaced by a fake that
// "speaks" each utterance in 30 ms and records what it was given.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    let current: { onend?: () => void } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    class FakeUtterance {
      text: string;
      lang = '';
      rate = 1;
      voice: unknown = null;
      onend?: () => void;
      onerror?: (e: { error: string }) => void;
      constructor(text: string) {
        this.text = text;
      }
    }
    const synth = {
      speak(u: FakeUtterance) {
        spoken.push(u.text);
        current = u;
        timer = setTimeout(() => u.onend?.(), 30);
      },
      cancel() {
        clearTimeout(timer);
        current = null;
      },
      pause() {},
      resume() {},
      getVoices: () => [],
      addEventListener() {},
      removeEventListener() {},
    };
    void current;
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
    (window as unknown as { __spoken: string[] }).__spoken = spoken;
  });
  // The shared fixture has already loaded the app; load it again so the
  // fake is in place before the app's code runs.
  await page.reload();
  await expect(page.locator('.drop-zone')).toBeVisible();
});

const spoken = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.slice());

test('reads sentence by sentence from the current page, marking each one', async ({ page }) => {
  await openBook(page, FIRST);
  await page.getByRole('button', { name: 'Read aloud' }).click();
  await expect(page.getByRole('group', { name: 'Read aloud' })).toBeVisible();
  await expect(page.locator('.reader__container svg g.tts-sentence')).toHaveCount(1);

  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(3);
  const first = await spoken(page);
  // Heading first, then the paragraph's sentences - not run together.
  expect(first[0]).toBe('Chapter 1');
  expect(first[1]).toMatch(/^Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod/);

  // Pause stops speaking; resume carries on from the same sentence.
  await page.getByRole('button', { name: 'Pause reading' }).click();
  await expect(page.locator('.read-aloud-bar__label')).toHaveText('Paused');
  const atPause = (await spoken(page)).length;
  await page.waitForTimeout(200);
  expect((await spoken(page)).length).toBe(atPause);
  await page.getByRole('button', { name: 'Resume reading' }).click();
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(atPause);

  await page.getByRole('button', { name: 'Stop reading', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Read aloud' })).toHaveCount(0);
  await expect(page.locator('.reader__container svg g.tts-sentence')).toHaveCount(0);
});

test('turns pages and moves into the next chapter as it reads', async ({ page }) => {
  await openBook(page, FIRST);
  await page.getByRole('button', { name: 'Section b' }).click();
  await expect(chapterLabel(page)).toHaveText('Section b');
  await page.getByRole('button', { name: 'Read aloud' }).click();
  await expect.poll(async () => (await spoken(page)).includes('Chapter 2'), { timeout: 30_000 }).toBe(true);
  await expect(chapterLabel(page)).toHaveText(/Chapter 2|Section c/);
  // The footnote aside in chapter 1 is skipped.
  expect((await spoken(page)).some((s) => s.includes('footnote one'))).toBe(false);
});

test('stops when the reader turns the page themselves', async ({ page }) => {
  await openBook(page, FIRST);
  await page.getByRole('button', { name: 'Read aloud' }).click();
  await expect(page.getByRole('group', { name: 'Read aloud' })).toBeVisible();
  await page.getByRole('button', { name: 'Section c' }).click();
  await expect(page.getByRole('group', { name: 'Read aloud' })).toHaveCount(0);
});
