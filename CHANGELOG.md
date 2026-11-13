# Changelog

All notable changes to EPUB Reader. Versions follow [semantic versioning](https://semver.org/). Pushing a `v*` tag publishes the matching section below as a GitHub Release (see `.github/workflows/release.yml`).

## [1.0.0] - 2026-11-13

The first release. A fully client-side EPUB reader: books are opened, stored and read entirely in the browser. The one optional exception is the dictionary, which is off unless you turn it on.

Use it at https://anuragvrao.github.io/EPUB-reader/ or host the attached build on any static file host.

### Reading

- Open an EPUB by dropping it on the page or choosing it; drop another onto the window to switch books.
- A shelf of recently opened books on the start screen, with cover and progress, so a book reopens without its file (the 20 most recent, up to 300 MB).
- Paginated or scrolled reading, one page or a two-page spread, and a table of contents that highlights the exact section you are in.
- Keyboard navigation (arrows, Space, PageUp/PageDown, Home/End), page-edge buttons, and swipe to turn pages on touch screens, with a layout that works on a phone.
- Reading position restored on every visit, with progress and an estimate of the time left in the chapter and the book, based on your own reading pace.
- Right-to-left books turn pages the way they read; fixed-layout books (comics, picture books) keep the publisher's page design.
- Footnotes open in a popup over the page, and illustrations open full size on click.

### Appearance

- Light, dark and sepia themes, a custom theme with your own colours, or follow the system light/dark setting. Theme colours meet WCAG AA contrast, and the custom theme warns when its text is hard to read.
- Font size and family (including a dyslexia-friendly font), line and paragraph spacing, page margins, justification and hyphenation.

### Notes and search

- Bookmarks with an optional name and note, and highlights with notes, listed together per book.
- Full-text search with match-case and whole-word options, next/previous match, and the match marked on the page.
- Export bookmarks, highlights and reading positions to a file and import them in another browser.
- See which books have saved data and remove it per book.

### Read aloud and dictionary

- Read aloud with the browser's own voices, sentence by sentence, marking the current sentence and turning pages as it goes, with speed and voice settings.
- Optional dictionary: select a word and choose Define to see its Wiktionary entry. Off by default; when on, only the looked-up word is sent to en.wiktionary.org.

### Platform and privacy

- Installable as an app and usable offline; once installed it can open `.epub` files directly (Chromium browsers).
- A Content Security Policy on the built site: books cannot run scripts or load anything from the network.
- Screen-reader announcements on page turns, focus management in panels, a keyboard-resizable contents sidebar, and reduced motion when the system asks for it.

### Engineering

- Unit tests (Vitest) for the storage, settings and text-processing logic, and end-to-end tests (Playwright) that drive the production build in Chromium.
- CI runs an audit, lint, unit tests, build and end-to-end tests on every push and pull request; GitHub Pages deploys from `main`; Dependabot keeps dependencies current.

### Known limitations

- Tested in Chromium only; Firefox and Safari are untested.
- Read-aloud quality depends on the browser's voices, some of which are themselves online services.
- The dictionary is English Wiktionary only.
- Vertical (CJK) text and two-page fixed-layout spreads are untested.
