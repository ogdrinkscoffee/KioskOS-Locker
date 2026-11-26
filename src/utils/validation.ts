import { z } from 'zod';
import {
  AllowedAppConfig,
  DEFAULT_ADMIN_RESTRICTIONS,
  DEFAULT_BLOCKER_SHIELDS,
  DEFAULT_DOWNTIME_SCHEDULE,
  DEFAULT_HARDWARE_LOCKS,
  MAX_ADMIN_PIN_LENGTH,
  MAX_DAILY_APP_LIMIT_MINUTES,
  MIN_ADMIN_PIN_LENGTH,
  syncAllowedAppsMap,
} from './kioskEngine';
import type { KioskState } from './kioskEngine';
import type { SelfImprovementState } from './selfImprovementEngine';

const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function stripControlChars(input: string): string {
  return input.replace(CONTROL_CHARS_RE, '');
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ALLOWED_RICH_TAGS = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'br',
  'hr',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'del',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'span',
  'div',
  'input',
  'a',
]);

const VOID_TAGS = new Set(['br', 'hr', 'input']);

const DANGEROUS_BLOCK_TAG_RE =
  /<(script|style|iframe|object|embed|svg|math|noscript|template|textarea|title|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const DANGEROUS_SINGLE_TAG_RE =
  /<\/?(script|style|iframe|object|embed|svg|math|noscript|template|textarea|title|form|base|meta|link|img)\b[^>]*\/?>/gi;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

function extractSafeHref(attrs: string): string | null {
  const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(attrs);
  if (!match) return null;
  const raw = stripControlChars((match[1] ?? match[2] ?? match[3] ?? '').trim());
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Strips executable HTML tags, event handlers, inline styles, and unsafe URI schemes
 * while preserving clean Notion-style formatting, checklists, and tables.
 */
export function sanitizeRichHtml(rawHtml: string, maxLength = 50_000): string {
  if (typeof rawHtml !== 'string') return '';
  let cleaned = stripControlChars(rawHtml).slice(0, maxLength);
  cleaned = cleaned.replace(HTML_COMMENT_RE, '');

  // Strip dangerous container elements iteratively to prevent nested-tag reconstruction
  let prev = '';
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned.replace(DANGEROUS_BLOCK_TAG_RE, '');
  }
  cleaned = cleaned.replace(DANGEROUS_SINGLE_TAG_RE, '');

  return cleaned.replace(/<(\/?)([a-zA-Z0-9-]+)([^>]*)>/g, (_full, slash: string, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_RICH_TAGS.has(tag)) {
      return '';
    }
    if (slash) {
      return VOID_TAGS.has(tag) ? '' : `</${tag}>`;
    }
    if (tag === 'input') {
      const isCheckbox = /\btype\s*=\s*(?:"checkbox"|'checkbox'|checkbox)/i.test(attrs);
      if (!isCheckbox) return '';
      const isChecked = /\bchecked(?:\s*=|\s|$)/i.test(attrs);
      return isChecked ? '<input type="checkbox" checked>' : '<input type="checkbox">';
    }
    if (tag === 'a') {
      const safeHref = extractSafeHref(attrs);
      return safeHref
        ? `<a href="${escapeHtml(safeHref)}" rel="noopener noreferrer">`
        : '<a>';
    }
    return `<${tag}>`;
  });
}

// ---------- Backend AI Daily Prompt Schemas ----------

export const dailyPromptGoalSchema = z.object({
  title: z.string().trim().min(1).max(140).transform(stripControlChars),
  category: z.string().trim().min(1).max(40).transform(stripControlChars),
  progressPercent: z.coerce.number().finite().min(0).max(100).catch(0),
  targetDate: z.string().trim().max(30).transform(stripControlChars).catch('Ongoing'),
  whyItMatters: z.string().trim().max(400).transform(stripControlChars).optional(),
});

