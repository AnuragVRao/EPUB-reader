# Future scope

What the reader does not do yet, roughly in the order it would be worth doing. Nothing here is committed work. The app's defining constraint — fully client-side, the book never leaves the browser — applies to every item unless it says otherwise.

## Known gaps

Small, well-understood shortcomings in what already exists.

- **Saved bookmarks and positions are never cleaned up automatically.** Book files on the shelf are evicted least-recently-opened first, but the small per-book records (bookmarks, highlights, position, location index) stay until removed in Settings, and that list does not show how much space each book takes.
- **Switching scrolled → paginated can lose about a page.** epub.js's scrolled display snaps to the start of the paragraph, so a round trip from paginated to scrolled and back can land roughly one page earlier.
- **No test coverage for the UI or the epub.js boundary.** Unit tests cover the DOM-free modules under `lib/` only; the footnote and image helpers need a DOM and have none. `useEpubReader` — where nearly all past bugs lived — is untested.
- **The reader chunk is still ~394 kB minified**, almost all of it epub.js and JSZip. It is lazy-loaded, so the drop zone is fast, but it cannot shrink further without replacing the library.

## Reading experience

- **Highlight colours and export as text.** Highlights come in one colour. They travel with the JSON export, but there is no way to get them (or their notes) out as readable text.
- **Shelf settings.** The shelf's limits (20 books, 300 MB) are fixed, and removing a book from the shelf and removing its saved data in Settings are separate actions.
- **Tap zones and pinch zoom on touch screens.** Swiping turns pages, but tapping the page edges does not, and a zoomed illustration cannot be pinched or panned.
- **Bundled reading fonts.** Serif and sans-serif currently fall back to whatever the system has; a small set of bundled book faces would make them consistent.
- **Search across text nodes.** A match has to sit inside one text node, so a phrase broken by inline markup (an italic word, a link) is not found.
- **Custom themes.** User-defined colours. Every theme has to be defined twice (app shell and iframe content — see CLAUDE.md).
- **Text-to-speech.** Read aloud with the Web Speech API, highlighting the current sentence.
- **Dictionary lookup.** Would need either a bundled word list or a network call, and a network call breaks the "nothing leaves the browser" promise — so it must be opt-in.

## Platform

- **An "update available" prompt.** A new version of the installed app takes over on the next page load without saying so.
- **Cross-device sync.** Only possible with a backend or a user-supplied store (e.g. a file in their own cloud drive). Out of scope unless the client-only constraint is deliberately relaxed.
- **Other formats.** PDF, MOBI/AZW3, CBZ. Each needs its own renderer; epub.js handles none of them.
- **Fixed-layout and right-to-left EPUBs.** Untested; RTL books need the arrow keys and nav zones mirrored.

## Engineering

- **Replace or fork epub.js.** It is at 0.3.93 and effectively unmaintained; the project already carries an `@xmldom/xmldom` override and several casts through `unknown` for it. Candidates would need to be evaluated against the relayout constraints documented in CLAUDE.md. This is the largest single risk in the codebase.
- **Component and end-to-end tests.** Playwright against a small fixture EPUB would cover open → navigate → bookmark → reload-restores-position, which is exactly the path unit tests cannot reach.
