import JSZip from 'jszip';
import { test as base, expect, type Page } from '@playwright/test';

export interface FixtureBook {
  title: string;
  /** Unique identifier; books with the same one are the same book to the reader. */
  id: string;
  /** 'rtl' sets the spine's page-progression-direction. */
  direction?: 'ltr' | 'rtl';
  language?: string;
}

const PARA =
  '<p>' +
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(6) +
  '</p>\n';
const UNIQUE = '<p>The quick brown Fox jumps over the lazy dog near the foxglove. A fox is not a FOX.</p>\n';
// Hebrew filler for right-to-left books.
const PARA_RTL = '<p>' + 'זהו משפט לדוגמה בעברית שנכתב כדי למלא את העמוד. '.repeat(10) + '</p>\n';

function chapter(n: number, sections: string[], rtl = false): string {
  const para = rtl ? PARA_RTL : PARA;
  let body = `<h1>Chapter ${n}</h1>\n${para.repeat(2)}`;
  if (n === 1) body += '<p>A sentence with a note.<a id="ref1" epub:type="noteref" href="#fn1">1</a></p>\n';
  for (const s of sections) body += `<h2 id="${s}">Section ${s}</h2>\n${rtl ? '' : UNIQUE}${para.repeat(13)}`;
  if (n === 1) body += '<aside id="fn1" epub:type="footnote"><p>This is the text of footnote one.</p></aside>\n';
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"${rtl ? ' dir="rtl" lang="he" xml:lang="he"' : ''}>` +
    `<head><title>Chapter ${n}</title></head><body>\n${body}</body></html>`
  );
}

/**
 * Builds a small two-chapter EPUB 3 in memory: Chapter 1 (sections a, b) and
 * Chapter 2 (section c), each section containing the word "fox" in several
 * cases, plus a footnote in chapter 1.
 */
export async function makeEpub(book: FixtureBook): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
      '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  const direction = book.direction ? ` page-progression-direction="${book.direction}"` : '';
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">${book.id}</dc:identifier><dc:title>${book.title}</dc:title><dc:creator>Test Author</dc:creator><dc:language>${book.language ?? 'en'}</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine${direction}><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
  );
  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Nav</title></head><body><nav epub:type="toc"><ol>
<li><a href="ch1.xhtml">Chapter 1</a><ol><li><a href="ch1.xhtml#a">Section a</a></li><li><a href="ch1.xhtml#b">Section b</a></li></ol></li>
<li><a href="ch2.xhtml">Chapter 2</a><ol><li><a href="ch2.xhtml#c">Section c</a></li></ol></li>
</ol></nav></body></html>`,
  );
  const rtl = book.direction === 'rtl';
  zip.file('OEBPS/ch1.xhtml', chapter(1, ['a', 'b'], rtl));
  zip.file('OEBPS/ch2.xhtml', chapter(2, ['c'], rtl));
  return zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
}

/**
 * Builds a fixed-layout (pre-paginated) EPUB of `pages` pages, each a 600x800
 * spine item with absolutely positioned text, as comics and picture books are.
 */
export async function makeFixedLayoutEpub(book: FixtureBook, pages = 4): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
      '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  const ids = Array.from({ length: pages }, (_, i) => i + 1);
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">${book.id}</dc:identifier><dc:title>${book.title}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-01-01T00:00:00Z</meta><meta property="rendition:layout">pre-paginated</meta><meta property="rendition:spread">none</meta></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${ids.map((i) => `<item id="p${i}" href="page${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest>
<spine>${ids.map((i) => `<itemref idref="p${i}"/>`).join('')}</spine></package>`,
  );
  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Nav</title></head><body><nav epub:type="toc"><ol>
${ids.map((i) => `<li><a href="page${i}.xhtml">Page ${i}</a></li>`).join('')}
</ol></nav></body></html>`,
  );
  for (const i of ids) {
    zip.file(
      `OEBPS/page${i}.xhtml`,
      `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Page ${i}</title><meta name="viewport" content="width=600, height=800"/>
<style>body{margin:0;width:600px;height:800px;background:#204060;color:#ffffff;font-size:40px;line-height:1}
#label{position:absolute;left:50px;top:100px;margin:0}</style></head>
<body><p id="label">Fixed page ${i}</p></body></html>`,
    );
  }
  return zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
}

export const FIRST: FixtureBook = { title: 'First Test Book', id: 'urn:uuid:11111111-1111-1111-1111-111111111111' };
export const SECOND: FixtureBook = { title: 'Second Test Book', id: 'urn:uuid:22222222-2222-2222-2222-222222222222' };

export const RTL_BOOK: FixtureBook = {
  title: 'Right To Left Book',
  id: 'urn:uuid:33333333-3333-3333-3333-333333333333',
  direction: 'rtl',
  language: 'he',
};
export const FIXED_BOOK: FixtureBook = { title: 'Fixed Layout Book', id: 'urn:uuid:44444444-4444-4444-4444-444444444444' };

/** Chooses `book` in the drop zone's file picker; `buffer` overrides the generated EPUB. */
export async function openBook(page: Page, book: FixtureBook, buffer?: Buffer): Promise<void> {
  await page.locator('.drop-zone input[type=file]').setInputFiles({
    name: `${book.title}.epub`,
    mimeType: 'application/epub+zip',
    buffer: buffer ?? (await makeEpub(book)),
  });
  await waitForReader(page);
}

/** Waits until a book is rendered and its loading overlay is gone. */
export async function waitForReader(page: Page): Promise<void> {
  await expect(page.locator('.reader__container iframe')).toBeAttached();
  await expect(page.locator('.reader__overlay')).toHaveCount(0);
}

/** Text of the toolbar's chapter label. */
export function chapterLabel(page: Page) {
  return page.locator('.toolbar__chapter');
}

/**
 * Every test starts from an empty origin: IndexedDB, localStorage and any
 * service worker from an earlier test are cleared before the app loads.
 */
export const test = base.extend({
  // Playwright's fixture callback; not named `use` so the React hooks lint
  // rule doesn't mistake it for a hook.
  page: async ({ page }, provide) => {
    await page.goto('./');
    await page.evaluate(async () => {
      localStorage.clear();
      for (const db of await indexedDB.databases()) if (db.name) indexedDB.deleteDatabase(db.name);
      for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister();
    });
    await page.goto('./');
    await expect(page.locator('.drop-zone')).toBeVisible();
    await provide(page);
  },
});

export { expect };
