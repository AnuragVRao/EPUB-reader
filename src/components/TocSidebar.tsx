import { useCallback } from 'react';
import type { TocItem } from '../lib/types';
import TocPanel from './TocPanel';

const MIN_WIDTH = 200;
const MAX_WIDTH = 520;

interface TocSidebarProps {
  toc: TocItem[];
  currentHref: string;
  width: number;
  onSelect: (href: string) => void;
  onClose: () => void;
  onWidthChange: (width: number) => void;
}

export default function TocSidebar({ toc, currentHref, width, onSelect, onClose, onWidthChange }: TocSidebarProps) {
  const startDragging = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const startX = event.clientX;
      const startWidth = width;

      const handleMove = (moveEvent: PointerEvent) => {
        const next = startWidth + (moveEvent.clientX - startX);
        onWidthChange(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)));
      };
      const handleUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
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
        <TocPanel toc={toc} currentHref={currentHref} onSelect={onSelect} />
      </div>
      <div
        className="toc-sidebar__resizer"
        onPointerDown={startDragging}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize table of contents"
      />
    </div>
  );
}
