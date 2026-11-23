/**
 * UI strings for the Ironclad OS web console.
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
  'nav.features': 'Features',
  'nav.featuresShort': 'Features',
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

  'download.apk': 'Download Ironclad OS',
  'download.apkAria': 'Download the Ironclad OS Android APK',
  // {size} and {version} are filled from src/generated/apkMeta.ts.
  'download.apkTitle': 'Download the Ironclad OS APK ({size} MB, v{version})',
  'download.apkNotes': 'Free download · v{version} · Works offline · No account needed',

  'hero.eyebrow': 'System-level Android lockdown',
  'hero.title': 'Quit doomscrolling and porn or buy a new phone',
  'hero.lead':
    'Ironclad OS locks down your Android device at the system level—permanently blocking porn, social media, and unwanted apps. Not even a factory reset can undo it (toggleable).',
  'hero.cta': 'Download Ironclad OS APK',
  'hero.meta': 'v{version} · {size} MB · Android',
  'hero.bullet.reset': 'Survives factory resets',
  'hero.bullet.block': 'Porn & social media blocked',
  'hero.bullet.allowlist': 'Strict app allowlist',
  'hero.bullet.bypass': 'No bypass, no off switch',
  'hero.imageAlt': 'A phone sealed inside a steel shield vault',

  'features.eyebrow': 'Why Ironclad OS',
  'features.title': 'Six locks. No back doors.',
  'features.lead': 'Set your rules once, lock them in, and get your attention back.',
  'features.tag': 'Permanent',
  'features.survives.title': 'Survives Factory Resets',
  'features.survives.body':
    'Enforced at the hardware/system level. Wiping or resetting the phone will not remove the lock—the only way around it is buying a new phone.',
  'features.porn.title': 'Hardcore Porn & Adult Content Block',
  'features.porn.body':
    'System-wide blocking that eliminates adult websites and explicit content permanently with zero bypasses.',
  'features.social.title': 'Total Social Media Lockdown',
  'features.social.body':
    "Blocks distracting social media platforms and short-form video feeds at the OS level so you can't reinstall or sneak around them.",
  'features.allowlist.title': 'Strict App Allowlist (Kiosk Lockdown)',
  'features.allowlist.body':
    'Restricts the device strictly to the essential apps and tools you approve, turning your smartphone into a pure utility device.',
  'features.tamper.title': 'Tamper & Bypass Proof',
  'features.tamper.body':
    'Prevents uninstalling the APK, disabling device admin/owner permissions, sideloading blocked apps, or escaping via Safe Mode.',
  'features.willpower.title': 'No Willpower Needed',
  'features.willpower.body':
    'Set your rules once and lock them in. Once active, there is no “off” switch or moment-of-weakness override.',

  'notice.title': 'Warning',
  'notice.body':
    'Ironclad OS is permanent by design. Make sure you are ready before installing—not even a factory reset will revert your device.',

  'footer.copyright': '© 2026 Ironclad OS · Proprietary software and UI.',
  'footer.terms': 'Terms',
  'footer.licensing': 'Licensing',
} as const;

export type MessageKey = keyof typeof en;

const ar: Record<MessageKey, string> = {
  'lang.label': 'تغيير اللغة',
  'lang.toArabic': 'العربية',
  'lang.toEnglish': 'English',

  'nav.sectionsLabel': 'أقسام مساحة العمل',
  'nav.features': 'المزايا',
  'nav.featuresShort': 'المزايا',
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

  'download.apk': 'نزّل Ironclad OS',
  'download.apkAria': 'نزّل تطبيق Ironclad OS لأندرويد',
  'download.apkTitle': 'نزّل ملف Ironclad OS APK ({size} ميجابايت، الإصدار {version})',
  'download.apkNotes': 'تنزيل مجاني · الإصدار {version} · يعمل دون إنترنت · بلا حساب',

  'hero.eyebrow': 'قفل على مستوى نظام أندرويد',
  'hero.title': 'اترك التصفح القهري والإباحية… أو اشترِ هاتفًا جديدًا',
  'hero.lead':
    'يقفل Ironclad OS جهاز أندرويد على مستوى النظام، فيحظر الإباحية ووسائل التواصل والتطبيقات غير المرغوبة حظرًا دائمًا. حتى إعادة ضبط المصنع لا تلغي القفل (قابل للإيقاف).',
  'hero.cta': 'نزّل Ironclad OS APK',
  'hero.meta': 'الإصدار {version} · {size} ميجابايت · أندرويد',
  'hero.bullet.reset': 'يصمد بعد إعادة ضبط المصنع',
  'hero.bullet.block': 'حظر الإباحية ووسائل التواصل',
  'hero.bullet.allowlist': 'قائمة تطبيقات صارمة',
  'hero.bullet.bypass': 'بلا تجاوز وبلا مفتاح إيقاف',
  'hero.imageAlt': 'هاتف محكم داخل درع فولاذي',

  'features.eyebrow': 'لماذا Ironclad OS',
  'features.title': 'ستة أقفال. بلا أبواب خلفية.',
  'features.lead': 'اضبط قواعدك مرة واحدة، وأقفلها، واستعد انتباهك.',
  'features.tag': 'دائم',
  'features.survives.title': 'يصمد بعد إعادة ضبط المصنع',
  'features.survives.body':
    'مفروض على مستوى العتاد والنظام. مسح الهاتف أو إعادة ضبطه لن يزيل القفل — الطريق الوحيد للتحايل هو شراء هاتف جديد.',
  'features.porn.title': 'حظر صارم للإباحية والمحتوى للبالغين',
  'features.porn.body':
    'حظر على مستوى النظام يزيل مواقع البالغين والمحتوى الصريح نهائيًا دون أي طرق للتجاوز.',
  'features.social.title': 'إغلاق كامل لوسائل التواصل',
  'features.social.body':
    'يحظر منصات التواصل المشتتة وخلاصات الفيديو القصيرة على مستوى النظام، فلا يمكنك إعادة تثبيتها أو الالتفاف عليها.',
  'features.allowlist.title': 'قائمة تطبيقات صارمة (قفل الكشك)',
  'features.allowlist.body':
    'يحصر الجهاز في التطبيقات والأدوات الأساسية التي توافق عليها فقط، فيصبح الهاتف أداة نافعة خالصة.',
  'features.tamper.title': 'مقاوم للعبث والتجاوز',
  'features.tamper.body':
    'يمنع إزالة التطبيق، أو تعطيل صلاحيات مسؤول/مالك الجهاز، أو تثبيت تطبيقات محظورة، أو الهروب عبر الوضع الآمن.',
  'features.willpower.title': 'لا حاجة لإرادة',
  'features.willpower.body':
    'اضبط قواعدك مرة واحدة وأقفلها. بعد التفعيل لا يوجد مفتاح إيقاف ولا لحظة ضعف تسمح بالتجاوز.',

  'notice.title': 'تحذير',
  'notice.body':
    'Ironclad OS دائم بحكم التصميم. تأكد أنك مستعد قبل التثبيت — حتى إعادة ضبط المصنع لن تُرجع جهازك.',

  'footer.copyright': '© 2026 Ironclad OS · برنامج وواجهة مملوكة.',
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
