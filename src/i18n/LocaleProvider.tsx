import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  LOCALE_STORAGE_KEY,
  initialLocale,
  messages,
  type Locale,
  type MessageKey,
} from './messages';
import { panelAr } from './panelAr';

export type Direction = 'ltr' | 'rtl';

interface I18nValue {
  locale: Locale;
  dir: Direction;
  isRtl: boolean;
  setLocale: (next: Locale) => void;
  /**
   * Looks a key up in the active locale. English is the fallback, so a key added
   * before its Arabic translation still renders instead of showing the raw key.
   */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  /**
   * Translates a panel string by its English text: `tr('Allowlist')`. The English
   * text is the key, so an untranslated string renders in English instead of
   * disappearing, and no dictionary lookup can ever produce a raw key.
   */
  tr: (text: string, vars?: Record<string, string | number>) => string;
  /** Arabic needs the right day form: 1 يوم، 2 يومان، 3–10 أيام، 11+ يومًا. */
  pluralDays: (count: number) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function interpolate(message: string, vars?: Record<string, string | number>): string {
  if (!vars) return message;
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    message
  );
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const dir: Direction = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // Storage is optional; the language still applies for this session.
    }
  }, [locale, dir]);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) =>
      interpolate(messages[locale][key] ?? messages.en[key] ?? key, vars),
    [locale]
  );

  const tr = useCallback(
    (text: string, vars?: Record<string, string | number>) =>
      interpolate((locale === 'ar' ? panelAr[text] : undefined) ?? text, vars),
    [locale]
  );

  const pluralDays = useCallback(
    (count: number) => {
      if (locale !== 'ar') return count === 1 ? 'day' : 'days';
      const n = Math.abs(count) % 100;
      if (count === 1) return 'يوم';
      if (count === 2) return 'يومان';
      if (n >= 3 && n <= 10) return 'أيام';
      if (n >= 11 && n <= 99) return 'يومًا';
      return 'يوم';
    },
    [locale]
  );

  const value = useMemo<I18nValue>(
    () => ({ locale, dir, isRtl: dir === 'rtl', setLocale, t, tr, pluralDays }),
    [locale, dir, setLocale, t, tr, pluralDays]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside a LocaleProvider');
  return value;
}
