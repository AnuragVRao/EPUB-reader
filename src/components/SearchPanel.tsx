import { useEffect, useRef, useState } from 'react';
import type { SearchResult } from '../lib/types';
import type { SearchOptions } from '../hooks/useEpubReader';

interface SearchPanelProps {
  onSearch: (query: string, options?: SearchOptions) => Promise<SearchResult[]>;
  onSelect: (cfi: string) => void;
}

type Status = 'idle' | 'searching' | 'done';

export default function SearchPanel({ onSearch, onSelect }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  // The query that produced `results` - highlighting must use this, not the
  // live input, or editing the box after a search breaks the highlights.
  const [searchedQuery, setSearchedQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState({ searched: 0, total: 0 });
  const abortRef = useRef<AbortController | null>(null);

  // Stop any in-flight search when the panel closes.
  useEffect(() => () => abortRef.current?.abort(), []);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    // A new search supersedes the previous one; its late results are dropped.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearchedQuery(trimmed);
    setResults([]);
    setProgress({ searched: 0, total: 0 });
    setStatus('searching');

    await onSearch(trimmed, {
      signal: controller.signal,
      onProgress: (searched, total) => {
        if (!controller.signal.aborted) setProgress({ searched, total });
      },
      onResults: (found) => {
        if (!controller.signal.aborted) setResults((prev) => [...prev, ...found]);
      },
    });

    if (!controller.signal.aborted) setStatus('done');
  };

  const cancelSearch = () => {
    abortRef.current?.abort();
    setStatus('done');
  };

  return (
    <div className="search-panel">
      <form onSubmit={runSearch} className="search-panel__form">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in book..."
          className="text-input"
          autoFocus
        />
        {status === 'searching' ? (
          <button type="button" className="btn" onClick={cancelSearch}>
            Stop
          </button>
        ) : (
          <button type="submit" className="btn btn--primary">
            Search
          </button>
        )}
      </form>

      {status === 'searching' && (
        <p className="search-panel__status" aria-live="polite">
          Searching… {progress.total > 0 && `${progress.searched} / ${progress.total} chapters`}
          {results.length > 0 && ` · ${results.length} found`}
        </p>
      )}
      {status === 'done' && results.length > 0 && (
        <p className="search-panel__status" aria-live="polite">
          {results.length} {results.length === 1 ? 'match' : 'matches'}
          {progress.searched < progress.total && ' (search stopped early)'}
        </p>
      )}
      {status === 'done' && results.length === 0 && <p className="side-panel__empty">No matches found.</p>}

      {results.length > 0 && (
        <ul className="search-results">
          {results.map((result, index) => (
            <li key={`${result.cfi}-${index}`}>
              <button type="button" className="search-result" onClick={() => onSelect(result.cfi)}>
                {highlightExcerpt(result.excerpt, searchedQuery)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function highlightExcerpt(excerpt: string, query: string) {
  const idx = excerpt.toLowerCase().indexOf(query.toLowerCase());
  if (!query || idx === -1) return <>{excerpt}</>;
  return (
    <>
      {excerpt.slice(0, idx)}
      <mark>{excerpt.slice(idx, idx + query.length)}</mark>
      {excerpt.slice(idx + query.length)}
    </>
  );
}
