import { useCallback, useEffect, useState } from 'react';
import { useEpubReader } from '../hooks/useEpubReader';
import { useSettings } from '../context/SettingsContext';
import { pageKeyAction } from '../lib/keys';
import { formatDuration } from '../lib/readingTime';
import Toolbar, { type PanelName } from './Toolbar';
import SidePanel from './SidePanel';
import TocSidebar from './TocSidebar';
import BookmarksPanel from './BookmarksPanel';
import SearchPanel from './SearchPanel';
import SettingsPanel from './SettingsPanel';
import HighlightsPanel from './HighlightsPanel';
import SelectionBar from './SelectionBar';
import NotePopup from './NotePopup';
import ImageZoom from './ImageZoom';

interface ReaderViewProps {
  data: ArrayBuffer;
  fallbackTitle: string;
  onClose: () => void;
}

const PANEL_TITLES: Record<PanelName, string> = {
  bookmarks: 'Bookmarks and highlights',
  search: 'Search',
  settings: 'Display Settings',
};

// Matches the phone breakpoint in App.css, where the contents list and side
// panel become full-screen overlays.
function isPhoneLayout(): boolean {
  return window.matchMedia('(max-width: 640px)').matches;
}

export default function ReaderView({ data, fallbackTitle, onClose }: ReaderViewProps) {
  const { settings, theme, updateSettings } = useSettings();
  const reader = useEpubReader(data, settings, theme, fallbackTitle);
  const [activePanel, setActivePanel] = useState<PanelName | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const percentLabel = reader.percentage === null ? '' : `${Math.round(reader.percentage * 100)}%`;

  const timeLeftLabel = reader.timeLeft ? `${formatDuration(reader.timeLeft.chapter)} left in chapter` : '';
  const timeLeftDetail = reader.timeLeft ? `About ${formatDuration(reader.timeLeft.book)} left in the book` : '';

  // Read out by screen readers after each page turn. The book's iframe gives
  // them no other signal that the content changed.
  const announcement = [
    reader.currentChapterLabel,
    reader.pageInfo && settings.flow === 'paginated'
      ? `page ${reader.pageInfo.page} of ${reader.pageInfo.total} in chapter`
      : '',
    percentLabel ? `${percentLabel} of book` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const togglePanel = useCallback((panel: PanelName) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }, []);

  // Clicking a highlight on the page opens the list with that one picked out.
  useEffect(() => {
    if (reader.clickedHighlight) setActivePanel('bookmarks');
  }, [reader.clickedHighlight]);

  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActivePanel(null);
        return;
      }
      // pageKeyAction ignores keys aimed at text fields, sliders and buttons.
      const action = pageKeyAction(event, settings.flow);
      if (action) reader.turn(action);
    };
    window.addEventListener('keyup', onKeyUp);
    return () => window.removeEventListener('keyup', onKeyUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader.turn, settings.flow]);

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
      // On a phone the contents list covers the whole page: get out of the way.
      if (isPhoneLayout()) updateSettings({ tocOpen: false });
    },
    [reader, updateSettings],
  );

  // The contents list defaults to open, which on a phone would hide the book
  // behind it as soon as one is opened.
  useEffect(() => {
    if (isPhoneLayout()) updateSettings({ tocOpen: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectCfi = useCallback(
    (cfi: string) => {
      reader.goToCfi(cfi);
      setActivePanel(null);
    },
    [reader],
  );

  // Unlike a bookmark, choosing a search match keeps the panel open so the
  // next/previous buttons stay to hand - except on a phone-width screen,
  // where the panel covers the page the match is on.
  const handleSelectMatch = useCallback(
    (cfi: string) => {
      reader.showSearchMatch(cfi);
      if (window.matchMedia('(max-width: 640px)').matches) setActivePanel(null);
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
        progressLabel={percentLabel}
        timeLeftLabel={timeLeftLabel}
        timeLeftDetail={timeLeftDetail}
        onClose={onClose}
      />

      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {reader.loading ? '' : announcement}
      </div>

      <div className="reader__body">
        {settings.tocOpen && (
          <TocSidebar
            toc={reader.toc}
            currentHref={reader.currentHref}
            activeHref={reader.currentTocHref}
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
          {/* epub.js measures the container's border box, so the margin has to
              come from a wrapper's padding rather than the container's own. */}
          <div className="reader__page" style={{ padding: `0 ${settings.pageMargin}%` }}>
            <div className="reader__container" ref={reader.containerRef} />
          </div>
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

          {reader.percentage !== null && (
            <div
              className="reader__progress"
              role="progressbar"
              aria-label="Reading progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(reader.percentage * 100)}
            >
              <div className="reader__progress-fill" style={{ width: `${reader.percentage * 100}%` }} />
            </div>
          )}

          <SelectionBar
            selection={reader.selection}
            onHighlight={reader.addHighlight}
            onDismiss={reader.clearSelection}
          />
          {reader.note && <NotePopup note={reader.note} onClose={reader.dismissNote} onGoTo={reader.goToHref} />}
          {reader.zoomedImage && <ImageZoom image={reader.zoomedImage} onClose={reader.dismissZoom} />}

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
                onUpdate={reader.updateBookmark}
              />
            )}
            {activePanel === 'bookmarks' && (
              <HighlightsPanel
                highlights={reader.highlights}
                focusId={reader.clickedHighlight?.id}
                onSelect={handleSelectCfi}
                onRemove={reader.removeHighlight}
                onUpdateNote={reader.updateHighlightNote}
              />
            )}
            {activePanel === 'search' && (
              <SearchPanel
                onSearch={reader.search}
                onSelect={handleSelectMatch}
                onClearMatch={reader.clearSearchMatch}
              />
            )}
            {activePanel === 'settings' && (
              <SettingsPanel
                settings={settings}
                onChange={updateSettings}
                onClearOtherBooks={reader.clearOtherBooks}
                onListSavedBooks={reader.listSavedBooks}
                onExportData={reader.exportData}
                onImportData={reader.importData}
                onRemoveSavedBook={reader.removeSavedBook}
              />
            )}
          </SidePanel>
        )}
      </div>
    </div>
  );
}
