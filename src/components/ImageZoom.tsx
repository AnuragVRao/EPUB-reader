import { useEffect, useRef } from 'react';
import type { BookImage } from '../lib/bookImages';

interface ImageZoomProps {
  image: BookImage;
  onClose: () => void;
}

// Shows an illustration from the book as large as the window allows. Any
// click, or Escape, closes it.
export default function ImageZoom({ image, onClose }: ImageZoomProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // The click that opened this left focus inside the book's iframe, where
  // the app can't see Escape. Bring it here.
  useEffect(() => {
    overlayRef.current?.focus();
  }, []);

  return (
    <div
      className="image-zoom"
      role="dialog"
      aria-modal="true"
      aria-label={image.alt || 'Illustration'}
      tabIndex={-1}
      ref={overlayRef}
      onClick={onClose}
      onKeyUp={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <img src={image.src} alt={image.alt} />
      <button type="button" className="icon-btn image-zoom__close" aria-label="Close image" onClick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
