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
  'lang.label': 'غيّر اللغة',
  'lang.toArabic': 'العربية',
  'lang.toEnglish': 'English',

  'nav.sectionsLabel': 'أقسام مساحة الشغل',
  'nav.features': 'المزايا',
  'nav.featuresShort': 'المزايا',
  'nav.simulator': 'المحاكي',
  'nav.simulatorShort': 'محاكي',
  'nav.growth': 'النمو',
  'nav.growthShort': 'نمو',
  'nav.policy': 'السياسة',
  'nav.policyShort': 'السياسة',
  'nav.pc': 'مزامنة الكمبيوتر',
  'nav.pcShort': 'PC',
  'nav.adb': 'تجهيز الجهاز',
  'nav.adbShort': 'ADB',

  'sync.action': 'زامن',
  'sync.synced': 'متزامن',

  'theme.toLight': 'حوّل للوضع الفاتح',
  'theme.toDark': 'حوّل للوضع الغامق',
  'theme.lightMode': 'الوضع الفاتح',
  'theme.darkMode': 'الوضع الغامق',

  'download.apk': 'نزّل Ironclad OS',
  'download.apkAria': 'نزّل تطبيق Ironclad OS لأندرويد',
  'download.apkTitle': 'نزّل ملف Ironclad OS APK ({size} ميجا، إصدار {version})',
  'download.apkNotes': 'تنزيل مجاني · إصدار {version} · شغال من غير نت · من غير حساب',

  'hero.eyebrow': 'قفل على مستوى نظام أندرويد',
  'hero.title': 'اطلع من الدوم سكرولنج والإباحية… أو اشتري موبايل جديد',
  'hero.lead':
    'Ironclad OS بيقفل موبايلك على مستوى النظام، وبيمنع الإباحية والسوشيال ميديا والتطبيقات اللي مش عايزها بشكل دايم. حتى ضبط المصنع مش هيرجّع القفل (وتقدر تقفله).',
  'hero.cta': 'نزّل Ironclad OS APK',
  'hero.meta': 'إصدار {version} · {size} ميجا · أندرويد',
  'hero.bullet.reset': 'بيفضل بعد ضبط المصنع',
  'hero.bullet.block': 'الإباحية والسوشيال ميديا مقفولين',
  'hero.bullet.allowlist': 'قائمة تطبيقات صارمة',
  'hero.bullet.bypass': 'مفيش تجاوز ولا زرار إيقاف',
  'hero.imageAlt': 'موبايل مقفول جوه خزنة درع صلب',

  'features.eyebrow': 'ليه Ironclad OS',
  'features.title': 'ستة أقفال. مفيش أبواب ورا.',
  'features.lead': 'ظبط قواعدك مرة واحدة، اقفلها، وارجّع تركيزك.',
  'features.tag': 'دايم',
  'features.survives.title': 'بيفضل بعد ضبط المصنع',
  'features.survives.body':
    'مفروض على مستوى الجهاز والنظام. مسح الموبايل أو ضبطه مش هيشيل القفل — الحاجة الوحيدة اللي هتخلصك منه إنك تشتري موبايل جديد.',
  'features.porn.title': 'قفل قوي للإباحية والمحتوى للكبار',
  'features.porn.body':
    'حظر على مستوى النظام بيشيل مواقع الكبار والمحتوى الصريح بشكل دايم ومن غير أي تجاوز.',
  'features.social.title': 'قفل كامل للسوشيال ميديا',
  'features.social.body':
    'بيقفل منصات السوشيال المشتتة وخلاصات الفيديو القصيرة على مستوى النظام، فمش هتقدر تسطبها تاني ولا تلتف عليها.',
  'features.allowlist.title': 'قائمة تطبيقات صارمة (قفل الكشك)',
  'features.allowlist.body':
    'بيحصر الموبايل في التطبيقات والأدوات اللي توافق عليها بس، فيبقى الموبايل أداة نافعة على الآخر.',
  'features.tamper.title': 'صعب تتجاوزه أو تعبث فيه',
  'features.tamper.body':
    'بيمنع شيل التطبيق، أو تعطيل صلاحيات مدير/مالك الجهاز، أو تسطيب تطبيقات مقفولة، أو الهروب من الوضع الآمن.',
  'features.willpower.title': 'مش محتاج إرادة',
  'features.willpower.body':
    'ظبط قواعدك مرة واحدة واقفلها. بعد ما يشتغل مفيش زرار إيقاف ولا لحظة ضعف تعدي منها.',

  'notice.title': 'خد بالك',
  'notice.body':
    'Ironclad OS دايم بالتصميم. اتأكد إنك جاهز قبل ما تسطّبه — حتى ضبط المصنع مش هيرجّع موبايلك.',

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
