import { useCallback, useEffect, useState } from 'react';
import { SettingsProvider } from './context/SettingsContext';
import DropZone from './components/DropZone';
import ReaderView from './components/ReaderView';
import { clearCurrentBook, loadCurrentBook, saveCurrentBook } from './lib/db';
import './App.css';

function App() {
  const [bookData, setBookData] = useState<ArrayBuffer | null>(null);
  const [filename, setFilename] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checkingStorage, setCheckingStorage] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadCurrentBook().then((stored) => {
      if (cancelled || !stored) {
        setCheckingStorage(false);
        return;
      }
      setBookData(stored.data);
      setFilename(stored.filename);
      setCheckingStorage(false);
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
    try {
      const data = await file.arrayBuffer();
      await saveCurrentBook({ filename: file.name, data, savedAt: Date.now() });
      setFilename(file.name);
      setBookData(data);
    } catch {
      setError('Could not read that file. Please try a different EPUB.');
    }
  }, []);

  const handleClose = useCallback(() => {
    setBookData(null);
    setFilename('');
    clearCurrentBook();
  }, []);

  return (
    <SettingsProvider>
      <div className="app">
        {checkingStorage ? null : bookData ? (
          <ReaderView data={bookData} fallbackTitle={filename} onClose={handleClose} />
        ) : (
          <DropZone onFile={handleFile} error={error} />
        )}
      </div>
    </SettingsProvider>
  );
}

export default App;
