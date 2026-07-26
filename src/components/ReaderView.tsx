import { useCallback, useEffect, useState } from 'react';
import { useEpubReader } from '../hooks/useEpubReader';
import { useSettings } from '../context/SettingsContext';
import Toolbar, { type PanelName } from './Toolbar';
import SidePanel from './SidePanel';
import TocSidebar from './TocSidebar';
import BookmarksPanel from './BookmarksPanel';
import SearchPanel from './SearchPanel';
import SettingsPanel from './SettingsPanel';

interface ReaderViewProps {
  data: ArrayBuffer;
  fallbackTitle: string;
  onClose: () => void;
}

const PANEL_TITLES: Record<PanelName, string> = {
  bookmarks: 'Bookmarks',
  search: 'Search',
  settings: 'Display Settings',
};

export default function ReaderView({ data, fallbackTitle, onClose }: ReaderViewProps) {
  const { settings, updateSettings } = useSettings();
  const reader = useEpubReader(data, settings);
  const [activePanel, setActivePanel] = useState<PanelName | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const togglePanel = useCallback((panel: PanelName) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }, []);

  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') reader.prev();
      if (event.key === 'ArrowRight') reader.next();
      if (event.key === 'Escape') setActivePanel(null);
    };
    window.addEventListener('keyup', onKeyUp);
    return () => window.removeEventListener('keyup', onKeyUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader.next, reader.prev]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  const handleToggleToc = useCallback(() => {
    updateSettings({ tocOpen: !settings.tocOpen });
  }, [settings.tocOpen, updateSettings]);

  const handleTocWidthChange = useCallback(
    (width: number) => updateSettings({ tocWidth: width }),
    [updateSettings],
  );

  const handleSelectHref = useCallback(
    (href: string) => {
      reader.goToHref(href);
    },
    [reader],
  );

  const handleSelectCfi = useCallback(
    (cfi: string) => {
      reader.goToCfi(cfi);
      setActivePanel(null);
    },
    [reader],
  );

  return (
    <div className="reader">
      <Toolbar
        title={reader.title || fallbackTitle}
        chapterLabel={reader.currentChapterLabel}
        activePanel={activePanel}
        onTogglePanel={togglePanel}
        tocOpen={settings.tocOpen}
        onToggleToc={handleToggleToc}
        isBookmarked={reader.isCurrentBookmarked}
        onToggleBookmark={reader.toggleBookmark}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onClose={onClose}
      />

      <div className="reader__body">
        {settings.tocOpen && (
          <TocSidebar
            toc={reader.toc}
            currentHref={reader.currentHref}
            width={settings.tocWidth}
            onSelect={handleSelectHref}
            onClose={handleToggleToc}
            onWidthChange={handleTocWidthChange}
          />
        )}

        <div className="reader__viewport">
          <div className="reader__nav-zone reader__nav-zone--prev">
            <button
              type="button"
              className="reader__nav-arrow"
              aria-label="Previous page"
              onClick={() => reader.prev()}
            >
              <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
                <path
                  d="M15 19l-7-7 7-7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <div className="reader__container" ref={reader.containerRef} />
          <div className="reader__nav-zone reader__nav-zone--next">
            <button
              type="button"
              className="reader__nav-arrow"
              aria-label="Next page"
              onClick={() => reader.next()}
            >
              <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true">
                <path
                  d="M9 5l7 7-7 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {reader.loading && (
            <div className="reader__overlay">
              <div className="spinner" aria-label="Loading book" />
            </div>
          )}
          {reader.error && (
            <div className="reader__overlay">
              <div className="reader__error">
                <p>{reader.error}</p>
                <button type="button" className="btn btn--primary" onClick={onClose}>
                  Choose another file
                </button>
              </div>
            </div>
          )}
        </div>

        {activePanel && (
          <SidePanel title={PANEL_TITLES[activePanel]} onClose={() => setActivePanel(null)}>
            {activePanel === 'bookmarks' && (
              <BookmarksPanel
                bookmarks={reader.bookmarks}
                onSelect={handleSelectCfi}
                onRemove={reader.removeBookmark}
              />
            )}
            {activePanel === 'search' && <SearchPanel onSearch={reader.search} onSelect={handleSelectCfi} />}
            {activePanel === 'settings' && <SettingsPanel settings={settings} onChange={updateSettings} />}
          </SidePanel>
        )}
      </div>
    </div>
  );
}
