import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearCurrentBook } from '../lib/db';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error in reader', error, info.componentStack);
  }

  // The current book is restored from IndexedDB on every load, so a book that
  // crashes the reader would crash again on refresh. Dropping it first is the
  // only way back to the drop zone.
  handleDiscardBook = async () => {
    try {
      await clearCurrentBook();
    } catch (err) {
      console.error('Failed to clear the stored book', err);
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="drop-zone">
        <div className="drop-zone__card">
          <h1>Something went wrong</h1>
          <p>
            The reader hit an unexpected error. Closing the current book usually clears it &mdash; your
            bookmarks and reading position are kept.
          </p>
          <button type="button" className="btn btn--primary" onClick={this.handleDiscardBook}>
            Close book and reload
          </button>
          <p className="drop-zone__error">{this.state.error.message}</p>
        </div>
      </div>
    );
  }
}
