import { useCallback } from 'react';
import type { TocItem } from '../lib/types';
import TocPanel from './TocPanel';

const MIN_WIDTH = 200;
const MAX_WIDTH = 520;
const KEY_STEP = 16;

function clampWidth(width: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

interface TocSidebarProps {
  toc: TocItem[];
  currentHref: string;
  activeHref: string;
  width: number;
  onSelect: (href: string) => void;
  onClose: () => void;
  onWidthChange: (width: number) => void;
}

export default function TocSidebar({
  toc,
  currentHref,
  activeHref,
  width,
  onSelect,
  onClose,
  onWidthChange,
}: TocSidebarProps) {
  const startDragging = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const startX = event.clientX;
      const startWidth = width;
      // Without capture the drag dies as soon as the pointer crosses onto the
      // book's iframe, which swallows pointer events.
      event.currentTarget.setPointerCapture(event.pointerId);

      const handleMove = (moveEvent: PointerEvent) => {
        onWidthChange(clampWidth(startWidth + (moveEvent.clientX - startX)));
      };
      const handleUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleUp);
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
      window.addEventListener('pointercancel', handleUp);
    },
    [width, onWidthChange],
  );

  // Keyboard equivalent of dragging, per the ARIA window-splitter pattern.
  const handleResizerKey = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      let next: number;
      switch (event.key) {
        case 'ArrowLeft':
          next = width - KEY_STEP;
          break;
        case 'ArrowRight':
          next = width + KEY_STEP;
          break;
        case 'Home':
          next = MIN_WIDTH;
          break;
        case 'End':
          next = MAX_WIDTH;
          break;
        default:
          return;
      }
      event.preventDefault();
      onWidthChange(clampWidth(next));
    },
    [width, onWidthChange],
  );

  return (
    <div className="toc-sidebar" role="complementary" aria-label="Table of Contents" style={{ width }}>
      <div className="side-panel__header">
        <h2>Contents</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Hide table of contents">
          <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="side-panel__body">
        <TocPanel toc={toc} currentHref={currentHref} activeHref={activeHref} onSelect={onSelect} />
      </div>
      <div
        className="toc-sidebar__resizer"
        onPointerDown={startDragging}
        onKeyDown={handleResizerKey}
        tabIndex={0}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize table of contents"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={Math.round(width)}
      />
    </div>
  );
}
