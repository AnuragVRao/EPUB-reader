# Future scope

What the reader does not do yet, roughly in the order it would be worth doing. Nothing here is committed work. The app's defining constraint — fully client-side, the book never leaves the browser — applies to every item unless it says otherwise.

## Known gaps

Small, well-understood shortcomings in what already exists.

- **No view of stored data.** Settings can clear bookmarks, progress and locations for every book except the open one, but there is no list of which books have data, how much, or a way to remove one book. Nothing is cleaned up automatically either.
- **TOC highlight is per file, not per entry.** When several TOC entries point into the same chapter file (`ch1.xhtml#a`, `ch1.xhtml#b`), all of them light up together.
- **Switching scrolled → paginated can lose about a page.** epub.js's scrolled display snaps to the start of the paragraph, so a round trip from paginated to scrolled and back can land roughly one page earlier.
- **Bookmarks have no note and no rename.** The label is the chapter title and the excerpt is fixed at creation.
- **Search is plain substring.** No whole-word or case-sensitive option, no jumping between matches, and matches are not highlighted on the page after navigating to one.
- **No test coverage for the UI or the epub.js boundary.** Tests cover `lib/settings.ts` and `lib/db.ts` only. `useEpubReader` — where nearly all past bugs lived — is untested.
- **The reader chunk is still ~394 kB minified**, almost all of it epub.js and JSZip. It is lazy-loaded, so the drop zone is fast, but it cannot shrink further without replacing the library.

## Reading experience

- **Library / recent books.** Only one book is stored (`currentBook` is a singleton). A shelf of previously opened books with cover, title and progress would remove the need to re-drop a file. Needs a storage budget and eviction policy, since EPUBs are stored whole.
- **Highlights and annotations.** Select text to highlight or attach a note, listed alongside bookmarks. epub.js has an `annotations` API; storage would be another store keyed by `book.key()`.
- **Touch support.** Swipe to turn pages, larger tap targets, and a layout that works on a phone (the TOC sidebar and side panel currently assume a wide screen).
- **Page-turn keys beyond the arrows.** Space / Shift+Space, PageUp / PageDown, Home / End.
- **Time-left estimates.** "12 min left in chapter", from the location index and a measured reading speed.
- **More typography controls.** Margins / max line width, paragraph spacing, hyphenation, and a choice of bundled reading fonts.
- **Custom and automatic themes.** Follow the OS light/dark preference; user-defined colours. Every theme has to be defined twice (app shell and iframe content — see CLAUDE.md).
- **Single-page vs two-page spread toggle.** Currently always `spread: 'auto'`.
- **Footnote popups.** Show a footnote inline instead of jumping to it and losing the page.
- **Image zoom.** Click an illustration or map to view it full size.
- **Text-to-speech.** Read aloud with the Web Speech API, highlighting the current sentence.
- **Dictionary lookup.** Would need either a bundled word list or a network call, and a network call breaks the "nothing leaves the browser" promise — so it must be opt-in.

## Platform

- **Installable PWA with offline support.** A service worker and manifest, so the reader works with no connection and can be set as the handler for `.epub` files (File Handling API).
- **Open a book over the current one.** Dropping a file while reading does nothing; the book has to be closed first.
- **Export / import of bookmarks and progress.** A JSON file the user can move between browsers or devices. This is the client-side answer to sync.
- **Cross-device sync.** Only possible with a backend or a user-supplied store (e.g. a file in their own cloud drive). Out of scope unless the client-only constraint is deliberately relaxed.
- **Other formats.** PDF, MOBI/AZW3, CBZ. Each needs its own renderer; epub.js handles none of them.
- **Fixed-layout and right-to-left EPUBs.** Untested; RTL books need the arrow keys and nav zones mirrored.

## Accessibility

- **Focus management in panels.** The side panel is marked `role="dialog"` but does not move focus in on open or return it on close.
- **Keyboard-resizable TOC.** The resizer is pointer-only; it should respond to arrow keys as a proper `separator`.
- **Screen-reader announcement on page turn**, and a check of all three themes against WCAG contrast.
- **Reduced motion.** Honour `prefers-reduced-motion` for the progress bar and spinner.

## Engineering

- **Replace or fork epub.js.** It is at 0.3.93 and effectively unmaintained; the project already carries an `@xmldom/xmldom` override and several casts through `unknown` for it. Candidates would need to be evaluated against the relayout constraints documented in CLAUDE.md. This is the largest single risk in the codebase.
- **Component and end-to-end tests.** Playwright against a small fixture EPUB would cover open → navigate → bookmark → reload-restores-position, which is exactly the path unit tests cannot reach.
- **Deployment.** CI runs lint, test and build but does not publish. A GitHub Pages (or similar) deploy job on `main` would finish the pipeline; Vite's `base` must be set for a sub-path.
- **Automated dependency updates.** `npm audit` is clean as of 0.1.0, but nothing keeps it that way. Dependabot or Renovate, plus an `npm audit` step in CI, would.
- **Content Security Policy.** EPUBs are untrusted HTML. Confirm scripts inside book content cannot run (epub.js sandboxes its iframes) and add a CSP to the host page.
