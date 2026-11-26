import React from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  sectionName?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected application error.',
    };
  }

  override componentDidCatch(error: Error, _info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error.name || 'Error');
  }

  override render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as {
          error?: string;
          operationType?: string;
          path?: string;
        };
        if (parsed.error) {
          friendly = `Cloud sync permission or network notice (${parsed.operationType ?? 'op'} on ${parsed.path ?? 'doc'}): ${parsed.error}`;
        }
      } catch {
        // Non-JSON error message
      }

      const isSection = Boolean(this.props.sectionName);
      const containerClass = isSection
        ? 'surface flex items-center justify-center p-6 sm:p-10'
        : 'min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6';

      return (
        <div role="alert" className={containerClass}>
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-bold text-base">
              <ShieldAlert className="w-5 h-5 shrink-0" aria-hidden="true" />
              {isSection ? (
                <h2>{this.props.sectionName} Recovery Mode</h2>
              ) : (
                <h1>Workspace Recovery Mode</h1>
              )}
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed break-words">
              {friendly}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your local offline kiosk &amp; self-improvement data remains safely stored on this device.
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                this.props.onReset?.();
              }}
              className="w-full min-h-[40px] px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-950 text-white text-xs font-semibold inline-flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isSection ? 'Reload This Section' : 'Resume Offline & Local Mode'}</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
