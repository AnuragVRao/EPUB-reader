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

Tests (`src/**/*.test.ts`, Vitest in a plain Node environment) cover only the storage layer: `lib/settings.ts` with a stubbed `localStorage`, `lib/db.ts` on `fake-indexeddb`. Nothing exercises React components or epub.js, so `npm run build` (which type-checks the whole project) is still the main verification step for UI and reader changes — run it after non-trivial changes. CI (`.github/workflows/ci.yml`) runs lint, test and build on pushes to `main` and on pull requests.

Two lint warnings are pre-existing and expected (`SettingsContext.tsx` only-export-components, `useEpubReader.ts` exhaustive-deps). Don't treat them as regressions.

## Architecture

A fully client-side EPUB reader. React + TypeScript + Vite, with [epub.js](https://github.com/futurepress/epub.js) doing all EPUB parsing and rendering. No backend, no network calls — the file never leaves the browser.

### Top-level flow

`App.tsx` holds one piece of state that matters: the current book's `ArrayBuffer`. Null means show `DropZone`; non-null means show `ReaderView`. On mount it restores the buffer from IndexedDB, so **a book auto-reopens on every page load** — this is why `ErrorBoundary` offers "close book and reload" rather than a plain refresh, and why a book that crashes the reader would otherwise crash forever.

`ReaderView` composes the UI (toolbar, TOC sidebar, one exclusive side panel) but delegates every EPUB operation to `useEpubReader`.

### `hooks/useEpubReader.ts` — the epub.js boundary

Nearly all epub.js contact is confined to this hook; it exposes a plain `EpubReaderApi` to the rest of the app. The whole book/rendition lifecycle lives in one effect keyed on `data`, which fully tears down (`rendition.destroy()`, `book.destroy()`) on cleanup.

Several non-obvious constraints are already encoded here — preserve them when editing:

- **`enqueueRelayout` serializes teardown/rebuild operations.** Flow changes and container resizes both destroy and recreate views. Without the promise chain, a burst (dragging the window edge, a resize landing mid-flow-change) lets one step clear views while another is still rendering. It resolves on `relocated` with a 300ms timeout fallback for actions epub.js treats as no-ops.
- **Resizing requires `resize(null, null)`.** A bare `resize()` does not re-measure. It must stay a method call so `this` stays bound.
- **Changing flow needs an explicit `clear()` + `display()`.** On-screen views keep stale column/scroll CSS otherwise.
- **`data.slice(0)` is passed to `ePub()`** — epub.js takes ownership of the buffer, and the original is reused across remounts.
- `settingsRef` mirrors `settings` so the lifecycle effect can read current values without depending on them and re-creating the book.

### Persistence — two layers, deliberately split

- **`localStorage`** (`lib/settings.ts`): `ReaderSettings` only. Small, synchronous, needed during the first render.
- **`IndexedDB`** via `idb` (`lib/db.ts`): four object stores. `currentBook` is a singleton; `bookmarks`, `progress`, and `locations` are all keyed by **`book.key()`** — epub.js's identifier derived from book metadata, not the filename. Reopening the same book from a different file path still restores its bookmarks and position.

`locations` caches epub.js's generated CFI location index (expensive — generated once at 1600 chars/location, then reused) so percentage calculations are instant on reopen.

### Theming — two separate systems

Book content renders inside epub.js iframes, which app CSS cannot reach. So themes are defined twice:

- `lib/epubThemes.ts` registers light/dark/sepia with `rendition.themes` for the iframe content, including its own scrollbar rules.
- `index.css` / `App.css` style the app shell via CSS custom properties, switched by a `data-theme` attribute that `SettingsContext` writes to `<html>`.

Adding a theme means touching both. `.epub-container` is one exception — epub.js renders it outside the iframe, so it is styled from `App.css`.

### Error handling

Three distinct paths, don't conflate them:

- Invalid file / unreadable EPUB → caught in `App.handleFile` and `useEpubReader`'s async block, surfaced as inline UI state.
- React render/lifecycle crashes → `ErrorBoundary` in `main.tsx`.
- epub.js internal async failures inside search → swallowed per-section so one bad chapter doesn't fail the whole query.

## Notes

`epubjs` is at 0.3.93 and effectively unmaintained; `package.json` carries an `@xmldom/xmldom` override to patch a transitive dependency. Its typings are incomplete, so a few casts through `unknown` are necessary and intentional.
