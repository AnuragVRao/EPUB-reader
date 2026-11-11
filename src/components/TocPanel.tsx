import type { TocItem } from '../lib/types';

interface TocPanelProps {
  toc: TocItem[];
  /** Href of the section file on screen. */
  currentHref: string;
  /** Href of the exact TOC entry being read, when known; otherwise ''. */
  activeHref: string;
  onSelect: (href: string) => void;
}

export default function TocPanel({ toc, currentHref, activeHref, onSelect }: TocPanelProps) {
  if (toc.length === 0) {
    return <p className="side-panel__empty">This book has no table of contents.</p>;
  }
  return <TocList items={toc} currentHref={currentHref} activeHref={activeHref} onSelect={onSelect} depth={0} />;
}

function TocList({
  items,
  currentHref,
  activeHref,
  onSelect,
  depth,
}: {
  items: TocItem[];
  currentHref: string;
  activeHref: string;
  onSelect: (href: string) => void;
  depth: number;
}) {
  return (
    <ul className="toc-list" style={{ paddingLeft: depth ? 16 : 0 }}>
      {items.map((item) => {
        // Prefer the exact entry. Without one, fall back to lighting up every
        // entry that points into the file on screen.
        const isActive = activeHref
          ? item.href === activeHref
          : Boolean(currentHref) && item.href.split('#')[0] === currentHref.split('#')[0];
        return (
          <li key={item.id}>
            <button
              type="button"
              className={`toc-item ${isActive ? 'toc-item--active' : ''}`}
              aria-current={isActive ? 'location' : undefined}
              onClick={() => onSelect(item.href)}
            >
              {item.label}
            </button>
            {item.subitems && item.subitems.length > 0 && (
              <TocList
                items={item.subitems}
                currentHref={currentHref}
                activeHref={activeHref}
                onSelect={onSelect}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
