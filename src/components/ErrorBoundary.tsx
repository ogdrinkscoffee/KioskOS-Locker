import React from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected application error.',
    };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info);
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

      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-bold text-base">
              <ShieldAlert className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>Workspace Recovery Mode</span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed break-words">
              {friendly}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your local offline kiosk &amp; self-improvement data remains safely stored on this device.
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="w-full min-h-[40px] px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-950 text-white text-xs font-semibold inline-flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Resume Offline &amp; Local Mode</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