export const dailyPromptRequestSchema = z.object({
  cleanStreakDays: z.coerce.number().int().min(0).max(36500).default(0),
  longestCleanStreakDays: z.coerce.number().int().min(0).max(36500).default(0),
  urgeVictories: z.coerce.number().int().min(0).max(1_000_000).default(0),
  todayHabitPercent: z.coerce.number().finite().min(0).max(100).default(0),
  habitsCompletedToday: z.coerce.number().int().min(0).max(200).default(0),
  habitsTotal: z.coerce.number().int().min(0).max(200).default(0),
  focusSessionsToday: z.coerce.number().int().min(0).max(200).default(0),
  focusMinutesToday: z.coerce.number().int().min(0).max(1440).default(0),
  goals: z.array(dailyPromptGoalSchema).max(6).default([]),
  whyIStarted: z.string().trim().max(2000).transform(stripControlChars).default(''),
  recentNoteTitles: z
    .array(z.string().trim().min(1).max(120).transform(stripControlChars))
    .max(5)
    .default([]),
});

export type ValidatedDailyPromptRequest = z.infer<typeof dailyPromptRequestSchema>;

export const dailyPromptResponseSchema = z.object({
  question: z.string().trim().min(1).max(600).transform(stripControlChars),
  focusTheme: z.string().trim().min(1).max(80).transform(stripControlChars).default('Daily Reflection'),
  goalReferenced: z.string().trim().min(1).max(120).transform(stripControlChars).default('Current clean streak'),
  writingStarter: z.string().trim().min(1).max(300).transform(stripControlChars).default('Today I noticed that...'),
});

// ---------- Form Input Validation Schemas ----------

export const habitFormSchema = z.object({
  title: z.string().trim().min(1, 'Enter a habit title.').max(100, 'Habit title must be 100 characters or fewer.'),
  category: z.enum(['Recovery', 'Focus', 'Health', 'Discipline']),
});

export const taskFormSchema = z.object({
  title: z.string().trim().min(1, 'Enter a task title.').max(140, 'Task title must be 140 characters or fewer.'),
  priority: z.enum(['High', 'Medium', 'Low']),
  dueTime: z
    .string()
    .trim()
    .refine((v) => v === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), 'Enter a valid 24h time (HH:MM).'),
});

export const goalFormSchema = z.object({
  title: z.string().trim().min(1, 'Enter a goal title.').max(140, 'Goal title must be 140 characters or fewer.'),
  category: z.enum(['Recovery', 'Fitness', 'Career & Study', 'Mindset']),
  targetDate: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || v === 'Ongoing' || /^\d{4}-\d{2}-\d{2}$/.test(v),
      'Target date must be YYYY-MM-DD.'
    ),
  whyItMatters: z.string().trim().max(500, 'Reason must be 500 characters or fewer.'),
  milestones: z.array(z.string().trim().min(1).max(140)).max(20),
});

export const milestoneFormSchema = z.object({
  title: z.string().trim().min(1, 'Enter a milestone.').max(140, 'Milestone must be 140 characters or fewer.'),
});

export const customAppFormSchema = z.object({
  label: z.string().trim().min(1, 'Enter an app name.').max(60, 'App name must be 60 characters or fewer.'),
  packageName: z
    .string()
    .trim()
    .max(160, 'Package ID is too long.')
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/, 'Use a valid Android package ID (e.g., com.amazon.kindle).'),
});

export const kioskTitleSchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty.').max(80, 'Title must be 80 characters or fewer.'),
});

export const downtimeHoursSchema = z.object({
  startHour: z.coerce.number().int().min(0, 'Hour must be 0–23.').max(23, 'Hour must be 0–23.'),
  endHour: z.coerce.number().int().min(0, 'Hour must be 0–23.').max(23, 'Hour must be 0–23.'),
});

export const adminPinValueSchema = z
  .string()
  .min(MIN_ADMIN_PIN_LENGTH, `Passcode must be ${MIN_ADMIN_PIN_LENGTH}–${MAX_ADMIN_PIN_LENGTH} characters.`)
  .max(MAX_ADMIN_PIN_LENGTH, `Passcode must be ${MIN_ADMIN_PIN_LENGTH}–${MAX_ADMIN_PIN_LENGTH} characters.`)
  .refine((v) => v.trim().length > 0, 'Passcode cannot be only spaces.')
  // eslint-disable-next-line no-control-regex
  .refine((v) => !/[\u0000-\u001F\u007F]/.test(v), 'Passcode contains unsupported control characters.');

