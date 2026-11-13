import { useEffect, useRef, useState } from 'react';
import type { SearchResult } from '../lib/types';
import type { SearchOptions } from '../hooks/useEpubReader';

interface SearchPanelProps {
  onSearch: (query: string, options?: SearchOptions) => Promise<SearchResult[]>;
  /** Go to a match and mark it on the page. */
  onSelect: (cfi: string) => void;
  /** Remove the on-page mark (new search, or the panel closing). */
  onClearMatch: () => void;
}

type Status = 'idle' | 'searching' | 'done';

export default function SearchPanel({ onSearch, onSelect, onClearMatch }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  // Index into `results` of the match shown on the page, or -1 for none.
  const [activeIndex, setActiveIndex] = useState(-1);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState({ searched: 0, total: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Stop any in-flight search and take the mark off the page when the panel closes.
  const clearMatchRef = useRef(onClearMatch);
  useEffect(() => {
    clearMatchRef.current = onClearMatch;
  }, [onClearMatch]);
  useEffect(
    () => () => {
      abortRef.current?.abort();
      clearMatchRef.current();
    },
    [],
  );

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    // A new search supersedes the previous one; its late results are dropped.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    onClearMatch();
    setResults([]);
    setActiveIndex(-1);
    setProgress({ searched: 0, total: 0 });
    setStatus('searching');

    await onSearch(trimmed, {
      caseSensitive,
      wholeWord,
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

  const goTo = (index: number) => {
    const result = results[index];
    if (!result) return;
    setActiveIndex(index);
    onSelect(result.cfi);
    listRef.current?.children[index]?.scrollIntoView({ block: 'nearest' });
  };

  // Wraps around at either end. With nothing selected yet, "next" starts at
  // the first match and "previous" at the last.
  const step = (delta: 1 | -1) => {
    if (results.length === 0) return;
    const from = activeIndex === -1 ? (delta === 1 ? -1 : 0) : activeIndex;
    goTo((from + delta + results.length) % results.length);
  };

  return (
    <div className="search-panel">
      <form onSubmit={runSearch} className="search-panel__form">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in book..."
          aria-label="Search in book"
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

      <div className="search-panel__options">
        <label>
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
          Match case
        </label>
        <label>
          <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} />
          Whole words
        </label>
      </div>

      {status === 'searching' && (
        <p className="search-panel__status" aria-live="polite">
          Searching… {progress.total > 0 && `${progress.searched} / ${progress.total} chapters`}
          {results.length > 0 && ` · ${results.length} found`}
        </p>
      )}
      {status === 'done' && results.length === 0 && <p className="side-panel__empty">No matches found.</p>}

      {status === 'done' && results.length > 0 && (
        <div className="search-panel__nav">
          <span aria-live="polite">
            {activeIndex === -1
              ? `${results.length} ${results.length === 1 ? 'match' : 'matches'}`
              : `${activeIndex + 1} of ${results.length}`}
            {progress.searched < progress.total && ' (search stopped early)'}
          </span>
          <button type="button" className="icon-btn" aria-label="Previous match" title="Previous match" onClick={() => step(-1)}>
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
              <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="icon-btn" aria-label="Next match" title="Next match" onClick={() => step(1)}>
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}

      {results.length > 0 && (
        <ul className="search-results" ref={listRef}>
          {results.map((result, index) => (
            <li key={`${result.cfi}-${index}`}>
              <button
                type="button"
                className={`search-result ${index === activeIndex ? 'search-result--active' : ''}`}
                aria-current={index === activeIndex ? 'true' : undefined}
                onClick={() => goTo(index)}
              >
                {result.excerpt.slice(0, result.matchStart)}
                <mark>{result.excerpt.slice(result.matchStart, result.matchStart + result.matchLength)}</mark>
                {result.excerpt.slice(result.matchStart + result.matchLength)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
