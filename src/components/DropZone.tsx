import { useCallback, useRef, useState } from 'react';

interface DropZoneProps {
  onFile: (file: File) => void;
  error: string | null;
}

export default function DropZone({ onFile, error }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      onFile(files[0]);
    },
    [onFile],
  );

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragging(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  return (
    <div
      className={`drop-zone ${isDragging ? 'drop-zone--active' : ''}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="drop-zone__card">
        <svg className="drop-zone__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 3v12m0 0-4-4m4 4 4-4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h1>Drop an EPUB to start reading</h1>
        <p>Your file stays in this browser &mdash; nothing is uploaded anywhere.</p>
        <button type="button" className="btn btn--primary" onClick={() => inputRef.current?.click()}>
          Browse for a file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".epub,application/epub+zip"
          className="visually-hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {error && <p className="drop-zone__error">{error}</p>}
      </div>
    </div>
  );
}
