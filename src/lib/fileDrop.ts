/**
 * Dispatched on `window` when a file is dragged over the book's iframe. Drag
 * events inside the iframe never reach the app's own listeners, so the reader
 * hook relays them with this event.
 */
export const FILE_DRAG_EVENT = 'reader:file-dragenter';

/** True when a drag carries files, as opposed to selected text or a link. */
export function isFileDrag(event: { dataTransfer?: DataTransfer | null }): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}
