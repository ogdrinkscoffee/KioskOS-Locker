/**
 * UI strings for the KioskOS web console.
 *
 * English is the source of truth: `MessageKey` is derived from it, and the Arabic
 * dictionary is typed as `Record<MessageKey, string>`, so a missing translation is a
 * compile error rather than a silent English string in an Arabic page.
 */

export type Locale = 'en' | 'ar';

export const LOCALE_STORAGE_KEY = 'kioskos_locale_v1';

const en = {
  'lang.label': 'Change language',
  'lang.toArabic': 'العربية',
  'lang.toEnglish': 'English',

  'nav.sectionsLabel': 'Workspace sections',
  'nav.simulator': 'Simulator',
  'nav.simulatorShort': 'Sim',
  'nav.growth': 'Growth',
  'nav.growthShort': 'Grow',
  'nav.policy': 'Policy',
  'nav.policyShort': 'Policy',
  'nav.pc': 'PC Sync',
  'nav.pcShort': 'PC',
  'nav.adb': 'Provision',
  'nav.adbShort': 'ADB',

  'sync.action': 'Sync',
  'sync.synced': 'Synced',

  'theme.toLight': 'Switch to light mode',
  'theme.toDark': 'Switch to dark mode',
  'theme.lightMode': 'Light mode',
  'theme.darkMode': 'Dark mode',

  'download.apk': 'Download APK',
  'download.apkAria': 'Download the KioskOS Android APK',
  // {size} and {version} are filled from src/generated/apkMeta.ts.
  'download.apkTitle': 'Download the updated KioskOS APK ({size} MB, v{version})',
  'download.apkNotes':
    'New in v{version}: habits with streaks, goals with milestones, notebooks, urge pause, 30-day charts',

  'hero.eyebrow': 'Device Owner · Native Kotlin',
  'hero.title': 'Android Device Owner Kiosk Launcher',
  'hero.lead':
    'Lock a phone down, allowlist what stays, and test every policy in the simulator before you provision.',
  'hero.bullet.allowlist': 'PIN-protected allowlist',
  'hero.bullet.locktask': 'LockTask lockdown',
  'hero.bullet.blockers': 'Blockers & downtime',
  'hero.bullet.sync': 'Cross-device sync',

  'footer.copyright': '© 2026 KioskOS · Proprietary software and UI.',
  'footer.terms': 'Terms',
  'footer.licensing': 'Licensing',
} as const;

export type MessageKey = keyof typeof en;

const ar: Record<MessageKey, string> = {
  'lang.label': 'تغيير اللغة',
  'lang.toArabic': 'العربية',
  'lang.toEnglish': 'English',

  'nav.sectionsLabel': 'أقسام مساحة العمل',
  'nav.simulator': 'المحاكي',
  'nav.simulatorShort': 'محاكي',
  'nav.growth': 'النمو',
  'nav.growthShort': 'نمو',
  'nav.policy': 'السياسة',
  'nav.policyShort': 'السياسة',
  'nav.pc': 'مزامنة الحاسوب',
  'nav.pcShort': 'PC',
  'nav.adb': 'التهيئة',
  'nav.adbShort': 'ADB',

  'sync.action': 'مزامنة',
  'sync.synced': 'متزامن',

  'theme.toLight': 'التبديل إلى الوضع الفاتح',
  'theme.toDark': 'التبديل إلى الوضع الداكن',
  'theme.lightMode': 'الوضع الفاتح',
  'theme.darkMode': 'الوضع الداكن',

  'download.apk': 'تنزيل APK',
  'download.apkAria': 'نزّل تطبيق KioskOS لأندرويد',
  'download.apkTitle': 'نزّل ملف KioskOS APK المحدّث ({size} ميجابايت، الإصدار {version})',
  'download.apkNotes':
    'جديد في الإصدار {version}: عادات مع سلسلة إنجاز، أهداف بمراحل، دفاتر ملاحظات، توقف لتهدئة الرغبة، ومخططات 30 يومًا',

  'hero.eyebrow': 'مالك الجهاز · كوتلن أصلي',
  'hero.title': 'مشغّل كشك أندرويد بصفة مالك الجهاز',
  'hero.lead': 'اقفل الهاتف، وحدّد ما يبقى مسموحًا، واختبر كل سياسة في المحاكي قبل التهيئة.',
  'hero.bullet.allowlist': 'قائمة مسموحة محمية برمز',
  'hero.bullet.locktask': 'تثبيت LockTask',
  'hero.bullet.blockers': 'حظر ومواعيد توقف',
  'hero.bullet.sync': 'مزامنة بين الأجهزة',

  'footer.copyright': '© 2026 KioskOS · برنامج وواجهة مملوكة.',
  'footer.terms': 'الشروط',
  'footer.licensing': 'الترخيص',
};

export const messages: Record<Locale, Record<MessageKey, string>> = { en, ar };

export const LOCALES: Locale[] = ['en', 'ar'];

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'ar';
}

/** Best-effort initial locale: a saved choice, otherwise the browser language. */
export function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // Private mode or blocked storage: fall through to the browser language.
  }
  const browser = typeof navigator === 'undefined' ? 'en' : navigator.language ?? 'en';
  return browser.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}