export const browserUrlSchema = z
  .string()
  .trim()
  .min(1, 'Enter a domain or URL.')
  .max(1024, 'URL is too long.')
  .refine((raw) => {
    const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(raw);
    if (!schemeMatch) return true; // host-only input gets https:// prefixed
    const scheme = schemeMatch[1].toLowerCase();
    return scheme === 'https' || scheme === 'http';
  }, 'Only http:// and https:// URLs are permitted in Kiosk Browser.');

export const quickDiaryFormSchema = z.object({
  title: z.string().trim().max(120, 'Title must be 120 characters or fewer.'),
  body: z.string().trim().min(1, 'Write a reflection before saving.').max(5000, 'Entry is too long (max 5000 chars).'),
});

// ---------- Persistence & Cloud Hydration Schemas ----------

const isoDateStringSchema = z.string().trim().max(20).transform(stripControlChars);

export const focusSessionSchema = z.object({
  id: z.string().trim().min(1).max(80).transform(stripControlChars),
  date: isoDateStringSchema,
  minutes: z.coerce.number().int().min(1).max(1440).catch(25),
  label: z.string().trim().min(1).max(140).transform(stripControlChars).catch('Deep Focus Session'),
  completedAt: z.string().trim().max(20).transform(stripControlChars).catch('00:00'),
});

export const habitItemSchema = z.object({
  id: z.string().trim().min(1).max(80).transform(stripControlChars),
  title: z.string().trim().min(1).max(120).transform(stripControlChars),
  category: z.enum(['Recovery', 'Focus', 'Health', 'Discipline']).catch('Recovery'),
  completedDates: z.array(isoDateStringSchema).max(400).catch([]),
});

export const taskItemSchema = z.object({
  id: z.string().trim().min(1).max(80).transform(stripControlChars),
  title: z.string().trim().min(1).max(160).transform(stripControlChars),
  priority: z.enum(['High', 'Medium', 'Low']).catch('Medium'),
  category: z.string().trim().max(60).transform(stripControlChars).catch('Focus'),
  dueTime: z.string().trim().max(20).transform(stripControlChars).catch(''),
  completed: z.coerce.boolean().catch(false),
});

export const goalMilestoneSchema = z.object({
  id: z.string().trim().min(1).max(80).transform(stripControlChars),
  title: z.string().trim().min(1).max(160).transform(stripControlChars),
  done: z.coerce.boolean().catch(false),
});

export const goalItemSchema = z.object({
  id: z.string().trim().min(1).max(80).transform(stripControlChars),
  title: z.string().trim().min(1).max(160).transform(stripControlChars),
  category: z.enum(['Recovery', 'Fitness', 'Career & Study', 'Mindset']).catch('Recovery'),
  targetDate: z.string().trim().max(30).transform(stripControlChars).catch('Ongoing'),
  whyItMatters: z.string().trim().max(600).transform(stripControlChars).catch(''),
  milestones: z.array(goalMilestoneSchema).max(30).catch([]),
});

export const richNoteSchema = z.object({
  id: z.string().trim().min(1).max(80).transform(stripControlChars),
  title: z.string().trim().min(1).max(160).transform(stripControlChars).catch('Untitled Entry'),
  notebook: z.enum(['Diary', 'Goals & Vision', 'Urge Reflection', 'Notes']).catch('Diary'),
  fontFamily: z.enum(['sans', 'serif', 'mono']).catch('sans'),
  fontSize: z.enum(['sm', 'base', 'lg', 'xl']).catch('base'),
  htmlContent: z
    .string()
    .max(50_000)
    .transform((html) => sanitizeRichHtml(html))
    .catch('<p></p>'),
  pinned: z.coerce.boolean().catch(false),
  updatedAt: isoDateStringSchema.catch(''),
});

