import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { SettingsProvider } from './context/SettingsContext';
import DropZone from './components/DropZone';
import BookDropOverlay from './components/BookDropOverlay';

// The reader pulls in epub.js and JSZip, the bulk of the bundle; load it only
// once there's a book to show so the drop zone appears quickly.
const ReaderView = lazy(() => import('./components/ReaderView'));
import { clearCurrentBook, loadCurrentBook, saveCurrentBook } from './lib/db';
import { openLibraryBook } from './lib/db';
import Library from './components/Library';
import './App.css';

function App() {
  const [bookData, setBookData] = useState<ArrayBuffer | null>(null);
  const [filename, setFilename] = useState('');
  // Bumped for every opened file so the reader remounts with clean state
  // (panels, search results) when one book is dropped over another.
  const [bookVersion, setBookVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [checkingStorage, setCheckingStorage] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadCurrentBook()
      .then((stored) => {
        if (cancelled || !stored) return;
        setBookData(stored.data);
        setFilename(stored.filename);
      })
      .catch((err: unknown) => {
        // IndexedDB can be unavailable (private browsing, blocked storage).
        // There's nothing to restore then, but the drop zone must still show.
        console.warn('Could not restore the last book', err);
      })
      .finally(() => {
        if (!cancelled) setCheckingStorage(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    const isEpub = file.name.toLowerCase().endsWith('.epub') || file.type === 'application/epub+zip';
    if (!isEpub) {
      setError(`"${file.name}" doesn't look like an EPUB file.`);
      return;
    }
    let data: ArrayBuffer;
    try {
      data = await file.arrayBuffer();
    } catch {
      setError('Could not read that file. Please try a different EPUB.');
      return;
    }
    try {
      await saveCurrentBook({ filename: file.name, data, savedAt: Date.now() });
    } catch (err) {
      // Storage full or unavailable: the book still opens, it just won't be
      // restored on the next visit.
      console.warn('Could not store the book for next time', err);
    }
    setFilename(file.name);
    setBookData(data);
    setBookVersion((v) => v + 1);
  }, []);

  const handleClose = useCallback(() => {
    setBookData(null);
    setFilename('');
    setError(null);
    clearCurrentBook().catch((err: unknown) => console.warn('Could not clear the stored book', err));
  }, []);

  const handleOpenFromLibrary = useCallback(async (bookId: string) => {
    setError(null);
    try {
      const stored = await openLibraryBook(bookId);
      if (!stored) {
        setError('That book is no longer stored in this browser. Drop the file again to read it.');
        return;
      }
      setFilename(stored.filename);
      setBookData(stored.data);
      setBookVersion((v) => v + 1);
    } catch (err) {
      console.warn('Could not open the stored book', err);
      setError('Could not open that book from storage.');
    }
  }, []);

  return (
    <SettingsProvider>
      <div className="app">
        {checkingStorage ? null : bookData ? (
          <Suspense
            fallback={
              <div className="reader__overlay">
                <div className="spinner" aria-label="Loading reader" />
              </div>
            }
          >
            <ReaderView key={bookVersion} data={bookData} fallbackTitle={filename} onClose={handleClose} />
            <BookDropOverlay onFile={handleFile} />
            {error && (
              <div className="app-banner" role="alert">
                <span>{error}</span>
                <button type="button" className="btn" onClick={() => setError(null)}>
                  Dismiss
                </button>
              </div>
            )}
          </Suspense>
        ) : (
          <DropZone onFile={handleFile} error={error}>
            <Library onOpen={handleOpenFromLibrary} />
          </DropZone>
        )}
      </div>
    </SettingsProvider>
  );
}

export default App;
