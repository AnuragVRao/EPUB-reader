import { useEffect, useState } from 'react';
import { FILE_DRAG_EVENT, isFileDrag } from '../lib/fileDrop';

interface BookDropOverlayProps {
  onFile: (file: File) => void;
}

// Lets a file be dropped while a book is open. The book renders in iframes
// that swallow drag events, so a full-window layer is raised above them for
// the duration of the drag and takes the drop itself.
export default function BookDropOverlay({ onFile }: BookDropOverlayProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const show = () => setActive(true);
    const hide = () => setActive(false);
    const onDragEnter = (event: DragEvent) => {
      if (isFileDrag(event)) show();
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener(FILE_DRAG_EVENT, show);
    // Safety nets for a drag that ends without the overlay seeing it.
    window.addEventListener('drop', hide);
    window.addEventListener('dragend', hide);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener(FILE_DRAG_EVENT, show);
      window.removeEventListener('drop', hide);
      window.removeEventListener('dragend', hide);
    };
  }, []);

  if (!active) return null;

  return (
    <div
      className="drop-overlay"
      onDragOver={(e) => e.preventDefault()}
      // The card ignores pointer events, so this only fires when the drag
      // leaves the window (or is cancelled).
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setActive(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      <div className="drop-overlay__card">
        <h2>Drop to open this book</h2>
        <p>It replaces the one you are reading. Your place and bookmarks are kept.</p>
      </div>
    </div>
  );
}