export function parseSelfImprovementPayload(
  raw: unknown,
  fallback: SelfImprovementState
): SelfImprovementState {
  if (!raw || typeof raw !== 'object') return fallback;
  const obj = raw as Record<string, unknown>;
  const safeArray = <T>(val: unknown, itemSchema: z.ZodType<T>, limit: number, defaultVal: T[]): T[] => {
    if (!Array.isArray(val)) return defaultVal;
    const out: T[] = [];
    for (const item of val) {
      if (out.length >= limit) break;
      const parsed = itemSchema.safeParse(item);
      if (parsed.success) out.push(parsed.data);
    }
    return out;
  };

  const cleanStreak = z.coerce.number().int().min(0).max(36500).safeParse(obj.cleanStreakDays);
  const longestStreak = z.coerce.number().int().min(0).max(36500).safeParse(obj.longestCleanStreakDays);
  const urgeVictories = z.coerce.number().int().min(0).max(1_000_000).safeParse(obj.urgeVictories);
  const whyStarted = z.string().max(2000).transform(stripControlChars).safeParse(obj.whyIStarted);
  const lastCheckIn = z.string().trim().max(20).transform(stripControlChars).safeParse(obj.lastCleanCheckInDate);

  const checkInDates = Array.isArray(obj.cleanCheckInDates)
    ? Array.from(
        new Set(
          obj.cleanCheckInDates
            .filter((d): d is string => typeof d === 'string')
            .map((d) => stripControlChars(d).trim().slice(0, 20))
            .filter(Boolean)
        )
      ).slice(0, 400)
    : fallback.cleanCheckInDates;

  return {
    cleanStreakDays: cleanStreak.success ? cleanStreak.data : fallback.cleanStreakDays,
    longestCleanStreakDays: longestStreak.success ? longestStreak.data : fallback.longestCleanStreakDays,
    lastCleanCheckInDate:
      obj.lastCleanCheckInDate === null
        ? null
        : lastCheckIn.success && lastCheckIn.data
        ? lastCheckIn.data
        : fallback.lastCleanCheckInDate,
    cleanCheckInDates: checkInDates.length > 0 ? checkInDates : fallback.cleanCheckInDates,
    urgeVictories: urgeVictories.success ? urgeVictories.data : fallback.urgeVictories,
    whyIStarted: whyStarted.success ? whyStarted.data : fallback.whyIStarted,
    focusSessions: safeArray(obj.focusSessions, focusSessionSchema, 200, fallback.focusSessions),
    habits: safeArray(obj.habits, habitItemSchema, 80, fallback.habits),
    tasks: safeArray(obj.tasks, taskItemSchema, 150, fallback.tasks),
    goals: safeArray(obj.goals, goalItemSchema, 50, fallback.goals),
    notes: safeArray(obj.notes, richNoteSchema, 100, fallback.notes),
  };
}

const simulatedAppSchema = z.object({
  packageName: z.string().trim().min(1).max(160).transform(stripControlChars),
  label: z.string().trim().min(1).max(80).transform(stripControlChars),
  category: z.enum(['Focus', 'Enterprise', 'Utility', 'System']).catch('Utility'),
  isSystemRestricted: z.coerce.boolean().catch(false),
  isUnsupportedBrowser: z.coerce.boolean().optional(),
  description: z.string().max(300).transform(stripControlChars).catch(''),
});

const policyEventSchema = z.object({
  id: z.string().trim().min(1).max(80).transform(stripControlChars),
  timestamp: z.string().trim().max(30).transform(stripControlChars),
  apiCall: z.string().trim().max(240).transform(stripControlChars),
  detail: z.string().trim().max(400).transform(stripControlChars),
  outcome: z.enum(['enforced', 'blocked', 'allowed', 'info']).catch('info'),
});

function sanitizeStringArray(raw: unknown, maxItems: number, maxLen: number, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  return Array.from(
    new Set(
      raw
        .filter((item): item is string => typeof item === 'string')
        .map((s) => stripControlChars(s).trim().slice(0, maxLen))
        .filter(Boolean)
    )
  ).slice(0, maxItems);
}

function sanitizeNumberRecord(raw: unknown, maxValue: number, maxKeys = 100): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= maxKeys) break;
    const cleanKey = stripControlChars(k).trim();
    const num = Number(v);
    if (cleanKey.length > 0 && cleanKey.length <= 160 && Number.isFinite(num) && num >= 0) {
      out[cleanKey] = Math.min(maxValue, Math.round(num));
    }
  }
  return out;
}

