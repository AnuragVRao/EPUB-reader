import { useCallback, useEffect, useRef, useState } from 'react';
import { DictionaryError, fetchDefinitions, type DictionaryResult } from '../lib/dictionary';

export type DictionaryState =
  | { status: 'closed' }
  /** Lookups are off: the popup explains what turning them on means. */
  | { status: 'consent'; term: string }
  | { status: 'loading'; term: string }
  | { status: 'done'; term: string; result: DictionaryResult }
  | { status: 'error'; term: string; message: string };

/**
 * State for the dictionary popup. Nothing is requested unless `enabled` is
 * true; with it off, asking for a definition only opens the consent prompt.
 */
export function useDictionary(enabled: boolean, bookLanguage: string) {
  const [state, setState] = useState<DictionaryState>({ status: 'closed' });
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    (term: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ status: 'loading', term });
      fetchDefinitions(term, bookLanguage, controller.signal).then(
        (result) => {
          if (!controller.signal.aborted) setState({ status: 'done', term, result });
        },
        (err: unknown) => {
          if (controller.signal.aborted) return;
          const message = err instanceof DictionaryError ? err.message : 'The lookup failed.';
          setState({ status: 'error', term, message });
        },
      );
    },
    [bookLanguage],
  );

  const define = useCallback(
    (term: string) => {
      if (enabled) run(term);
      else setState({ status: 'consent', term });
    },
    [enabled, run],
  );

  // Called after the reader turns lookups on from the consent prompt.
  const continueAfterConsent = useCallback(() => {
    if (state.status === 'consent') run(state.term);
  }, [state, run]);

  const close = useCallback(() => {
    abortRef.current?.abort();
    setState({ status: 'closed' });
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { state, define, continueAfterConsent, close };
}
