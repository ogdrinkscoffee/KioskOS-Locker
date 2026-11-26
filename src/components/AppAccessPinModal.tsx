import React, { useEffect, useId, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, X } from 'lucide-react';
import { MAX_ADMIN_PIN_LENGTH, SimulatedAndroidApp } from '../utils/kioskEngine';
import { useI18n } from '../i18n/LocaleProvider';

interface AppAccessPinModalProps {
  app: SimulatedAndroidApp | null;
  isOpen: boolean;
  lockoutSeconds: number;
  onVerifyPin: (packageName: string, pin: string) => { verified: boolean; lockedOutSeconds?: number };
  onSuccess: (packageName: string) => void;
  onClose: () => void;
}

export const AppAccessPinModal: React.FC<AppAccessPinModalProps> = ({
  app,
  isOpen,
  lockoutSeconds,
  onVerifyPin,
  onSuccess,
  onClose,
}) => {
  const { tr } = useI18n();
  const [pinEntry, setPinEntry] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shakeCount, setShakeCount] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const inputId = useId();

  useEffect(() => {
    if (!isOpen) return;
    setPinEntry('');
    setShowPin(false);
    setErrorMessage(null);
    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(focusTimer);
  }, [isOpen, app?.packageName]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !app) return null;

  const isLockedOut = lockoutSeconds > 0;

  const handleDigitPress = (digit: string) => {
    if (isLockedOut) return;
    if (pinEntry.length < MAX_ADMIN_PIN_LENGTH) {
      setErrorMessage(null);
      setPinEntry((prev) => prev + digit);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedOut || !pinEntry.trim()) return;

    const result = onVerifyPin(app.packageName, pinEntry);
    if (result.verified) {
      setPinEntry('');
      setErrorMessage(null);
      onSuccess(app.packageName);
      return;
    }

    setPinEntry('');
    setShakeCount((c) => c + 1);
    if (result.lockedOutSeconds && result.lockedOutSeconds > 0) {
      setErrorMessage(
        tr('Too many failed attempts. Security cooldown active for {s}s.', {
          s: result.lockedOutSeconds,
        })
      );
    } else {
      setErrorMessage(tr('Incorrect App Access PIN. Default PIN is 1234 unless changed.'));
    }
    inputRef.current?.focus();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        key={shakeCount}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        data-testid="app-access-pin-modal"
        className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl p-5 space-y-4 transition-transform duration-150"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 id={titleId} className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {tr('App Access PIN Required')}
              </h3>
              <p id={descId} className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                {tr('Enter PIN to launch')} <span className="font-semibold text-slate-900 dark:text-slate-100">{app.label}</span>
              </p>
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {app.packageName}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr('Close PIN dialog')}
            className="min-h-[36px] min-w-[36px] -me-1 -mt-1 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor={inputId} className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {tr('App Access PIN')}
              </label>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                {pinEntry.length}/{MAX_ADMIN_PIN_LENGTH}
              </span>
            </div>
            <div className="relative">
              <input
                ref={inputRef}
                id={inputId}
                data-testid="app-access-pin-input"
                type={showPin ? 'text' : 'password'}
                maxLength={MAX_ADMIN_PIN_LENGTH}
                value={pinEntry}
                disabled={isLockedOut}
                onChange={(e) => {
                  setErrorMessage(null);
                  setPinEntry(e.target.value);
                }}
                placeholder={tr('Enter App Access PIN...')}
                className="w-full h-11 ps-3 pe-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono text-sm focus:outline-2 focus:outline-sky-600 disabled:bg-slate-100 dark:disabled:bg-slate-800"
              />
              <button
                type="button"
                onClick={() => setShowPin((prev) => !prev)}
                aria-label={showPin ? tr('Hide PIN') : tr('Show PIN')}
                className="absolute end-1 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              >
                {showPin ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
            {(errorMessage || isLockedOut) && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1.5 font-medium">
                {isLockedOut
                  ? tr('Security cooldown active ({s}s remaining).', { s: lockoutSeconds })
                  : errorMessage}
              </p>
            )}
          </div>

          <div
            role="group"
            aria-label={tr('Numeric PIN keypad')}
            className="grid grid-cols-3 gap-2"
          >
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={isLockedOut}
                onClick={() => handleDigitPress(digit)}
                className="min-h-[42px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 disabled:opacity-40 transition-colors"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              disabled={isLockedOut || pinEntry.length === 0}
              onClick={() => {
                setPinEntry('');
                setErrorMessage(null);
              }}
              className="min-h-[42px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40 transition-colors"
            >
              {tr('Clear')}
            </button>
            <button
              type="button"
              disabled={isLockedOut}
              onClick={() => handleDigitPress('0')}
              className="min-h-[42px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 disabled:opacity-40 transition-colors"
            >
              0
            </button>
            <button
              type="button"
              disabled={isLockedOut || pinEntry.length === 0}
              onClick={() => {
                setErrorMessage(null);
                setPinEntry((prev) => prev.slice(0, -1));
              }}
              aria-label={tr('Backspace')}
              className="min-h-[42px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40 transition-colors"
            >
              {tr('Del')}
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"
            >
              {tr('Cancel')}
            </button>
            <button
              type="submit"
              data-testid="app-access-pin-submit"
              disabled={isLockedOut || !pinEntry.trim()}
              className="flex-1 min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-45 disabled:cursor-not-allowed text-white text-xs font-semibold whitespace-nowrap transition-colors"
            >
              {tr('Unlock & Launch')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
