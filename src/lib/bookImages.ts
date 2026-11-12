// Picking out the illustrations in book content that can be opened full size.

/** An image from the book, ready to show in the app's own document. */
export interface BookImage {
  src: string;
  alt: string;
}

const XLINK_NS = 'http://www.w3.org/1999/xlink';
// Smaller than this on both sides is an inline glyph or ornament, not an
// illustration worth enlarging.
const MIN_SIZE = 32;

function imageSource(element: Element): string {
  const name = element.localName.toLowerCase();
  if (name === 'img') return (element as HTMLImageElement).currentSrc || element.getAttribute('src') || '';
  // Covers and plates are often an <image> inside an inline SVG.
  if (name === 'image') return element.getAttribute('href') ?? element.getAttributeNS(XLINK_NS, 'href') ?? '';
  return '';
}

/**
 * Returns the image to enlarge when `element` is clicked, or null when it is
 * not an illustration: not an image at all, too small, or wrapped in a link
 * (which should keep working as a link).
 */
export function zoomableImage(element: Element): BookImage | null {
  const src = imageSource(element);
  // epub.js rewrites the book's own images to blob: (or data:) URLs. Anything
  // else would be a remote image, and the reader makes no network requests.
  if (!/^(blob:|data:image\/)/i.test(src)) return null;
  if (element.closest('a')) return null;
  const box = element.getBoundingClientRect();
  if (box.width < MIN_SIZE && box.height < MIN_SIZE) return null;
  return { src, alt: element.getAttribute('alt') ?? element.getAttribute('aria-label') ?? '' };
}

/** Gives every enlargeable image in a book document a zoom cursor. */
export function markZoomableImages(doc: Document): void {
  for (const element of Array.from(doc.querySelectorAll('img, image'))) {
    if (!element.closest('a') && imageSource(element)) {
      // Set through the CSSOM rather than a stylesheet: nothing to inject,
      // and nothing for a content security policy to object to.
      (element as HTMLElement | SVGElement).style.cursor = 'zoom-in';
    }
  }
}
