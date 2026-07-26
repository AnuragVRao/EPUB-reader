import { useState } from 'react';
import type { SearchResult } from '../lib/types';

interface SearchPanelProps {
  onSearch: (query: string) => Promise<SearchResult[]>;
  onSelect: (cfi: string) => void;
}

export default function SearchPanel({ onSearch, onSelect }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<'idle' | 'searching' | 'done'>('idle');

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setStatus('searching');
    const found = await onSearch(query);
    setResults(found);
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
        <button type="submit" className="btn btn--primary" disabled={status === 'searching'}>
          {status === 'searching' ? 'Searching…' : 'Search'}
        </button>
      </form>

      {status === 'done' && results.length === 0 && <p className="side-panel__empty">No matches found.</p>}

      {results.length > 0 && (
        <ul className="search-results">
          {results.map((result, index) => (
            <li key={`${result.cfi}-${index}`}>
              <button type="button" className="search-result" onClick={() => onSelect(result.cfi)}>
                {highlightExcerpt(result.excerpt, query)}
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
  if (idx === -1) return <>{excerpt}</>;
  return (
    <>
      {excerpt.slice(0, idx)}
      <mark>{excerpt.slice(idx, idx + query.length)}</mark>
      {excerpt.slice(idx + query.length)}
    </>
  );
}
