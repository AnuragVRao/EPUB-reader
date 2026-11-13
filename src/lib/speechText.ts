import { splitSentences } from './speech';

interface TextPiece {
  node: Text;
  /** Where this node's text starts in the collected string. */
  offset: number;
}

const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table',
  'td', 'th', 'tr', 'ul',
]);

// Content never read aloud: not text, or notes that would interrupt the
// sentence they are attached to (the footnote popups show those instead).
function isSkipped(el: Element): boolean {
  const name = el.localName;
  if (name === 'script' || name === 'style' || name === 'rt' || name === 'rp' || name === 'noscript') return true;
  if (el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('hidden')) return true;
  const type = `${el.getAttribute('epub:type') ?? ''} ${el.getAttribute('role') ?? ''}`;
  return /\b(noteref|footnote|endnote|rearnote|doc-noteref|doc-footnote|doc-endnote)\b/.test(type);
}

/** A sentence in a chapter document, ready to speak and to mark. */
export interface DocumentSentence {
  text: string;
  range: Range;
}

/**
 * Collects the readable text of `doc` and splits it into sentences, each with
 * the DOM range it covers. Block elements are separated by a newline so a
 * heading or list item always ends a sentence.
 */
export function documentSentences(doc: Document, locale?: string): DocumentSentence[] {
  const root = doc.body ?? doc.documentElement;
  if (!root) return [];

  const pieces: TextPiece[] = [];
  let text = '';
  const breakLine = () => {
    if (text && !text.endsWith('\n')) text += '\n';
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue ?? '';
      if (value) {
        pieces.push({ node: node as Text, offset: text.length });
        text += value;
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (isSkipped(el)) return;
    const block = BLOCK.has(el.localName);
    if (block) breakLine();
    for (let child = el.firstChild; child; child = child.nextSibling) walk(child);
    if (block) breakLine();
  };
  walk(root);

  // Maps a position in `text` to a DOM point. A position inside a separator
  // newline (between two nodes) maps to the start of the next node.
  const pointAt = (position: number, preferEnd: boolean): [Text, number] | null => {
    let lo = 0;
    let hi = pieces.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pieces[mid].offset <= position) lo = mid;
      else hi = mid - 1;
    }
    const piece = pieces[lo];
    if (!piece) return null;
    const length = piece.node.nodeValue?.length ?? 0;
    const inside = position - piece.offset;
    if (inside <= length) return [piece.node, Math.max(0, inside)];
    const next = pieces[lo + 1];
    if (next && !preferEnd) return [next.node, 0];
    return [piece.node, length];
  };

  const sentences: DocumentSentence[] = [];
  for (const span of splitSentences(text, locale)) {
    const start = pointAt(span.start, false);
    const end = pointAt(span.end, true);
    if (!start || !end) continue;
    const range = doc.createRange();
    try {
      range.setStart(start[0], start[1]);
      range.setEnd(end[0], end[1]);
    } catch {
      continue;
    }
    sentences.push({ text: text.slice(span.start, span.end).replace(/\s+/g, ' '), range });
  }
  return sentences;
}
