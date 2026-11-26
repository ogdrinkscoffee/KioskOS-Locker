import React, { useEffect, useId, useRef } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useI18n } from '../i18n/LocaleProvider';

export const TURNSTILE_SITE_KEY = (
  import.meta.env.VITE_TURNSTILE_SITE_KEY ?? ''
).trim();

interface TurnstileChallengeProps {
  honeypot: string;
  onHoneypotChange: (value: string) => void;
  onTokenChange: (token: string | null) => void;
  resetCounter: number;
  compact?: boolean;
}

export const TurnstileChallenge: React.FC<TurnstileChallengeProps> = ({
  honeypot,
  onHoneypotChange,
  onTokenChange,
  resetCounter,
  compact = false,
}) => {
  const { tr } = useI18n();
  const honeypotId = useId();
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const initialRenderRef = useRef(true);

  useEffect(() => {
    if (initialRenderRef.current) {
      initialRenderRef.current = false;
      return;
    }
    onTokenChange(null);
    turnstileRef.current?.reset();
  }, [resetCounter, onTokenChange]);

  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark');

  return (
    <div className="space-y-1.5">
      {/* Hidden honeypot field as automated-bot fallback */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor={honeypotId}>{tr('Leave this field empty')}</label>
        <input
          id={honeypotId}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => onHoneypotChange(e.target.value)}
        />
      </div>

      {TURNSTILE_SITE_KEY ? (
        <div className={compact ? 'max-w-full overflow-x-auto' : 'max-w-full overflow-x-auto'}>
          <Turnstile
            ref={turnstileRef}
            siteKey={TURNSTILE_SITE_KEY}
            options={{
              theme: isDark ? 'dark' : 'light',
              size: compact ? 'compact' : 'flexible',
            }}
            onSuccess={(token) => onTokenChange(token)}
            onExpire={() => onTokenChange(null)}
            onError={() => onTokenChange(null)}
          />
        </div>
      ) : (
        <p
          role="status"
          className="text-[11px] font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1.5"
        >
          {tr('Turnstile verification unavailable: set VITE_TURNSTILE_SITE_KEY to enable submission.')}
        </p>
      )}
    </div>
  );
};
