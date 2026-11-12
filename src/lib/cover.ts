import type { LibraryBook } from './types';

// Longest edge of a stored cover. The shelf shows covers at ~130px wide, so
// this leaves room for high-density screens without storing print-size art.
const MAX_EDGE = 480;
// A cover that can't be scaled down (an SVG, or a browser without
// createImageBitmap) is stored as it is, but only when it is small.
const MAX_RAW_BYTES = 512 * 1024;

/**
 * Turns a book's cover image into the small copy kept on the shelf.
 * Undefined when the image can't be read or is too large to keep unscaled.
 */
export async function prepareCover(blob: Blob): Promise<LibraryBook['cover']> {
  try {
    const bitmap = await createImageBitmap(blob);
    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (context) {
        // JPEG has no alpha channel; transparent areas would come out black.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const scaled = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
        if (scaled) return { data: await scaled.arrayBuffer(), type: scaled.type };
      }
    } finally {
      bitmap.close();
    }
  } catch {
    // Not a format the browser can decode this way; fall through.
  }

  try {
    if (blob.size <= MAX_RAW_BYTES && blob.type.startsWith('image/')) {
      return { data: await blob.arrayBuffer(), type: blob.type };
    }
  } catch {
    // Unreadable blob: the shelf shows a placeholder instead.
  }
  return undefined;
}
