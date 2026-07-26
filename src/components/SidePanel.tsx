import type { ReactNode } from 'react';

interface SidePanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function SidePanel({ title, onClose, children }: SidePanelProps) {
  return (
    <div className="side-panel" role="dialog" aria-label={title}>
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
