import { useEffect, useRef, type ReactNode } from 'react';

interface SidePanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function SidePanel({ title, onClose, children }: SidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Move focus into the panel when it opens and hand it back to whatever
  // opened it (normally a toolbar button) when it closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    // A child may already have taken focus (the search box autofocuses).
    if (panel && !panel.contains(document.activeElement)) panel.focus();

    return () => {
      // Only if focus was left stranded by the panel going away - not if the
      // user has already moved on to something else.
      const active = document.activeElement;
      const stranded = !active || active === document.body || Boolean(panel?.contains(active));
      if (stranded && opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <div className="side-panel" role="dialog" aria-label={title} tabIndex={-1} ref={panelRef}>
      <div className="side-panel__header">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close panel">
          <CloseIcon />
        </button>
      </div>
      <div className="side-panel__body">{children}</div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="18" height="18" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
