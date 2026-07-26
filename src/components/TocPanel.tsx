import type { TocItem } from '../lib/types';

interface TocPanelProps {
  toc: TocItem[];
  currentHref: string;
  onSelect: (href: string) => void;
}

export default function TocPanel({ toc, currentHref, onSelect }: TocPanelProps) {
  if (toc.length === 0) {
    return <p className="side-panel__empty">This book has no table of contents.</p>;
  }
  return <TocList items={toc} currentHref={currentHref} onSelect={onSelect} depth={0} />;
}

function TocList({
  items,
  currentHref,
  onSelect,
  depth,
}: {
  items: TocItem[];
  currentHref: string;
  onSelect: (href: string) => void;
  depth: number;
}) {
  return (
    <ul className="toc-list" style={{ paddingLeft: depth ? 16 : 0 }}>
      {items.map((item) => {
        const isActive = currentHref && item.href.split('#')[0] === currentHref.split('#')[0];
        return (
          <li key={item.id}>
            <button
              type="button"
              className={`toc-item ${isActive ? 'toc-item--active' : ''}`}
              onClick={() => onSelect(item.href)}
            >
              {item.label}
            </button>
            {item.subitems && item.subitems.length > 0 && (
              <TocList items={item.subitems} currentHref={currentHref} onSelect={onSelect} depth={depth + 1} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
