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

Outputs a static site to `dist/`, which can be hosted on any static file host.

## Tech stack

- React + TypeScript + Vite
- [epub.js](https://github.com/futurepress/epub.js) for EPUB parsing and rendering
- IndexedDB (via `idb`) for storing the current book, bookmarks, and reading progress

## Roadmap

Planned and possible work is tracked in [FUTURE_SCOPE.md](FUTURE_SCOPE.md).
