import { useEffect, useRef } from 'react';
import { DICTIONARY_NAME, DICTIONARY_ORIGIN } from '../lib/dictionary';
import type { DictionaryState } from '../hooks/useDictionary';

interface DefinitionPopupProps {
  state: Exclude<DictionaryState, { status: 'closed' }>;
  /** Turns lookups on (a saved setting) and carries on with this one. */
  onEnable: () => void;
  onClose: () => void;
}

const HOST = new URL(DICTIONARY_ORIGIN).host;

export default function DefinitionPopup({ state, onEnable, onClose }: DefinitionPopupProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Focus may still be inside the book's iframe, where Escape can't be seen.
  useEffect(() => {
    cardRef.current?.focus();
  }, [state.status]);

  return (
    <div className="note-popup" onClick={onClose}>
      <div
        className="note-popup__card definition"
        role="dialog"
        aria-label={`Definition of ${state.term}`}
        tabIndex={-1}
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
        onKeyUp={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <h2 className="definition__term">{state.term}</h2>

        {state.status === 'consent' && (
          <>
            <p className="definition__message">
              Looking up words uses {DICTIONARY_NAME}. The word you look up is sent to <strong>{HOST}</strong>; nothing
              else about you or this book leaves the browser. You can turn this off again in Display settings.
            </p>
            <div className="note-popup__actions">
              <button type="button" className="btn" onClick={onClose}>
                Not now
              </button>
              <button type="button" className="btn btn--primary" onClick={onEnable}>
                Turn on lookups
              </button>
            </div>
          </>
        )}

        {state.status === 'loading' && (
          <p className="definition__message" aria-live="polite">
            Looking up…
          </p>
        )}

        {state.status === 'error' && (
          <p className="definition__message" aria-live="polite">
            {state.message}
          </p>
        )}

        {state.status === 'done' && (
          <div className="definition__entries">
            {state.result.term !== state.term && <p className="definition__found">Showing “{state.result.term}”</p>}
            {state.result.entries.map((entry, i) => (
              <section key={i} className="definition__entry">
                <h3>
                  {entry.partOfSpeech}
                  {entry.language && <span className="definition__language"> · {entry.language}</span>}
                </h3>
                <ol>
                  {entry.definitions.map((text, j) => (
                    <li key={j}>{text}</li>
                  ))}
                </ol>
              </section>
            ))}
            <p className="definition__source">
              From{' '}
              <a href={state.result.url} target="_blank" rel="noopener noreferrer">
                {DICTIONARY_NAME}
              </a>
              , available under{' '}
              <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">
                CC BY-SA 4.0
              </a>
              .
            </p>
          </div>
        )}

        {state.status !== 'consent' && (
          <div className="note-popup__actions">
            <button type="button" className="btn btn--primary" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
