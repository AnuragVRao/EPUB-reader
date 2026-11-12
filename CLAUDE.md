# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server
npm run build    # tsc -b && vite build -> static site in dist/
npm run lint     # oxlint
npm run test     # vitest run (npm run test:watch for watch mode)
npm run preview  # serve the built dist/
```

Tests (`src/**/*.test.ts`, Vitest in a plain Node environment) cover only the pure, DOM-free modules under `lib/`: `settings.ts` and `readingTime.ts` with a stubbed `localStorage`, `db.ts` on `fake-indexeddb`, and the logic in `keys.ts`, `search.ts`, `typography.ts` and `backup.ts`. New logic that doesn't need the DOM or epub.js belongs in a `lib/` module with a test, with the hook or component as a thin caller. Nothing exercises React components or epub.js, so `npm run build` (which type-checks the whole project) is still the main verification step for UI and reader changes — run it after non-trivial changes. CI (`.github/workflows/ci.yml`) runs lint, test and build on pushes to `main` and on pull requests.

Two lint warnings are pre-existing and expected (`SettingsContext.tsx` only-export-components, `useEpubReader.ts` exhaustive-deps). Don't treat them as regressions.

## Architecture

A fully client-side EPUB reader. React + TypeScript + Vite, with [epub.js](https://github.com/futurepress/epub.js) doing all EPUB parsing and rendering. No backend, no network calls — the file never leaves the browser.

### Top-level flow

`App.tsx` holds one piece of state that matters: the current book's `ArrayBuffer`. Null means show `DropZone`; non-null means show `ReaderView`. On mount it restores the buffer from IndexedDB, so **a book auto-reopens on every page load** — this is why `ErrorBoundary` offers "close book and reload" rather than a plain refresh, and why a book that crashes the reader would otherwise crash forever.

`ReaderView` composes the UI (toolbar, TOC sidebar, one exclusive side panel) but delegates every EPUB operation to `useEpubReader`. It is keyed on a per-file counter in `App`, so dropping a new book over the open one remounts it with clean state.

The book's iframes swallow keyboard and drag events, so anything global has two entry points: page-turn keys are handled on `window` in `ReaderView` *and* via `rendition.on('keyup')` in the hook, both through `pageKeyAction` in `lib/keys.ts`; file drags over the iframe are relayed to `window` as `FILE_DRAG_EVENT` (`lib/fileDrop.ts`) so `BookDropOverlay` can cover the iframe and take the drop.

### `hooks/useEpubReader.ts` — the epub.js boundary

Nearly all epub.js contact is confined to this hook; it exposes a plain `EpubReaderApi` to the rest of the app. The whole book/rendition lifecycle lives in one effect keyed on `data`, which fully tears down (`rendition.destroy()`, `book.destroy()`) on cleanup.

Several non-obvious constraints are already encoded here — preserve them when editing:

- **`enqueueRelayout` serializes teardown/rebuild operations.** Flow changes and container resizes both destroy and recreate views. Without the promise chain, a burst (dragging the window edge, a resize landing mid-flow-change) lets one step clear views while another is still rendering. It resolves on `relocated` with a 300ms timeout fallback for actions epub.js treats as no-ops.
- **Resizing requires `resize(null, null)`.** A bare `resize()` does not re-measure. It must stay a method call so `this` stays bound.
- **Changing flow needs an explicit `clear()` + `display()`.** On-screen views keep stale column/scroll CSS otherwise.
- **`data.slice(0)` is passed to `ePub()`** — epub.js takes ownership of the buffer, and the original is reused across remounts.
- `settingsRef` mirrors `settings` so the lifecycle effect can read current values without depending on them and re-creating the book.
- **The anchor CFI, not the page start, is the reader's position.** `anchorCfiRef` drives the percentage, time-left estimate, chapter label, TOC highlight and saved progress, and is what a relayout returns to. It is frozen while a relayout or resize is in flight (their relocations are layout noise) with one exception: `pendingAnchorRef`, set by an explicit jump (TOC entry, bookmark, search match), is adopted whenever its target is on the page, even mid-resize. Without that, choosing a bookmark - which closes its panel and so resizes the container - snaps back to the old position.
- **Changing spread, like flow, needs `clear()` + `display()`.**
- **`book.locations.length()` is non-zero while the index is still generating; `locations.total` stays 0 until it is done.** Use `total` to decide whether location-based numbers can be trusted.
- **Search marks are `underline` annotations**, so they can never collide with (or remove) a `highlight` annotation on the same range - epub.js keys annotations by CFI + type.
- **`findActiveTocItem` picks one TOC entry, not one file.** Several entries can point into the same chapter file; it compares each entry's anchor element against the anchored position. It returns nothing when it can't tell, and `TocPanel` then falls back to highlighting by file.

### Persistence — two layers, deliberately split

- **`localStorage`** (`lib/settings.ts`): `ReaderSettings` only. Small, synchronous, needed during the first render.
- **`IndexedDB`** via `idb` (`lib/db.ts`): four object stores. `currentBook` is a singleton; `bookmarks`, `progress`, and `locations` are all keyed by **`book.key()`** — epub.js's identifier derived from book metadata, not the filename. Reopening the same book from a different file path still restores its bookmarks and position.

`locations` caches epub.js's generated CFI location index (expensive — generated once at 1600 chars/location, then reused) so percentage calculations are instant on reopen. `CHARS_PER_LOCATION` in `lib/readingTime.ts` must match that 1600.

Export/import (`lib/backup.ts` for the file format and validation, `exportBackup`/`importBackup` in `lib/db.ts`) covers bookmarks and progress only. Import is merge-only and treats the file as untrusted input. A new per-book store should be added to the backup format too.

### Theming — two separate systems

Book content renders inside epub.js iframes, which app CSS cannot reach. So themes are defined twice:

- `lib/epubThemes.ts` registers light/dark/sepia with `rendition.themes` for the iframe content, including its own scrollbar rules.
- `index.css` / `App.css` style the app shell via CSS custom properties, switched by a `data-theme` attribute that `SettingsContext` writes to `<html>`.

Adding a theme means touching both, and checking its text colours for WCAG AA contrast (4.5:1) on `--surface`, `--surface-alt` and `--bg`. `--page-bg` in `index.css` mirrors the book page colour in `epubThemes.ts` and must change with it. `.epub-container` is one exception — epub.js renders it outside the iframe, so it is styled from `App.css`.

The stored `settings.theme` is a `ThemeSetting` and may be `'auto'`. `SettingsContext` resolves it against `prefers-color-scheme` and exposes the result as `theme` (a `ThemeName`); that resolved value is what goes to `data-theme` and to `applyThemeAndFonts`. epub.js has no theme registered under `'auto'`, so never pass `settings.theme` to it directly.

Typography settings that need rules on elements other than `body` (paragraph spacing, hyphenation) can't go through `rendition.themes.override`, which only targets `body`. `lib/typography.ts` builds a stylesheet that `epubThemes.ts` injects into each chapter document and updates in place. Page margins are padding on `.reader__page`, a wrapper around the epub.js container - epub.js measures the container's border box, so padding on the container itself would be ignored.

### Content Security Policy

`vite.config.ts` injects a CSP meta tag into production builds only (the dev server needs inline script and a websocket for HMR). Book iframes are same-origin `srcdoc` documents and inherit it: no script outside the bundle, no requests to other origins. Anything new that loads a resource - a worker, a font, an inline script in `index.html` - has to fit the policy or extend it deliberately, and can only be checked against `npm run build` + `npm run preview`, not `npm run dev`.

### Error handling

Three distinct paths, don't conflate them:

- Invalid file / unreadable EPUB → caught in `App.handleFile` and `useEpubReader`'s async block, surfaced as inline UI state.
- React render/lifecycle crashes → `ErrorBoundary` in `main.tsx`.
- epub.js internal async failures inside search → swallowed per-section so one bad chapter doesn't fail the whole query.

## Notes

`epubjs` is at 0.3.93 and effectively unmaintained; `package.json` carries an `@xmldom/xmldom` override to patch a transitive dependency. Its typings are incomplete, so a few casts through `unknown` are necessary and intentional.
