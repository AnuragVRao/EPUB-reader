export type PanelName = 'bookmarks' | 'search' | 'settings';

interface ToolbarProps {
  title: string;
  chapterLabel: string;
  activePanel: PanelName | null;
  onTogglePanel: (panel: PanelName) => void;
  tocOpen: boolean;
  onToggleToc: () => void;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

export default function Toolbar({
  title,
  chapterLabel,
  activePanel,
  onTogglePanel,
  tocOpen,
  onToggleToc,
  isBookmarked,
  onToggleBookmark,
  isFullscreen,
  onToggleFullscreen,
  onClose,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar__actions">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close book">
          <BackIcon />
        </button>
        <ToolbarButton active={tocOpen} onClick={onToggleToc} label="Table of contents">
          <TocIcon />
        </ToolbarButton>
        <ToolbarButton active={activePanel === 'search'} onClick={() => onTogglePanel('search')} label="Search">
          <SearchIcon />
        </ToolbarButton>
        <button
          type="button"
          className={`icon-btn ${isBookmarked ? 'icon-btn--active' : ''}`}
          onClick={onToggleBookmark}
          aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
          title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
        >
          <BookmarkIcon filled={isBookmarked} />
        </button>
        <ToolbarButton
          active={activePanel === 'bookmarks'}
          onClick={() => onTogglePanel('bookmarks')}
          label="Bookmarks list"
        >
          <ListIcon />
        </ToolbarButton>
        <ToolbarButton active={activePanel === 'settings'} onClick={() => onTogglePanel('settings')} label="Display settings">
          <SettingsIcon />
        </ToolbarButton>
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </button>
      </div>

      <div className="toolbar__titles">
        <span className="toolbar__title">{title}</span>
        {chapterLabel && <span className="toolbar__chapter">{chapterLabel}</span>}
      </div>

      <div className="toolbar__spacer" />
    </header>
  );
}

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? 'icon-btn--active' : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
      <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TocIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="19" height="19" aria-hidden="true">
      <path
        d="M4 6h16M4 12h16M4 18h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="19" height="19" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 20l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="19" height="19" aria-hidden="true">
      <path
        d="M6 4h12v16l-6-4-6 4V4z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="19" height="19" aria-hidden="true">
      <path
        d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="19" height="19" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.8 6.2l-1.55 1.55M7.75 16.25 6.2 17.8M17.8 17.8l-1.55-1.55M7.75 7.75 6.2 6.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="19" height="19" aria-hidden="true">
      <path
        d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M9 20H5a1 1 0 0 1-1-1v-4M15 20h4a1 1 0 0 0 1-1v-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExitFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="19" height="19" aria-hidden="true">
      <path
        d="M5 9h4a1 1 0 0 0 1-1V4M19 9h-4a1 1 0 0 1-1-1V4M5 15h4a1 1 0 0 1 1 1v4M19 15h-4a1 1 0 0 0-1 1v4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