function sanitizeAllowedAppsRecord(
  raw: unknown,
  allowedPackages: string[],
  fallback?: Record<string, AllowedAppConfig>
): Record<string, AllowedAppConfig> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return syncAllowedAppsMap(allowedPackages, fallback);
  }
  const source = raw as Record<string, unknown>;
  const parsed: Record<string, AllowedAppConfig> = {};
  for (const pkg of allowedPackages) {
    const entry = source[pkg];
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const protectedFlag = (entry as Record<string, unknown>).passwordProtected;
      parsed[pkg] = {
        passwordProtected:
          typeof protectedFlag === 'boolean'
            ? protectedFlag
            : Boolean(fallback?.[pkg]?.passwordProtected),
      };
    } else {
      parsed[pkg] = {
        passwordProtected: Boolean(fallback?.[pkg]?.passwordProtected),
      };
    }
  }
  return parsed;
}

export function parseStoredKioskPayload(raw: unknown, fallback: KioskState): KioskState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  const obj = raw as Record<string, unknown>;

  const arRaw = (obj.adminRestrictions ?? {}) as Record<string, unknown>;
  const hwRaw = (obj.hardwareLocks ?? {}) as Record<string, unknown>;
  const bsRaw = (obj.blockerShields ?? {}) as Record<string, unknown>;
  const dsRaw = (obj.downtimeSchedule ?? {}) as Record<string, unknown>;

  const kioskModeParsed = z.enum(['multi_app', 'single_app', 'kiosk_browser']).safeParse(obj.kioskMode);
  const screenParsed = z
    .enum([
      'home',
      'app_lock_task',
      'self_improvement',
      'kiosk_browser',
      'pin_gate',
      'admin_settings',
      'android_settings',
      'rebooting',
    ])
    .safeParse(obj.activeScreen);
  const pinParsed = adminPinValueSchema.safeParse(obj.adminPin);
  const titleParsed = kioskTitleSchema.shape.title.safeParse(obj.kioskTitle);

  const customApps: KioskState['customApps'] = [];
  if (Array.isArray(obj.customApps)) {
    for (const item of obj.customApps) {
      if (customApps.length >= 60) break;
      const p = simulatedAppSchema.safeParse(item);
      if (p.success) customApps.push(p.data);
    }
  }

  const events: KioskState['events'] = [];
  if (Array.isArray(obj.events)) {
    for (const item of obj.events) {
      if (events.length >= 36) break;
      const p = policyEventSchema.safeParse(item);
      if (p.success) events.push(p.data);
    }
  }

  const allowedDomains = sanitizeStringArray(obj.allowedDomains, 120, 160, fallback.allowedDomains);
  const allowedPackages = sanitizeStringArray(
    obj.allowedPackages,
    120,
    160,
    fallback.allowedPackages
  );
  const allowedApps = sanitizeAllowedAppsRecord(
    obj.allowedApps,
    allowedPackages,
    fallback.allowedApps
  );

  return {
    ...fallback,
    isDeviceOwner: typeof obj.isDeviceOwner === 'boolean' ? obj.isDeviceOwner : fallback.isDeviceOwner,
    adminPin: pinParsed.success ? pinParsed.data : fallback.adminPin,
    failedPinAttempts: z.coerce.number().int().min(0).max(1000).catch(0).parse(obj.failedPinAttempts),
    pinLockedUntilMs: z.coerce.number().int().min(0).catch(0).parse(obj.pinLockedUntilMs),
    kioskMode: kioskModeParsed.success ? kioskModeParsed.data : fallback.kioskMode,
    singleAppPackage:
      typeof obj.singleAppPackage === 'string'
        ? stripControlChars(obj.singleAppPackage).trim().slice(0, 160) || null
        : fallback.singleAppPackage,
    kioskTitle: titleParsed.success ? titleParsed.data : fallback.kioskTitle,
    adminRestrictions: {
      DISALLOW_SAFE_BOOT:
        typeof arRaw.DISALLOW_SAFE_BOOT === 'boolean'
          ? arRaw.DISALLOW_SAFE_BOOT
          : DEFAULT_ADMIN_RESTRICTIONS.DISALLOW_SAFE_BOOT,
      DISALLOW_FACTORY_RESET:
        typeof arRaw.DISALLOW_FACTORY_RESET === 'boolean'
          ? arRaw.DISALLOW_FACTORY_RESET
          : DEFAULT_ADMIN_RESTRICTIONS.DISALLOW_FACTORY_RESET,
      DISALLOW_ADD_USER:
        typeof arRaw.DISALLOW_ADD_USER === 'boolean'
          ? arRaw.DISALLOW_ADD_USER
          : DEFAULT_ADMIN_RESTRICTIONS.DISALLOW_ADD_USER,
      DISALLOW_APPS_CONTROL:
        typeof arRaw.DISALLOW_APPS_CONTROL === 'boolean'
          ? arRaw.DISALLOW_APPS_CONTROL
          : DEFAULT_ADMIN_RESTRICTIONS.DISALLOW_APPS_CONTROL,
    },
    hardwareLocks: {
      statusBarDisabled:
        typeof hwRaw.statusBarDisabled === 'boolean'
          ? hwRaw.statusBarDisabled
          : DEFAULT_HARDWARE_LOCKS.statusBarDisabled,
      keyguardDisabled:
        typeof hwRaw.keyguardDisabled === 'boolean'
          ? hwRaw.keyguardDisabled
          : DEFAULT_HARDWARE_LOCKS.keyguardDisabled,
      cameraDisabled:
        typeof hwRaw.cameraDisabled === 'boolean'
          ? hwRaw.cameraDisabled
          : DEFAULT_HARDWARE_LOCKS.cameraDisabled,
      usbTransferBlocked:
        typeof hwRaw.usbTransferBlocked === 'boolean'
          ? hwRaw.usbTransferBlocked
          : DEFAULT_HARDWARE_LOCKS.usbTransferBlocked,
      dateTimeLocked:
        typeof hwRaw.dateTimeLocked === 'boolean'
          ? hwRaw.dateTimeLocked
          : DEFAULT_HARDWARE_LOCKS.dateTimeLocked,
      screenCaptureDisabled:
        typeof hwRaw.screenCaptureDisabled === 'boolean'
          ? hwRaw.screenCaptureDisabled
          : DEFAULT_HARDWARE_LOCKS.screenCaptureDisabled,
      keepScreenAwake:
        typeof hwRaw.keepScreenAwake === 'boolean'
          ? hwRaw.keepScreenAwake
          : DEFAULT_HARDWARE_LOCKS.keepScreenAwake,
    },
    blockerShields: {
      disablePornOnBrowsers:
        typeof bsRaw.disablePornOnBrowsers === 'boolean'
          ? bsRaw.disablePornOnBrowsers
          : DEFAULT_BLOCKER_SHIELDS.disablePornOnBrowsers,
      blockInAppBrowsers:
        typeof bsRaw.blockInAppBrowsers === 'boolean'
          ? bsRaw.blockInAppBrowsers
          : DEFAULT_BLOCKER_SHIELDS.blockInAppBrowsers,
      inAppBrowserWhitelist: sanitizeStringArray(
        bsRaw.inAppBrowserWhitelist,
        60,
        160,
        DEFAULT_BLOCKER_SHIELDS.inAppBrowserWhitelist
      ),
      blockUnsupportedBrowsers:
        typeof bsRaw.blockUnsupportedBrowsers === 'boolean'
          ? bsRaw.blockUnsupportedBrowsers
          : DEFAULT_BLOCKER_SHIELDS.blockUnsupportedBrowsers,
      blockShortFormFeeds:
        typeof bsRaw.blockShortFormFeeds === 'boolean'
          ? bsRaw.blockShortFormFeeds
          : DEFAULT_BLOCKER_SHIELDS.blockShortFormFeeds,
      familyDnsMode: z
        .enum(['cloudflare', 'cleanbrowsing', 'off'])
        .catch(DEFAULT_BLOCKER_SHIELDS.familyDnsMode)
        .parse(bsRaw.familyDnsMode),
      blockedKeywords: sanitizeStringArray(
        bsRaw.blockedKeywords,
        100,
        160,
        DEFAULT_BLOCKER_SHIELDS.blockedKeywords
      ),
      strictShieldLockUntilMs: z.coerce.number().int().min(0).catch(0).parse(bsRaw.strictShieldLockUntilMs),
    },
    appTimeLimits: sanitizeNumberRecord(obj.appTimeLimits, MAX_DAILY_APP_LIMIT_MINUTES, 100),
    appUsageSeconds: sanitizeNumberRecord(obj.appUsageSeconds, 86400, 100),
    usageDateIso:
      typeof obj.usageDateIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.usageDateIso)
        ? obj.usageDateIso
        : fallback.usageDateIso,
    downtimeSchedule: {
      enabled: typeof dsRaw.enabled === 'boolean' ? dsRaw.enabled : DEFAULT_DOWNTIME_SCHEDULE.enabled,
      startHour: z.coerce.number().int().min(0).max(23).catch(DEFAULT_DOWNTIME_SCHEDULE.startHour).parse(dsRaw.startHour),
      endHour: z.coerce.number().int().min(0).max(23).catch(DEFAULT_DOWNTIME_SCHEDULE.endHour).parse(dsRaw.endHour),
      simulateActiveNow:
        typeof dsRaw.simulateActiveNow === 'boolean'
          ? dsRaw.simulateActiveNow
          : DEFAULT_DOWNTIME_SCHEDULE.simulateActiveNow,
    },
    focusBlockUntilMs: z.coerce.number().int().min(0).catch(0).parse(obj.focusBlockUntilMs),
    panicLockUntilMs: z.coerce.number().int().min(0).catch(0).parse(obj.panicLockUntilMs),
    panicCount: z.coerce.number().int().min(0).max(100000).catch(0).parse(obj.panicCount),
    lastClipboardWipedAt:
      typeof obj.lastClipboardWipedAt === 'string'
        ? stripControlChars(obj.lastClipboardWipedAt).slice(0, 30)
        : null,
    blockedAttemptsToday: z.coerce.number().int().min(0).max(100000).catch(0).parse(obj.blockedAttemptsToday),
    distrustScore: z.coerce.number().int().min(0).max(200).catch(0).parse(obj.distrustScore),
    tamperEscalationTier:
      obj.tamperEscalationTier === 1 || obj.tamperEscalationTier === 2 ? obj.tamperEscalationTier : 0,
    adminToggleTimestampsMs: Array.isArray(obj.adminToggleTimestampsMs)
      ? obj.adminToggleTimestampsMs.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)).slice(0, 50)
      : [],
    bypassAttemptTimestampsMs: Array.isArray(obj.bypassAttemptTimestampsMs)
      ? obj.bypassAttemptTimestampsMs.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)).slice(0, 50)
      : [],
    tamperWarningsCount: z.coerce.number().int().min(0).max(100000).catch(0).parse(obj.tamperWarningsCount),
    allowedDomains: allowedDomains.length > 0 ? allowedDomains : fallback.allowedDomains,
    browserCurrentUrl:
      typeof obj.browserCurrentUrl === 'string' && browserUrlSchema.safeParse(obj.browserCurrentUrl).success
        ? obj.browserCurrentUrl.slice(0, 1024)
        : fallback.browserCurrentUrl,
    browserBlockedUrl: null,
    customApps,
    allowedPackages,
    allowedApps,
    adminUnlocked: typeof obj.adminUnlocked === 'boolean' ? obj.adminUnlocked : false,
    activeScreen:
      screenParsed.success && screenParsed.data !== 'rebooting' ? screenParsed.data : 'home',
    activeAppPackage:
      typeof obj.activeAppPackage === 'string'
        ? stripControlChars(obj.activeAppPackage).trim().slice(0, 160) || null
        : null,
    lockTaskActive: typeof obj.lockTaskActive === 'boolean' ? obj.lockTaskActive : fallback.lockTaskActive,
    pinGateTarget: null,
    blockedNotice: null,
    orientation: obj.orientation === 'landscape' ? 'landscape' : 'portrait',
    fontScale: obj.fontScale === '1.15x' ? '1.15x' : '1.0x',
    rebootCount: z.coerce.number().int().min(0).max(100000).catch(0).parse(obj.rebootCount),
    events: events.length > 0 ? events : fallback.events,
  };
}
