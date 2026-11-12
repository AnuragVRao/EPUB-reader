# EPUB Reader

A browser-based EPUB reader. Drag and drop an `.epub` file to start reading — everything runs client-side, nothing is uploaded anywhere.

## Features

- Drag-and-drop or file-picker EPUB loading, parsed entirely in the browser
- Light, dark, and sepia themes, or follow the system light/dark setting
- Font size, font family, line spacing, and text justification controls
- Paginated or scrolled reading modes
- Table of contents navigation
- Bookmarks with an optional name and note (persisted per book)
- Full-text search within the book
- Reading position and bookmarks are saved to IndexedDB and restored automatically, even after closing the tab
- Keyboard navigation (arrows, Space, PageUp/PageDown, Home/End) and click zones on the page edges
- Drop another EPUB onto the window to switch books
- See which books have saved data and remove it per book
- Fullscreen mode
- A shelf of recently opened books on the start screen, with cover and progress, so a book can be reopened without the file (the 20 most recent, up to 300 MB; older ones are dropped first)
- Highlights with optional notes: select text to highlight it, and find highlights listed with the bookmarks
- Footnotes open in a popup over the page instead of navigating away
- Click an illustration to view it full size
- Touch support: swipe to turn pages, finger-sized controls, and a phone layout
- Installable as an app and usable offline; once installed it can open `.epub` files directly (Chromium browsers)

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL in your browser.

## Build

```bash
npm run build
```

Outputs a static site to `dist/`, which can be hosted on any static file host. Asset paths are relative, so it works from the root of a domain or from a sub-path without configuration. The build also writes `dist/sw.js`, the service worker that makes the site work offline; it is not used by `npm run dev`.

## Deployment

`.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages on every push to `main`. It needs Pages enabled once in the repository settings (Settings → Pages → Source: GitHub Actions).

## Tech stack

- React + TypeScript + Vite
- [epub.js](https://github.com/futurepress/epub.js) for EPUB parsing and rendering
- IndexedDB (via `idb`) for storing the shelf of books, bookmarks, highlights, and reading progress
- A small hand-written service worker for offline use (no PWA dependency)

## Roadmap

Planned and possible work is tracked in [FUTURE_SCOPE.md](FUTURE_SCOPE.md).
