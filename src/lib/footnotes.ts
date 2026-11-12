// Recognising footnote links in book content and pulling the note's text out
// of the document it points into. Plain DOM only - loading the target
// document is the reader hook's job.

const EPUB_NS = 'http://www.idpf.org/2007/ops';
const NOTE_TYPES = ['footnote', 'endnote', 'rearnote', 'note'];
const NOTE_ROLES = ['doc-footnote', 'doc-endnote'];
const BLOCK_SELECTOR = 'aside, li, p, dd, div, section, blockquote, td';
// A marker such as 1, [12], (3), * or a dagger.
const MARKER_PATTERN = /^[[(]?(\d{1,4}|[*†‡§¶]{1,3})[\])]?\.?$/;
const BACKLINK_TEXT = /^(?:\s|↩|↑|⏎|⤴|\^|︎|️)+$/;

// A note the book marks as one may be long; a target we only guessed at must
// be short, or it is more likely a chapter than a note.
const MAX_MARKED_LENGTH = 6000;
const MAX_GUESSED_LENGTH = 1500;

function tokens(element: Element, attribute: 'type' | 'role'): string[] {
  const value =
    attribute === 'role'
      ? element.getAttribute('role')
      : (element.getAttributeNS(EPUB_NS, 'type') ?? element.getAttribute('epub:type'));
  return (value ?? '').toLowerCase().split(/\s+/).filter(Boolean);
}

function isMarkedNote(element: Element): boolean {
  return (
    tokens(element, 'type').some((type) => NOTE_TYPES.includes(type)) ||
    tokens(element, 'role').some((role) => NOTE_ROLES.includes(role))
  );
}

/**
 * Says whether a link is a footnote reference: 'marked' when the book says so
 * (`epub:type="noteref"`, `role="doc-noteref"`), 'likely' when it only looks
 * like one (a superscript or a bare number/symbol pointing at an anchor), and
 * null for ordinary links.
 */
export function noteLinkKind(link: Element): 'marked' | 'likely' | null {
  const href = link.getAttribute('href') ?? '';
  if (!href.includes('#') || href.includes('://')) return null;
  if (tokens(link, 'type').includes('noteref') || tokens(link, 'role').includes('doc-noteref')) return 'marked';
  if (tokens(link, 'type').includes('backlink') || tokens(link, 'role').includes('doc-backlink')) return null;
  const text = (link.textContent ?? '').trim();
  if (!MARKER_PATTERN.test(text)) return null;
  // A reference sits after the words it annotates. A marker that opens its
  // block is the number in front of a note (linking back to the text), or an
  // entry in a list of links such as a contents page or an index.
  const blockText = (link.closest(BLOCK_SELECTOR)?.textContent ?? '').trim();
  if (!blockText || blockText.startsWith(text)) return null;
  return 'likely';
}

/** Finds the element a fragment identifier points at. */
export function findNoteElement(doc: Document, id: string): Element | null {
  if (!id) return null;
  const direct = doc.getElementById(id);
  if (direct) return direct;
  // XML documents without a DTD don't always treat `id` as an ID, and old
  // books anchor with <a name>.
  for (const element of Array.from(doc.querySelectorAll('[id], a[name]'))) {
    if (element.getAttribute('id') === id || element.getAttribute('name') === id) return element;
  }
  return null;
}

/**
 * Returns the text of the note at `target`, or null when what is there does
 * not look like a note. `marked` says the link declared itself a note
 * reference, which earns its target more benefit of the doubt.
 */
export function extractNoteText(target: Element, marked: boolean): string | null {
  // The anchor is often an empty <a id> or the note's number; the note is
  // the block around it.
  const container = target.matches(BLOCK_SELECTOR) ? target : (target.closest(BLOCK_SELECTOR) ?? target);
  const name = container.localName.toLowerCase();
  if (name === 'body' || name === 'html') return null;

  const clone = container.cloneNode(true) as Element;
  for (const link of Array.from(clone.querySelectorAll('a'))) {
    const isBacklink =
      tokens(link, 'type').includes('backlink') ||
      tokens(link, 'role').includes('doc-backlink') ||
      BACKLINK_TEXT.test(link.textContent ?? '') ||
      // The note's own number, linking back to where it was referenced.
      (link.hasAttribute('href') && MARKER_PATTERN.test((link.textContent ?? '').trim()));
    if (isBacklink) link.remove();
  }

  // Text only: the note is shown in the app's own document, and book markup
  // is untrusted.
  const paragraphs = Array.from(clone.querySelectorAll('p, li')).filter((part) => !part.querySelector('p, li'));
  const parts = (paragraphs.length ? paragraphs : [clone])
    .map((part) => (part.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const text = parts.join('\n\n');
  if (!text) return null;

  const limit = marked || isMarkedNote(container) ? MAX_MARKED_LENGTH : MAX_GUESSED_LENGTH;
  return text.length <= limit ? text : null;
}
