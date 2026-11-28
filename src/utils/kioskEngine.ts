export type RestrictionKey =
  | 'DISALLOW_SAFE_BOOT'
  | 'DISALLOW_FACTORY_RESET'
  | 'DISALLOW_ADD_USER'
  | 'DISALLOW_APPS_CONTROL';

export type ExtendedPolicyKey =
  | 'DISALLOW_USB_FILE_TRANSFER'
  | 'DISALLOW_MOUNT_PHYSICAL_MEDIA'
  | 'DISALLOW_CONFIG_DATE_TIME'
  | 'SET_STATUS_BAR_DISABLED'
  | 'SET_CAMERA_DISABLED'
  | 'SET_KEYGUARD_DISABLED'
  | 'SET_SCREEN_CAPTURE_DISABLED'
  | 'KEEP_SCREEN_AWAKE';

export type HardwareLockPolicyKey =
  | 'statusBarDisabled'
  | 'keyguardDisabled'
  | 'cameraDisabled'
  | 'usbTransferBlocked'
  | 'dateTimeLocked'
  | 'screenCaptureDisabled'
  | 'keepScreenAwake';

export interface HardwareLockPolicies {
  statusBarDisabled: boolean;
  keyguardDisabled: boolean;
  cameraDisabled: boolean;
  usbTransferBlocked: boolean;
  dateTimeLocked: boolean;
  screenCaptureDisabled: boolean;
  keepScreenAwake: boolean;
}

export type FamilyDnsMode = 'cloudflare' | 'cleanbrowsing' | 'off';

export type BlockerShieldToggleKey =
  | 'disablePornOnBrowsers'
  | 'blockInAppBrowsers'
  | 'blockUnsupportedBrowsers'
  | 'blockShortFormFeeds';

export interface BlockerShieldPolicies {
  disablePornOnBrowsers: boolean;
  blockInAppBrowsers: boolean;
  inAppBrowserWhitelist: string[];
  blockUnsupportedBrowsers: boolean;
  blockShortFormFeeds: boolean;
  familyDnsMode: FamilyDnsMode;
  blockedKeywords: string[];
  strictShieldLockUntilMs: number;
}

export type KioskOperationMode = 'multi_app' | 'single_app' | 'kiosk_browser';

export interface SimulatedAndroidApp {
  packageName: string;
  label: string;
  category: 'Focus' | 'Enterprise' | 'Utility' | 'System';
  isSystemRestricted: boolean;
  isUnsupportedBrowser?: boolean;
  description: string;
}

export interface AllowedAppConfig {
  passwordProtected: boolean;
}

export type KioskScreen =
  | 'home'
  | 'app_lock_task'
  | 'self_improvement'
  | 'kiosk_browser'
  | 'pin_gate'
  | 'admin_settings'
  | 'android_settings'
  | 'rebooting';

export type PinGateTarget = 'admin_settings' | 'exit_lock_task' | 'unlock_system';

export interface PolicyEvent {
  id: string;
  timestamp: string;
  apiCall: string;
  detail: string;
  outcome: 'enforced' | 'blocked' | 'allowed' | 'info';
}

export interface DowntimeSchedule {
  enabled: boolean;
  startHour: number;
  endHour: number;
  simulateActiveNow: boolean;
}

export interface KioskState {
  isDeviceOwner: boolean;
  adminPin: string;
  failedPinAttempts: number;
  pinLockedUntilMs: number;
  kioskMode: KioskOperationMode;
  singleAppPackage: string | null;
  kioskTitle: string;
  adminRestrictions: Record<RestrictionKey, boolean>;
  hardwareLocks: HardwareLockPolicies;
  blockerShields: BlockerShieldPolicies;
  appTimeLimits: Record<string, number>;
  appUsageSeconds: Record<string, number>;
  usageDateIso: string;
  downtimeSchedule: DowntimeSchedule;
  focusBlockUntilMs: number;
  panicLockUntilMs: number;
  panicCount: number;
  lastClipboardWipedAt: string | null;
  blockedAttemptsToday: number;
  distrustScore: number;
  tamperEscalationTier: 0 | 1 | 2;
  adminToggleTimestampsMs: number[];
  bypassAttemptTimestampsMs: number[];
  tamperWarningsCount: number;
  allowedDomains: string[];
  browserCurrentUrl: string;
  browserBlockedUrl: string | null;
  customApps: SimulatedAndroidApp[];
  allowedPackages: string[];
  allowedApps: Record<string, AllowedAppConfig>;
  adminUnlocked: boolean;
  activeScreen: KioskScreen;
  activeAppPackage: string | null;
  lockTaskActive: boolean;
  pinGateTarget: PinGateTarget | null;
  blockedNotice: string | null;
  orientation: 'portrait' | 'landscape';
  fontScale: '1.0x' | '1.15x';
  rebootCount: number;
  events: PolicyEvent[];
}

export const DEFAULT_KIOSK_PIN = '1234';
export const MIN_ADMIN_PIN_LENGTH = 4;
export const MAX_ADMIN_PIN_LENGTH = 50;
export const MAX_FAILED_PIN_ATTEMPTS = 5;
export const PIN_LOCKOUT_DURATION_MS = 30_000;

export const TAMPER_WINDOW_MS = 15_000;
export const RAPID_ADMIN_TOGGLE_THRESHOLD = 4;
export const RAPID_BYPASS_SURGE_THRESHOLD = 3;
export const DISTRUST_TIER1_THRESHOLD = 40;
export const DISTRUST_TIER2_THRESHOLD = 70;
export const TIER1_EXTRA_LOCKOUT_SECONDS = 90;
export const TIER2_EXTRA_LOCKOUT_SECONDS = 300;

export const SELF_IMPROVEMENT_PACKAGE = 'com.kiosk.selfimprovement';
export const KIOSK_BROWSER_PACKAGE = 'com.kiosk.browser';
export const MAX_DAILY_APP_LIMIT_MINUTES = 480;
export const PANIC_RECOVERY_MINUTES = 15;

export const ESSENTIAL_FOCUS_PACKAGES = new Set([
  'com.kiosk.launcher',
  SELF_IMPROVEMENT_PACKAGE,
  'com.android.calculator2',
]);

export const PANIC_EXEMPT_PACKAGES = new Set([
  'com.kiosk.launcher',
  SELF_IMPROVEMENT_PACKAGE,
]);

export const DEFAULT_DOWNTIME_SCHEDULE: DowntimeSchedule = {
  enabled: false,
  startHour: 22,
  endHour: 6,
  simulateActiveNow: false,
};

export const UNSUPPORTED_BROWSER_PACKAGES = new Set([
  'org.mozilla.firefox',
  'com.opera.browser',
  'com.opera.mini.native',
  'com.brave.browser',
  'com.duckduckgo.mobile.android',
  'com.UCMobile.intl',
  'org.torproject.torbrowser',
  'com.kiwibrowser.browser',
]);

export const DEFAULT_ALLOWED_DOMAINS = [
  'wikipedia.org',
  'developer.android.com',
  'coursera.org',
  'scholar.google.com',
];

export const BLOCKED_DISTRACTION_DOMAINS = [
  'instagram.com',
  'tiktok.com',
  'facebook.com',
  'x.com',
  'twitter.com',
  'reddit.com',
  'youtube.com',
  'pornhub.com',
  'xvideos.com',
  'xnxx.com',
  'onlyfans.com',
  'twitch.tv',
  'chaturbate.com',
  'redtube.com',
  'youporn.com',
];

export const DEFAULT_BLOCKED_KEYWORDS = [
  'porn',
  'xxx',
  'nsfw',
  'onlyfans',
  'hentai',
  'xvideos',
  'xnxx',
  'brazzers',
];

export const DEFAULT_IN_APP_BROWSER_WHITELIST = [
  'com.kiosk.launcher',
  'com.google.android.apps.docs',
  'com.Slack',
];

export const DEFAULT_ADMIN_RESTRICTIONS: Record<RestrictionKey, boolean> = {
  DISALLOW_SAFE_BOOT: true,
  DISALLOW_FACTORY_RESET: true,
  DISALLOW_ADD_USER: true,
  DISALLOW_APPS_CONTROL: true,
};

export const DEFAULT_HARDWARE_LOCKS: HardwareLockPolicies = {
  statusBarDisabled: true,
  keyguardDisabled: false,
  cameraDisabled: false,
  usbTransferBlocked: true,
  dateTimeLocked: true,
  screenCaptureDisabled: false,
  keepScreenAwake: true,
};

export const DEFAULT_BLOCKER_SHIELDS: BlockerShieldPolicies = {
  disablePornOnBrowsers: true,
  blockInAppBrowsers: true,
  inAppBrowserWhitelist: [...DEFAULT_IN_APP_BROWSER_WHITELIST],
  blockUnsupportedBrowsers: true,
  blockShortFormFeeds: true,
  familyDnsMode: 'cloudflare',
  blockedKeywords: [...DEFAULT_BLOCKED_KEYWORDS],
  strictShieldLockUntilMs: 0,
};

export const INSTALLED_APPS: SimulatedAndroidApp[] = [
  {
    packageName: SELF_IMPROVEMENT_PACKAGE,
    label: 'Focus & Growth',
    category: 'Focus',
    isSystemRestricted: false,
    description:
      'Integrated self-improvement hub: rich Notion-style notes & diary, habit tracker, task tracker, goal setter, and clean streak anchor.',
  },
  {
    packageName: KIOSK_BROWSER_PACKAGE,
    label: 'Kiosk Browser',
    category: 'Focus',
    isSystemRestricted: false,
    description:
      'Locked WebView browser enforcing domain allowlisting, keyword filtering, Shorts/Reels blocking, and file download blocking.',
  },
  {
    packageName: 'com.enterprise.pos',
    label: 'Retail POS',
    category: 'Enterprise',
    isSystemRestricted: false,
    description: 'Point-of-sale checkout terminal running in pinned LockTask mode.',
  },
  {
    packageName: 'com.enterprise.checkin',
    label: 'Visitor Check-In',
    category: 'Enterprise',
    isSystemRestricted: false,
    description: 'Lobby badge registration & guest directory.',
  },
  {
    packageName: 'com.enterprise.scanner',
    label: 'Inventory Scan',
    category: 'Enterprise',
    isSystemRestricted: false,
    description: 'Warehouse barcode & pallet audit utility.',
  },
  {
    packageName: 'com.enterprise.catalog',
    label: 'Product Catalog',
    category: 'Enterprise',
    isSystemRestricted: false,
    description: 'Interactive showroom catalog & spec sheet viewer.',
  },
  {
    packageName: 'com.android.calculator2',
    label: 'Calculator',
    category: 'Utility',
    isSystemRestricted: false,
    description: 'Standard arithmetic utility.',
  },
  {
    packageName: 'com.android.camera2',
    label: 'Camera',
    category: 'Utility',
    isSystemRestricted: false,
    description: 'Device camera capture.',
  },
  {
    packageName: 'org.mozilla.firefox',
    label: 'Firefox Browser',
    category: 'Utility',
    isSystemRestricted: false,
    isUnsupportedBrowser: true,
    description: 'Unmonitored third-party browser blocked by BlockP/BlockerX Unsupported Browser guard.',
  },
  {
    packageName: 'com.duckduckgo.mobile.android',
    label: 'DuckDuckGo Privacy',
    category: 'Utility',
    isSystemRestricted: false,
    isUnsupportedBrowser: true,
    description: 'Private/incognito third-party browser suspended when Unsupported Browser shield is active.',
  },
  {
    packageName: 'com.android.settings',
    label: 'Android Settings',
    category: 'System',
    isSystemRestricted: true,
    description: 'System network, display, security & app management settings.',
  },
  {
    packageName: 'com.google.android.packageinstaller',
    label: 'Package Installer',
    category: 'System',
    isSystemRestricted: true,
    description: 'Handles APK installs and app uninstallation prompts.',
  },
];

export const RESTRICTED_SYSTEM_PACKAGES = new Set([
  'com.android.settings',
  'com.android.packageinstaller',
  'com.google.android.packageinstaller',
  'com.android.vending',
]);

export function getLocalDateIso(nowMs = Date.now()): string {
  const d = new Date(nowMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createInitialKioskState(): KioskState {
  return {
    isDeviceOwner: true,
    adminPin: DEFAULT_KIOSK_PIN,
    failedPinAttempts: 0,
    pinLockedUntilMs: 0,
    kioskMode: 'multi_app',
    singleAppPackage: SELF_IMPROVEMENT_PACKAGE,
    kioskTitle: 'Kiosk Home',
    adminRestrictions: { ...DEFAULT_ADMIN_RESTRICTIONS },
    hardwareLocks: { ...DEFAULT_HARDWARE_LOCKS },
    blockerShields: {
      ...DEFAULT_BLOCKER_SHIELDS,
      inAppBrowserWhitelist: [...DEFAULT_IN_APP_BROWSER_WHITELIST],
      blockedKeywords: [...DEFAULT_BLOCKED_KEYWORDS],
    },
    appTimeLimits: {},
    appUsageSeconds: {},
    usageDateIso: getLocalDateIso(),
    downtimeSchedule: { ...DEFAULT_DOWNTIME_SCHEDULE },
    focusBlockUntilMs: 0,
    panicLockUntilMs: 0,
    panicCount: 0,
    lastClipboardWipedAt: null,
    blockedAttemptsToday: 0,
    distrustScore: 0,
    tamperEscalationTier: 0,
    adminToggleTimestampsMs: [],
    bypassAttemptTimestampsMs: [],
    tamperWarningsCount: 0,
    allowedDomains: [...DEFAULT_ALLOWED_DOMAINS],
    browserCurrentUrl: `https://${DEFAULT_ALLOWED_DOMAINS[0]}`,
    browserBlockedUrl: null,
    customApps: [],
    allowedPackages: [
      SELF_IMPROVEMENT_PACKAGE,
      KIOSK_BROWSER_PACKAGE,
      'com.enterprise.pos',
      'com.enterprise.checkin',
      'com.enterprise.scanner',
    ],
    allowedApps: {
      [SELF_IMPROVEMENT_PACKAGE]: { passwordProtected: false },
      [KIOSK_BROWSER_PACKAGE]: { passwordProtected: false },
      'com.enterprise.pos': { passwordProtected: false },
      'com.enterprise.checkin': { passwordProtected: false },
      'com.enterprise.scanner': { passwordProtected: false },
    },
    adminUnlocked: false,
    activeScreen: 'home',
    activeAppPackage: null,
    lockTaskActive: true,
    pinGateTarget: null,
    blockedNotice: null,
    orientation: 'portrait',
    fontScale: '1.0x',
    rebootCount: 0,
    events: [
      {
        id: 'init-1',
        timestamp: '08:30:00',
        apiCall: 'dpm.isDeviceOwnerApp("com.kiosk.launcher") -> true',
        detail:
          'Enforced DISALLOW_SAFE_BOOT, DISALLOW_FACTORY_RESET, DISALLOW_ADD_USER, DISALLOW_APPS_CONTROL, USB block, Family DNS 1.1.1.3 & SafeSearch/Incognito lock.',
        outcome: 'enforced',
      },
      {
        id: 'init-2',
        timestamp: '08:30:00',
        apiCall: 'dpm.addPersistentPreferredActivity(HOME)',
        detail: 'Pinned KioskLauncherActivity as default HOME launcher.',
        outcome: 'enforced',
      },
    ],
  };
}

export function getAllInstalledApps(state: KioskState): SimulatedAndroidApp[] {
  return [...INSTALLED_APPS, ...(state.customApps ?? [])];
}

export function getEnforcedRestrictions(state: KioskState): Record<RestrictionKey, boolean> {
  if (!state.isDeviceOwner) {
    return {
      DISALLOW_SAFE_BOOT: false,
      DISALLOW_FACTORY_RESET: false,
      DISALLOW_ADD_USER: false,
      DISALLOW_APPS_CONTROL: false,
    };
  }
  const configured = state.adminRestrictions ?? DEFAULT_ADMIN_RESTRICTIONS;
  return {
    DISALLOW_SAFE_BOOT: configured.DISALLOW_SAFE_BOOT,
    DISALLOW_FACTORY_RESET: configured.DISALLOW_FACTORY_RESET,
    DISALLOW_ADD_USER: configured.DISALLOW_ADD_USER,
    DISALLOW_APPS_CONTROL: configured.DISALLOW_APPS_CONTROL && !state.adminUnlocked,
  };
}

export function getExtendedPolicies(state: KioskState): Record<ExtendedPolicyKey, boolean> {
  const hw = state.hardwareLocks ?? DEFAULT_HARDWARE_LOCKS;
  const doActive = state.isDeviceOwner;
  return {
    DISALLOW_USB_FILE_TRANSFER: doActive && hw.usbTransferBlocked,
    DISALLOW_MOUNT_PHYSICAL_MEDIA: doActive && hw.usbTransferBlocked,
    DISALLOW_CONFIG_DATE_TIME: doActive && hw.dateTimeLocked,
    SET_STATUS_BAR_DISABLED: doActive && hw.statusBarDisabled,
    SET_CAMERA_DISABLED: doActive && hw.cameraDisabled,
    SET_KEYGUARD_DISABLED: doActive && hw.keyguardDisabled,
    SET_SCREEN_CAPTURE_DISABLED: doActive && hw.screenCaptureDisabled,
    KEEP_SCREEN_AWAKE: hw.keepScreenAwake,
  };
}

export function isWithinScheduleHours(
  currentHour: number,
  startHour: number,
  endHour: number
): boolean {
  const hour = ((Math.floor(currentHour) % 24) + 24) % 24;
  const start = ((Math.floor(startHour) % 24) + 24) % 24;
  const end = ((Math.floor(endHour) % 24) + 24) % 24;
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function isDowntimeActive(
  state: KioskState,
  currentHour = new Date().getHours()
): boolean {
  const schedule = state.downtimeSchedule ?? DEFAULT_DOWNTIME_SCHEDULE;
  if (!schedule.enabled) return false;
  if (schedule.simulateActiveNow) return true;
  return isWithinScheduleHours(currentHour, schedule.startHour, schedule.endHour);
}

export function getFocusBlockRemainingMinutes(state: KioskState, nowMs = Date.now()): number {
  const diff = (state.focusBlockUntilMs ?? 0) - nowMs;
  return diff > 0 ? Math.ceil(diff / 60_000) : 0;
}

export function getPanicLockRemainingMinutes(state: KioskState, nowMs = Date.now()): number {
  const diff = (state.panicLockUntilMs ?? 0) - nowMs;
  return diff > 0 ? Math.ceil(diff / 60_000) : 0;
}

export function ensureUsageDateCurrent(
  state: KioskState,
  todayIso = getLocalDateIso()
): KioskState {
  if (state.usageDateIso === todayIso) {
    return state;
  }
  return {
    ...state,
    usageDateIso: todayIso,
    appUsageSeconds: {},
    blockedAttemptsToday: 0,
  };
}

export function getAppRemainingSeconds(
  state: KioskState,
  packageName: string,
  todayIso = getLocalDateIso()
): number | null {
  const limitMins = (state.appTimeLimits ?? {})[packageName] ?? 0;
  if (limitMins <= 0) return null;
  const usedSeconds =
    state.usageDateIso === todayIso ? (state.appUsageSeconds ?? {})[packageName] ?? 0 : 0;
  return Math.max(0, limitMins * 60 - usedSeconds);
}

export function getAppScheduleOrLimitBlockReason(
  state: KioskState,
  packageName: string,
  options?: { todayIso?: string; currentHour?: number; nowMs?: number }
): string | null {
  if (state.adminUnlocked) return null;
  const todayIso = options?.todayIso ?? getLocalDateIso(options?.nowMs);
  const nowMs = options?.nowMs ?? Date.now();
  const currentHour = options?.currentHour ?? new Date(nowMs).getHours();

  const panicMinsLeft = getPanicLockRemainingMinutes(state, nowMs);
  if (panicMinsLeft > 0 && !PANIC_EXEMPT_PACKAGES.has(packageName)) {
    return `Locked to Kiosk Dashboard by Emergency Panic Mode (${panicMinsLeft}m remaining).`;
  }

  const limitMins = (state.appTimeLimits ?? {})[packageName] ?? 0;
  const remainingSec = getAppRemainingSeconds(state, packageName, todayIso);
  if (limitMins > 0 && remainingSec !== null && remainingSec <= 0) {
    return `Daily time limit reached (${limitMins}m/day used today). Resets tomorrow or via Admin Settings.`;
  }

  const isEssential = ESSENTIAL_FOCUS_PACKAGES.has(packageName);
  const focusMinsLeft = getFocusBlockRemainingMinutes(state, nowMs);
  if (!isEssential && focusMinsLeft > 0) {
    return `Blocked by Freedom Focus Lock (${focusMinsLeft}m remaining). Only Focus & essential utilities are allowed.`;
  }

  if (!isEssential && isDowntimeActive(state, currentHour)) {
    const sched = state.downtimeSchedule ?? DEFAULT_DOWNTIME_SCHEDULE;
    const s = String(sched.startHour).padStart(2, '0');
    const e = String(sched.endHour).padStart(2, '0');
    return `Blocked by Scheduled Quiet Hours (${s}:00–${e}:00). Only Focus & Growth is exempt.`;
  }

  return null;
}

export function getLockTaskWhitelist(state: KioskState, nowMs = Date.now()): string[] {
  const shields = state.blockerShields ?? DEFAULT_BLOCKER_SHIELDS;
  const whitelist = new Set<string>(['com.kiosk.launcher']);
  for (const pkg of state.allowedPackages) {
    const blockedBrowser =
      !state.adminUnlocked &&
      shields.blockUnsupportedBrowsers &&
      UNSUPPORTED_BROWSER_PACKAGES.has(pkg);
    const timeOrScheduleBlocked =
      !state.adminUnlocked && getAppScheduleOrLimitBlockReason(state, pkg, { nowMs }) !== null;
    if ((!RESTRICTED_SYSTEM_PACKAGES.has(pkg) && !blockedBrowser && !timeOrScheduleBlocked) || state.adminUnlocked) {
      whitelist.add(pkg);
    }
  }
  if (state.adminUnlocked) {
    whitelist.add('com.android.settings');
  }
  return Array.from(whitelist);
}

export function getVisibleHomeApps(state: KioskState): SimulatedAndroidApp[] {
  const allowedSet = new Set(state.allowedPackages);
  return getAllInstalledApps(state).filter(
    (app) => allowedSet.has(app.packageName) && !app.isSystemRestricted
  );
}

export function syncAllowedAppsMap(
  packages: string[],
  existing?: Record<string, AllowedAppConfig>
): Record<string, AllowedAppConfig> {
  const next: Record<string, AllowedAppConfig> = {};
  for (const pkg of packages) {
    next[pkg] = {
      passwordProtected: Boolean(existing?.[pkg]?.passwordProtected),
    };
  }
  return next;
}

export function isAppPasswordProtected(state: KioskState, packageName: string): boolean {
  if (!state.allowedPackages.includes(packageName)) return false;
  return Boolean(state.allowedApps?.[packageName]?.passwordProtected);
}

/**
 * Allows any printable passcode (letters, digits, symbols, interior spaces)
 * between 4 and 50 characters inclusive. Rejects blank strings or ISO control chars.
 */
export function isValidPinFormat(pin: string): boolean {
  if (pin.length < MIN_ADMIN_PIN_LENGTH || pin.length > MAX_ADMIN_PIN_LENGTH) {
    return false;
  }
  if (pin.trim().length === 0) {
    return false;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(pin)) {
    return false;
  }
  return true;
}

export function isValidPackageName(packageName: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(packageName);
}

export function extractHost(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  const explicitScheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  if (explicitScheme) {
    const scheme = explicitScheme[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') {
      return '';
    }
  }
  const withScheme = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function detectBlockedKeywordOrFeed(
  rawText: string,
  blockedKeywords: string[] = DEFAULT_BLOCKED_KEYWORDS,
  blockShortFormFeeds = true
): string | null {
  const lower = rawText.trim().toLowerCase();
  if (!lower) return null;

  if (
    blockShortFormFeeds &&
    (lower.includes('/shorts') ||
      lower.includes('youtube.com/shorts') ||
      lower.includes('/reels') ||
      lower.includes('instagram.com/reels') ||
      lower.includes('tiktok.com'))
  ) {
    return 'Short-form video feed (/shorts or /reels) is blocked by distraction shield.';
  }

  const matchedKeyword = blockedKeywords.find((kw) => {
    const clean = kw.trim().toLowerCase();
    return clean.length > 0 && lower.includes(clean);
  });
  if (matchedKeyword) {
    return `Blocked keyword ("${matchedKeyword}") matched in URL/search query.`;
  }

  return null;
}

export function isUrlAllowedInKioskBrowser(
  rawUrl: string,
  allowedDomains: string[],
  blockedKeywords: string[] = DEFAULT_BLOCKED_KEYWORDS,
  blockShortFormFeeds = true
): { allowed: boolean; host: string; reason?: string } {
  const explicitScheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(rawUrl.trim());
  if (explicitScheme) {
    const scheme = explicitScheme[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') {
      return {
        allowed: false,
        host: '',
        reason: `Blocked unsupported URI scheme (${scheme}:). Only http:// and https:// URLs are permitted.`,
      };
    }
  }
  const host = extractHost(rawUrl);
  if (!host) {
    return { allowed: false, host: '', reason: 'Enter a valid http:// or https:// domain or URL.' };
  }
  const blockedMatch = BLOCKED_DISTRACTION_DOMAINS.find(
    (blocked) => host === blocked || host.endsWith(`.${blocked}`)
  );
  if (blockedMatch) {
    return {
      allowed: false,
      host,
      reason: `Blocked distraction / restricted site (${blockedMatch}) cannot be opened in Kiosk Browser.`,
    };
  }

  const keywordOrFeedReason = detectBlockedKeywordOrFeed(
    rawUrl,
    blockedKeywords,
    blockShortFormFeeds
  );
  if (keywordOrFeedReason) {
    return {
      allowed: false,
      host,
      reason: keywordOrFeedReason,
    };
  }

  const isPermitted = allowedDomains.some((domain) => {
    const clean = domain.trim().toLowerCase().replace(/^www\./, '');
    return clean.length > 0 && (host === clean || host.endsWith(`.${clean}`));
  });
  if (!isPermitted) {
    return {
      allowed: false,
      host,
      reason: `${host} is not on the Admin Browser Allowlist.`,
    };
  }
  return { allowed: true, host };
}

export function getPinLockoutRemainingSeconds(state: KioskState, nowMs = Date.now()): number {
  const diff = (state.pinLockedUntilMs ?? 0) - nowMs;
  return diff > 0 ? Math.ceil(diff / 1000) : 0;
}

export function getStrictShieldRemainingMinutes(state: KioskState, nowMs = Date.now()): number {
  const until = state.blockerShields?.strictShieldLockUntilMs ?? 0;
  const diff = until - nowMs;
  return diff > 0 ? Math.ceil(diff / 60_000) : 0;
}

export function getTamperWarningEvents(state: KioskState): PolicyEvent[] {
  return state.events.filter(
    (e) => e.apiCall.includes('TamperDiagnostics') || e.detail.includes('Tamper Warning')
  );
}

function appendEvent(
  events: PolicyEvent[],
  apiCall: string,
  detail: string,
  outcome: PolicyEvent['outcome'],
  timestamp: string
): PolicyEvent[] {
  const next: PolicyEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${events.length + 1}`,
    timestamp,
    apiCall,
    detail,
    outcome,
  };
  return [next, ...events].slice(0, 36);
}

function applyDistrustAndEscalation(
  state: KioskState,
  delta: number,
  sourceReason: string,
  timestamp: string,
  nowMs: number
): KioskState {
  const nextScore = Math.min(200, (state.distrustScore ?? 0) + delta);
  const prevTier = state.tamperEscalationTier ?? 0;
  const nextTier: 0 | 1 | 2 =
    nextScore >= DISTRUST_TIER2_THRESHOLD
      ? 2
      : nextScore >= DISTRUST_TIER1_THRESHOLD
      ? 1
      : 0;

  let nextState: KioskState = {
    ...state,
    distrustScore: nextScore,
  };

  if (nextTier > prevTier) {
    const extraSeconds =
      nextTier >= 2 ? TIER2_EXTRA_LOCKOUT_SECONDS : TIER1_EXTRA_LOCKOUT_SECONDS;
    const lockUntilMs = Math.max(state.pinLockedUntilMs ?? 0, nowMs + extraSeconds * 1000);
    const currentShields = state.blockerShields ?? DEFAULT_BLOCKER_SHIELDS;
    const autoLockUntil =
      nextTier >= 2
        ? Math.max(currentShields.strictShieldLockUntilMs ?? 0, nowMs + 30 * 60_000)
        : currentShields.strictShieldLockUntilMs ?? 0;

    const warningDetail =
      nextTier >= 2
        ? `Tamper Warning: Severe bypass anomaly (${sourceReason}). Enforced +${extraSeconds}s Admin Lockout & 30m Shield Lock.`
        : `Tamper Warning: Bypass threshold exceeded (${sourceReason}). Enforced extra +${extraSeconds}s Admin Lockout.`;

    const evictedFromAdmin = nextState.activeScreen === 'admin_settings';
    nextState = {
      ...nextState,
      tamperEscalationTier: nextTier,
      pinLockedUntilMs: lockUntilMs,
      adminUnlocked: false,
      activeScreen: evictedFromAdmin ? 'pin_gate' : nextState.activeScreen,
      pinGateTarget: evictedFromAdmin ? 'admin_settings' : nextState.pinGateTarget,
      tamperWarningsCount: (nextState.tamperWarningsCount ?? 0) + 1,
      blockedNotice: warningDetail,
      blockerShields:
        nextTier >= 2
          ? { ...currentShields, strictShieldLockUntilMs: autoLockUntil }
          : currentShields,
      events: appendEvent(
        nextState.events,
        `TamperDiagnostics.escalateLockout(tier=${nextTier}, +${extraSeconds}s)`,
        warningDetail,
        'blocked',
        timestamp
      ),
    };
  }

  return nextState;
}

export function recordAdminSettingMutation(
  state: KioskState,
  actionName: string,
  timestamp = '08:31:25',
  nowMs = Date.now()
): KioskState {
  const cutoff = nowMs - TAMPER_WINDOW_MS;
  const pruned = (state.adminToggleTimestampsMs ?? []).filter(
    (ts) => ts >= cutoff && ts <= nowMs + 1000
  );
  const nextTimestamps = [...pruned, nowMs];

  if (nextTimestamps.length < RAPID_ADMIN_TOGGLE_THRESHOLD) {
    return {
      ...state,
      adminToggleTimestampsMs: nextTimestamps.slice(-20),
    };
  }

  const warningDetail = `Tamper Warning: Rapid admin setting toggling detected (${actionName}, ${nextTimestamps.length} changes in <15s).`;
  const warned: KioskState = {
    ...state,
    adminToggleTimestampsMs: [],
    tamperWarningsCount: (state.tamperWarningsCount ?? 0) + 1,
    events: appendEvent(
      state.events,
      'TamperDiagnostics.warn("RAPID_ADMIN_TOGGLE")',
      warningDetail,
      'blocked',
      timestamp
    ),
  };

  return applyDistrustAndEscalation(warned, 20, actionName, timestamp, nowMs);
}

export function recordBypassAttempt(
  state: KioskState,
  source: string,
  points = 5,
  timestamp = '08:31:25',
  nowMs = Date.now()
): KioskState {
  const cutoff = nowMs - TAMPER_WINDOW_MS;
  const pruned = (state.bypassAttemptTimestampsMs ?? []).filter(
    (ts) => ts >= cutoff && ts <= nowMs + 1000
  );
  const nextTimestamps = [...pruned, nowMs];
  const surge = nextTimestamps.length >= RAPID_BYPASS_SURGE_THRESHOLD;

  let working: KioskState = {
    ...state,
    bypassAttemptTimestampsMs: surge ? [] : nextTimestamps.slice(-20),
  };

  if (surge) {
    const warningDetail = `Tamper Warning: Repeated bypass probing detected (${source}).`;
    working = {
      ...working,
      tamperWarningsCount: (working.tamperWarningsCount ?? 0) + 1,
      events: appendEvent(
        working.events,
        'TamperDiagnostics.warn("BYPASS_PROBE_SURGE")',
        warningDetail,
        'blocked',
        timestamp
      ),
    };
  }

  return applyDistrustAndEscalation(
    working,
    points + (surge ? 15 : 0),
    source,
    timestamp,
    nowMs
  );
}

export function resetTamperDiagnostics(
  state: KioskState,
  timestamp = '08:31:30'
): KioskState {
  return {
    ...state,
    distrustScore: 0,
    tamperEscalationTier: 0,
    adminToggleTimestampsMs: [],
    bypassAttemptTimestampsMs: [],
    tamperWarningsCount: 0,
    pinLockedUntilMs: 0,
    failedPinAttempts: 0,
    events: appendEvent(
      state.events,
      'TamperDiagnostics.reset()',
      'Cleared bypass warning telemetry & reset internal security escalation counters.',
      'info',
      timestamp
    ),
  };
}

export function addCustomApp(
  state: KioskState,
  label: string,
  packageName: string,
  timestamp = '08:31:02'
): { nextState: KioskState; ok: boolean; error?: string } {
  const trimmedLabel = label.trim();
  const trimmedPkg = packageName.trim();

  if (!trimmedLabel) {
    return { ok: false, error: 'App name is required.', nextState: state };
  }
  if (!isValidPackageName(trimmedPkg)) {
    return {
      ok: false,
      error: 'Enter a valid Android package ID (e.g. com.amazon.kindle).',
      nextState: state,
    };
  }
  if (RESTRICTED_SYSTEM_PACKAGES.has(trimmedPkg) || trimmedPkg === 'com.kiosk.launcher') {
    return {
      ok: false,
      error: `${trimmedPkg} is protected by Kiosk policy and cannot be added to Kiosk Home.`,
      nextState: state,
    };
  }
  if (getAllInstalledApps(state).some((app) => app.packageName === trimmedPkg)) {
    return {
      ok: false,
      error: `${trimmedPkg} is already installed in the allowlist manager.`,
      nextState: state,
    };
  }

  const newApp: SimulatedAndroidApp = {
    packageName: trimmedPkg,
    label: trimmedLabel,
    category: 'Enterprise',
    isSystemRestricted: false,
    description: `Custom application (${trimmedPkg}) added by Admin and launched in LockTask mode.`,
  };

  const nextAllowed = [...state.allowedPackages, trimmedPkg];
  const nextState: KioskState = {
    ...state,
    customApps: [...(state.customApps ?? []), newApp],
    allowedPackages: nextAllowed,
    allowedApps: syncAllowedAppsMap(nextAllowed, state.allowedApps),
  };

  return {
    ok: true,
    nextState: {
      ...nextState,
      events: appendEvent(
        nextState.events,
        `dpm.setLockTaskPackages(admin, [${getLockTaskWhitelist(nextState).length} pkgs])`,
        `Added ${trimmedLabel} (${trimmedPkg}) from Admin Settings and enabled LockTask launch.`,
        'allowed',
        timestamp
      ),
    },
  };
}

export function launchApp(
  state: KioskState,
  packageName: string,
  timestamp = '08:31:00',
  nowMs = Date.now()
): KioskState {
  const currentState = ensureUsageDateCurrent(state, getLocalDateIso(nowMs));
  const app = getAllInstalledApps(currentState).find((item) => item.packageName === packageName);
  if (!app) return currentState;

  const shields = currentState.blockerShields ?? DEFAULT_BLOCKER_SHIELDS;
  if (
    (app.isUnsupportedBrowser || UNSUPPORTED_BROWSER_PACKAGES.has(packageName)) &&
    currentState.isDeviceOwner &&
    shields.blockUnsupportedBrowsers &&
    !currentState.adminUnlocked
  ) {
    const blocked: KioskState = {
      ...currentState,
      blockedAttemptsToday: (currentState.blockedAttemptsToday ?? 0) + 1,
      blockedNotice: `${app.label} (${packageName}) is suspended by Unsupported Browser Shield. Only managed Kiosk Browser is allowed.`,
      events: appendEvent(
        currentState.events,
        `KioskGuard.blockUnsupportedBrowser("${packageName}")`,
        `Suspended unmonitored third-party browser ${app.label} to prevent filter bypass.`,
        'blocked',
        timestamp
      ),
    };
    return recordBypassAttempt(blocked, `Unsupported browser launch: ${packageName}`, 8, timestamp, nowMs);
  }

  const timeOrScheduleBlock = getAppScheduleOrLimitBlockReason(currentState, packageName, { nowMs });
  if (timeOrScheduleBlock && !currentState.adminUnlocked) {
    const blocked: KioskState = {
      ...currentState,
      blockedAttemptsToday: (currentState.blockedAttemptsToday ?? 0) + 1,
      blockedNotice: `${app.label}: ${timeOrScheduleBlock}`,
      events: appendEvent(
        currentState.events,
        `AppBlockGuard.block("${packageName}")`,
        `${app.label} prevented from launching: ${timeOrScheduleBlock}`,
        'blocked',
        timestamp
      ),
    };
    return recordBypassAttempt(blocked, `Schedule/limit bypass attempt: ${packageName}`, 5, timestamp, nowMs);
  }

  if (
    packageName === 'com.android.camera2' &&
    currentState.isDeviceOwner &&
    currentState.hardwareLocks?.cameraDisabled
  ) {
    const blocked: KioskState = {
      ...currentState,
      blockedAttemptsToday: (currentState.blockedAttemptsToday ?? 0) + 1,
      blockedNotice:
        'Camera is disabled by DevicePolicyManager.setCameraDisabled(admin, true).',
      events: appendEvent(
        currentState.events,
        'dpm.getCameraDisabled(admin) -> true',
        'Blocked Camera launch: hardware camera lockdown enabled.',
        'blocked',
        timestamp
      ),
    };
    return recordBypassAttempt(blocked, `Disabled camera launch: ${packageName}`, 5, timestamp, nowMs);
  }

  if (app.isSystemRestricted && !currentState.adminUnlocked) {
    const blocked: KioskState = {
      ...currentState,
      blockedAttemptsToday: (currentState.blockedAttemptsToday ?? 0) + 1,
      blockedNotice: `${app.label} (${app.packageName}) is blocked by Device Owner policy unless unlocked with the Admin PIN.`,
      events: appendEvent(
        currentState.events,
        `KioskGuard.block("${packageName}")`,
        `Blocked access to ${app.label}: DISALLOW_APPS_CONTROL and package suspension active.`,
        'blocked',
        timestamp
      ),
    };
    return recordBypassAttempt(blocked, `Restricted system launch: ${packageName}`, 6, timestamp, nowMs);
  }

  if (packageName === 'com.android.settings' && currentState.adminUnlocked) {
    return {
      ...currentState,
      activeScreen: 'android_settings',
      activeAppPackage: packageName,
      lockTaskActive: false,
      blockedNotice: null,
      events: appendEvent(
        currentState.events,
        'startActivity(Settings.ACTION_SETTINGS)',
        'Opened Android Settings using temporary Admin PIN unlock.',
        'allowed',
        timestamp
      ),
    };
  }

  const isAllowed = currentState.allowedPackages.includes(packageName) || currentState.adminUnlocked;
  if (!isAllowed) {
    return {
      ...currentState,
      blockedNotice: `${app.label} is not in the allowed kiosk app list.`,
      events: appendEvent(
        currentState.events,
        `launchPackageInKioskMode("${packageName}") -> false`,
        'Rejected launch: package not in Admin allowlist.',
        'blocked',
        timestamp
      ),
    };
  }

  if (packageName === SELF_IMPROVEMENT_PACKAGE) {
    return {
      ...currentState,
      activeScreen: 'self_improvement',
      activeAppPackage: packageName,
      lockTaskActive: currentState.isDeviceOwner,
      blockedNotice: null,
      events: appendEvent(
        currentState.events,
        'startActivity(SelfImprovementActivity, setLockTaskEnabled(true))',
        'Launched integrated Focus & Growth self-improvement hub in LockTask mode.',
        'allowed',
        timestamp
      ),
    };
  }

  if (packageName === KIOSK_BROWSER_PACKAGE) {
    const startHost = currentState.allowedDomains[0] ?? DEFAULT_ALLOWED_DOMAINS[0];
    return {
      ...currentState,
      activeScreen: 'kiosk_browser',
      activeAppPackage: packageName,
      browserCurrentUrl: `https://${startHost}`,
      browserBlockedUrl: null,
      lockTaskActive: currentState.isDeviceOwner,
      blockedNotice: null,
      events: appendEvent(
        currentState.events,
        'startActivity(KioskBrowserActivity, setLockTaskEnabled(true))',
        `Launched Kiosk Browser pinned to allowlist (${currentState.allowedDomains.length} domains).`,
        'allowed',
        timestamp
      ),
    };
  }

  return {
    ...currentState,
    activeScreen: 'app_lock_task',
    activeAppPackage: packageName,
    lockTaskActive: currentState.isDeviceOwner,
    blockedNotice: null,
    events: appendEvent(
      currentState.events,
      currentState.isDeviceOwner
        ? `startActivity("${packageName}", setLockTaskEnabled(true))`
        : `startLockTask(); startActivity("${packageName}")`,
      `Launched ${app.label} in pinned LockTask mode.`,
      'allowed',
      timestamp
    ),
  };
}

export function attemptUninstallApp(
  state: KioskState,
  packageName: string,
  timestamp = '08:31:05',
  nowMs = Date.now()
): KioskState {
  const app = getAllInstalledApps(state).find((item) => item.packageName === packageName);
  const label = app?.label ?? packageName;

  if (packageName === 'com.kiosk.launcher') {
    const blocked: KioskState = {
      ...state,
      blockedNotice:
        'Ironclad OS Launcher cannot be uninstalled while Device Owner is active (setUninstallBlocked = true).',
      events: appendEvent(
        state.events,
        'dpm.isUninstallBlocked("com.kiosk.launcher") -> true',
        'Prevented uninstallation of Device Owner kiosk launcher.',
        'blocked',
        timestamp
      ),
    };
    return recordBypassAttempt(blocked, 'Attempted Device Owner launcher uninstall', 8, timestamp, nowMs);
  }

  if (!state.adminUnlocked) {
    const blocked: KioskState = {
      ...state,
      blockedNotice: `Uninstalling ${label} is blocked unless unlocked with the Admin PIN.`,
      events: appendEvent(
        state.events,
        `PackageInstaller.uninstall("${packageName}") -> BLOCKED`,
        'Blocked app removal: DISALLOW_APPS_CONTROL enforced and Admin PIN unlock inactive.',
        'blocked',
        timestamp
      ),
    };
    return recordBypassAttempt(blocked, `Unauthorized uninstall attempt: ${packageName}`, 6, timestamp, nowMs);
  }

  return {
    ...state,
    blockedNotice: null,
    events: appendEvent(
      state.events,
      `PackageInstaller.uninstall("${packageName}")`,
      `Uninstall prompt permitted for ${label} under temporary Admin PIN unlock.`,
      'allowed',
      timestamp
    ),
  };
}

export function openPinGate(state: KioskState, target: PinGateTarget): KioskState {
  return {
    ...state,
    activeScreen: 'pin_gate',
    pinGateTarget: target,
    blockedNotice: null,
  };
}

export function submitPin(
  state: KioskState,
  candidatePin: string,
  timestamp = '08:31:10',
  nowMs = Date.now()
): { nextState: KioskState; verified: boolean; lockedOutSeconds?: number } {
  const remaining = getPinLockoutRemainingSeconds(state, nowMs);
  if (remaining > 0) {
    return {
      verified: false,
      lockedOutSeconds: remaining,
      nextState: {
        ...state,
        events: appendEvent(
          state.events,
          `KioskPreferences.verifyPin(****) -> LOCKED (${remaining}s)`,
          `Admin PIN entry temporarily locked for ${remaining}s after repeated failed attempts.`,
          'blocked',
          timestamp
        ),
      },
    };
  }

  if (candidatePin !== state.adminPin) {
    const nextAttempts = (state.failedPinAttempts ?? 0) + 1;
    const triggerLockout = nextAttempts >= MAX_FAILED_PIN_ATTEMPTS;
    const lockedUntilMs = triggerLockout
      ? Math.max(state.pinLockedUntilMs ?? 0, nowMs + PIN_LOCKOUT_DURATION_MS)
      : state.pinLockedUntilMs ?? 0;

    const failedBase: KioskState = {
      ...state,
      failedPinAttempts: triggerLockout ? 0 : nextAttempts,
      pinLockedUntilMs: lockedUntilMs,
      events: appendEvent(
        state.events,
        triggerLockout
          ? 'KioskPreferences.verifyPin(****) -> LOCKOUT_30S'
          : `KioskPreferences.verifyPin(****) -> false (${nextAttempts}/${MAX_FAILED_PIN_ATTEMPTS})`,
        triggerLockout
          ? 'Too many failed Admin passcodes. Security cooldown active for 30 seconds.'
          : `Rejected invalid Admin passcode attempt (${nextAttempts}/${MAX_FAILED_PIN_ATTEMPTS}).`,
        'blocked',
        timestamp
      ),
    };

    const afterTamper = recordBypassAttempt(
      failedBase,
      `Invalid Admin passcode (${nextAttempts}/${MAX_FAILED_PIN_ATTEMPTS})`,
      4,
      timestamp,
      nowMs
    );
    const totalLockRemaining = getPinLockoutRemainingSeconds(afterTamper, nowMs);

    return {
      verified: false,
      lockedOutSeconds: totalLockRemaining > 0 ? totalLockRemaining : undefined,
      nextState: afterTamper,
    };
  }

  const clearedState: KioskState = {
    ...state,
    failedPinAttempts: 0,
    pinLockedUntilMs: 0,
  };

  const target = state.pinGateTarget ?? 'admin_settings';
  if (target === 'exit_lock_task') {
    return {
      verified: true,
      nextState: {
        ...clearedState,
        activeScreen: 'home',
        activeAppPackage: null,
        pinGateTarget: null,
        adminUnlocked: false,
        lockTaskActive: state.isDeviceOwner,
        blockedNotice: null,
        events: appendEvent(
          clearedState.events,
          'stopLockTask(); returnToKioskHome()',
          'Exited pinned app via Admin passcode and returned to Kiosk Home.',
          'allowed',
          timestamp
        ),
      },
    };
  }

  if (target === 'unlock_system') {
    return {
      verified: true,
      nextState: {
        ...clearedState,
        activeScreen: 'admin_settings',
        pinGateTarget: null,
        adminUnlocked: true,
        blockedNotice: null,
        events: appendEvent(
          clearedState.events,
          'DevicePolicyHelper.setAdminUnlockState(true)',
          'Admin passcode verified: Settings & Uninstall temporarily unlocked.',
          'allowed',
          timestamp
        ),
      },
    };
  }

  return {
    verified: true,
    nextState: {
      ...clearedState,
      activeScreen: 'admin_settings',
      pinGateTarget: null,
      blockedNotice: null,
      events: appendEvent(
        clearedState.events,
        'KioskPreferences.verifyPin(****) -> true',
        'Admin passcode verified: opened Admin Settings.',
        'allowed',
        timestamp
      ),
    },
  };
}

export function toggleAllowedApp(
  state: KioskState,
  packageName: string,
  timestamp = '08:31:15'
): KioskState {
  if (RESTRICTED_SYSTEM_PACKAGES.has(packageName)) {
    return state;
  }

  const exists = state.allowedPackages.includes(packageName);
  const nextPackages = exists
    ? state.allowedPackages.filter((pkg) => pkg !== packageName)
    : [...state.allowedPackages, packageName];

  const nextAllowedApps = syncAllowedAppsMap(nextPackages, state.allowedApps);

  const updated: KioskState = {
    ...state,
    allowedPackages: nextPackages,
    allowedApps: nextAllowedApps,
  };

  return {
    ...updated,
    events: appendEvent(
      state.events,
      `dpm.setLockTaskPackages(admin, [${getLockTaskWhitelist(updated).length} pkgs])`,
      `${exists ? 'Removed' : 'Added'} ${packageName} ${exists ? 'from' : 'to'} Kiosk Home allowlist.`,
      'info',
      timestamp
    ),
  };
}

export function toggleAppPasswordProtection(
  state: KioskState,
  packageName: string,
  enabled?: boolean,
  timestamp = '08:31:16'
): KioskState {
  if (RESTRICTED_SYSTEM_PACKAGES.has(packageName) || !state.allowedPackages.includes(packageName)) {
    return state;
  }

  const currentProtected = Boolean(state.allowedApps?.[packageName]?.passwordProtected);
  const nextProtected = enabled !== undefined ? enabled : !currentProtected;
  const nextAllowedApps = {
    ...syncAllowedAppsMap(state.allowedPackages, state.allowedApps),
    [packageName]: { passwordProtected: nextProtected },
  };

  return {
    ...state,
    allowedApps: nextAllowedApps,
    events: appendEvent(
      state.events,
      `KioskPreferences.setAppPasswordProtected("${packageName}", ${nextProtected})`,
      `${nextProtected ? 'Enabled' : 'Disabled'} App Access PIN protection for ${packageName}.`,
      nextProtected ? 'enforced' : 'info',
      timestamp
    ),
  };
}

export function verifyAppAccessPin(
  state: KioskState,
  packageName: string,
  candidatePin: string,
  timestamp = '08:31:10',
  nowMs = Date.now()
): { nextState: KioskState; verified: boolean; lockedOutSeconds?: number } {
  const remaining = getPinLockoutRemainingSeconds(state, nowMs);
  if (remaining > 0) {
    return {
      verified: false,
      lockedOutSeconds: remaining,
      nextState: {
        ...state,
        events: appendEvent(
          state.events,
          `AppAccessGate.verifyPin("${packageName}", ****) -> LOCKED (${remaining}s)`,
          `App Access PIN entry temporarily locked for ${remaining}s after repeated failed attempts.`,
          'blocked',
          timestamp
        ),
      },
    };
  }

  if (candidatePin !== state.adminPin) {
    const nextAttempts = (state.failedPinAttempts ?? 0) + 1;
    const triggerLockout = nextAttempts >= MAX_FAILED_PIN_ATTEMPTS;
    const lockedUntilMs = triggerLockout
      ? Math.max(state.pinLockedUntilMs ?? 0, nowMs + PIN_LOCKOUT_DURATION_MS)
      : state.pinLockedUntilMs ?? 0;

    const failedBase: KioskState = {
      ...state,
      failedPinAttempts: triggerLockout ? 0 : nextAttempts,
      pinLockedUntilMs: lockedUntilMs,
      events: appendEvent(
        state.events,
        triggerLockout
          ? `AppAccessGate.verifyPin("${packageName}", ****) -> LOCKOUT_30S`
          : `AppAccessGate.verifyPin("${packageName}", ****) -> false (${nextAttempts}/${MAX_FAILED_PIN_ATTEMPTS})`,
        triggerLockout
          ? `Too many failed App Access PIN attempts for ${packageName}. Security cooldown active for 30 seconds.`
          : `Rejected invalid App Access PIN attempt for ${packageName} (${nextAttempts}/${MAX_FAILED_PIN_ATTEMPTS}).`,
        'blocked',
        timestamp
      ),
    };

    const afterTamper = recordBypassAttempt(
      failedBase,
      `Invalid App Access PIN (${packageName}, ${nextAttempts}/${MAX_FAILED_PIN_ATTEMPTS})`,
      4,
      timestamp,
      nowMs
    );
    const totalLockRemaining = getPinLockoutRemainingSeconds(afterTamper, nowMs);

    return {
      verified: false,
      lockedOutSeconds: totalLockRemaining > 0 ? totalLockRemaining : undefined,
      nextState: afterTamper,
    };
  }

  return {
    verified: true,
    nextState: {
      ...state,
      failedPinAttempts: 0,
      pinLockedUntilMs: 0,
      events: appendEvent(
        state.events,
        `AppAccessGate.verifyPin("${packageName}", ****) -> true`,
        `Verified App Access PIN to launch ${packageName}.`,
        'allowed',
        timestamp
      ),
    },
  };
}

export function updateAdminPin(
  state: KioskState,
  currentPin: string,
  newPin: string,
  confirmPin: string,
  timestamp = '08:31:20'
): { nextState: KioskState; ok: boolean; error?: string } {
  if (currentPin !== state.adminPin) {
    return {
      ok: false,
      error: 'Current passcode is incorrect.',
      nextState: state,
    };
  }
  if (!isValidPinFormat(newPin)) {
    return {
      ok: false,
      error: `Passcode must be ${MIN_ADMIN_PIN_LENGTH} to ${MAX_ADMIN_PIN_LENGTH} characters (letters, digits, or symbols).`,
      nextState: state,
    };
  }
  if (newPin !== confirmPin) {
    return {
      ok: false,
      error: 'New passcode and confirmation do not match.',
      nextState: state,
    };
  }

  return {
    ok: true,
    nextState: {
      ...state,
      adminPin: newPin,
      failedPinAttempts: 0,
      pinLockedUntilMs: 0,
      events: appendEvent(
        state.events,
        `KioskPreferences.changePin(len=${newPin.length}) -> Success`,
        `Updated salted SHA-256 Admin passcode (${newPin.length} chars) in Device Protected Storage.`,
        'enforced',
        timestamp
      ),
    },
  };
}

export function setKioskOperationMode(
  state: KioskState,
  mode: KioskOperationMode,
  singleAppPackage?: string | null,
  timestamp = '08:31:22'
): KioskState {
  const nextSinglePkg =
    singleAppPackage !== undefined ? singleAppPackage : state.singleAppPackage;
  const nextAllowed =
    mode === 'kiosk_browser' && !state.allowedPackages.includes(KIOSK_BROWSER_PACKAGE)
      ? [...state.allowedPackages, KIOSK_BROWSER_PACKAGE]
      : mode === 'single_app' && nextSinglePkg && !state.allowedPackages.includes(nextSinglePkg)
      ? [...state.allowedPackages, nextSinglePkg]
      : state.allowedPackages;

  const updated: KioskState = {
    ...state,
    kioskMode: mode,
    singleAppPackage: nextSinglePkg,
    allowedPackages: nextAllowed,
    allowedApps: syncAllowedAppsMap(nextAllowed, state.allowedApps),
  };

  return {
    ...updated,
    events: appendEvent(
      state.events,
      `KioskPreferences.setKioskMode("${mode}")`,
      mode === 'single_app'
        ? `Switched kiosk to Single-App Lock mode (${nextSinglePkg ?? 'unspecified'}).`
        : mode === 'kiosk_browser'
        ? 'Switched kiosk to Locked Kiosk Browser mode.'
        : 'Switched kiosk to Multi-App Launcher mode.',
      'enforced',
      timestamp
    ),
  };
}

export function updateKioskTitle(
  state: KioskState,
  title: string,
  timestamp = '08:31:23'
): KioskState {
  const cleanTitle = title.trim() || 'Kiosk Home';
  return {
    ...state,
    kioskTitle: cleanTitle,
    events: appendEvent(
      state.events,
      `KioskPreferences.setKioskTitle("${cleanTitle}")`,
      `Updated custom kiosk home branding header to "${cleanTitle}".`,
      'info',
      timestamp
    ),
  };
}

export function toggleHardwarePolicy(
  state: KioskState,
  key: HardwareLockPolicyKey,
  enabled?: boolean,
  timestamp = '08:31:24',
  nowMs = Date.now()
): KioskState {
  const current = state.hardwareLocks ?? DEFAULT_HARDWARE_LOCKS;
  const nextValue = enabled !== undefined ? enabled : !current[key];
  const nextLocks: HardwareLockPolicies = {
    ...current,
    [key]: nextValue,
  };

  const apiNameMap: Record<HardwareLockPolicyKey, string> = {
    statusBarDisabled: `dpm.setStatusBarDisabled(admin, ${nextValue})`,
    keyguardDisabled: `dpm.setKeyguardDisabled(admin, ${nextValue})`,
    cameraDisabled: `dpm.setCameraDisabled(admin, ${nextValue})`,
    usbTransferBlocked: `dpm.${nextValue ? 'addUserRestriction' : 'clearUserRestriction'}(DISALLOW_USB_FILE_TRANSFER)`,
    dateTimeLocked: `dpm.${nextValue ? 'addUserRestriction' : 'clearUserRestriction'}(DISALLOW_CONFIG_DATE_TIME)`,
    screenCaptureDisabled: `dpm.setScreenCaptureDisabled(admin, ${nextValue})`,
    keepScreenAwake: `window.${nextValue ? 'addFlags' : 'clearFlags'}(FLAG_KEEP_SCREEN_ON)`,
  };

  const updated: KioskState = {
    ...state,
    hardwareLocks: nextLocks,
    events: appendEvent(
      state.events,
      apiNameMap[key],
      `${key} set to ${nextValue}.`,
      nextValue ? 'enforced' : 'info',
      timestamp
    ),
  };
  return recordAdminSettingMutation(updated, `${key}=${nextValue}`, timestamp, nowMs);
}

export function toggleAdminRestriction(
  state: KioskState,
  key: RestrictionKey,
  enabled?: boolean,
  timestamp = '08:31:24',
  nowMs = Date.now()
): KioskState {
  const current = state.adminRestrictions ?? DEFAULT_ADMIN_RESTRICTIONS;
  const nextValue = enabled !== undefined ? enabled : !current[key];
  const nextRestrictions: Record<RestrictionKey, boolean> = {
    ...current,
    [key]: nextValue,
  };

  const apiCall = `dpm.${nextValue ? 'addUserRestriction' : 'clearUserRestriction'}(admin, UserManager.${key})`;
  const updated: KioskState = {
    ...state,
    adminRestrictions: nextRestrictions,
    events: appendEvent(
      state.events,
      apiCall,
      `${key} set to ${nextValue}.`,
      nextValue ? 'enforced' : 'info',
      timestamp
    ),
  };
  return recordAdminSettingMutation(updated, `${key}=${nextValue}`, timestamp, nowMs);
}

export function toggleBlockerShield(
  state: KioskState,
  key: BlockerShieldToggleKey,
  enabled?: boolean,
  timestamp = '08:31:24',
  nowMs = Date.now()
): { nextState: KioskState; ok: boolean; error?: string } {
  const current = state.blockerShields ?? DEFAULT_BLOCKER_SHIELDS;
  const nextValue = enabled !== undefined ? enabled : !current[key];
  const remainingMins = getStrictShieldRemainingMinutes(state, nowMs);

  if (!nextValue && remainingMins > 0) {
    const blocked: KioskState = {
      ...state,
      events: appendEvent(
        state.events,
        `BlockerShield.modify("${key}", false) -> LOCKED`,
        `Prevented disabling ${key} while Strict Shield Lock has ${remainingMins}m remaining.`,
        'blocked',
        timestamp
      ),
    };
    return {
      ok: false,
      error: `Strict Anti-Relapse Lock active: shields cannot be weakened for ${remainingMins} more minutes.`,
      nextState: recordBypassAttempt(blocked, `Strict Lock bypass: ${key}=false`, 10, timestamp, nowMs),
    };
  }

  const nextShields: BlockerShieldPolicies = {
    ...current,
    [key]: nextValue,
  };

  const apiLabelMap: Record<BlockerShieldToggleKey, string> = {
    disablePornOnBrowsers: `dpm.setApplicationRestrictions("com.android.chrome", SafeSearch=${nextValue}, Incognito=${!nextValue})`,
    blockInAppBrowsers: `KioskGuardAccessibilityService.blockInAppBrowsers(${nextValue}, whitelist=${current.inAppBrowserWhitelist.length})`,
    blockUnsupportedBrowsers: `dpm.setPackagesSuspended(UNSUPPORTED_BROWSERS, ${nextValue})`,
    blockShortFormFeeds: `KioskGuardAccessibilityService.blockShortFormFeeds(${nextValue})`,
  };

  const updated: KioskState = {
    ...state,
    blockerShields: nextShields,
    events: appendEvent(
      state.events,
      apiLabelMap[key],
      `${key} set to ${nextValue}.`,
      nextValue ? 'enforced' : 'info',
      timestamp
    ),
  };

  return {
    ok: true,
    nextState: recordAdminSettingMutation(updated, `${key}=${nextValue}`, timestamp, nowMs),
  };
}

export function setFamilyDnsMode(
  state: KioskState,
  mode: FamilyDnsMode,
  timestamp = '08:31:25',
  nowMs = Date.now()
): { nextState: KioskState; ok: boolean; error?: string } {
  const current = state.blockerShields ?? DEFAULT_BLOCKER_SHIELDS;
  const remainingMins = getStrictShieldRemainingMinutes(state, nowMs);

  if (mode === 'off' && remainingMins > 0) {
    return {
      ok: false,
      error: `Strict Anti-Relapse Lock active: Family DNS cannot be turned off for ${remainingMins} more minutes.`,
      nextState: recordBypassAttempt(state, 'Strict Lock bypass: familyDns=off', 10, timestamp, nowMs),
    };
  }

  const host =
    mode === 'cloudflare'
      ? 'family.cloudflare-dns.com'
      : mode === 'cleanbrowsing'
      ? 'adult-filter-dns.cleanbrowsing.org'
      : 'opportunistic';

  const updated: KioskState = {
    ...state,
    blockerShields: {
      ...current,
      familyDnsMode: mode,
    },
    events: appendEvent(
      state.events,
      mode === 'off'
        ? 'dpm.setGlobalPrivateDnsModeOpportunistic(admin)'
        : `dpm.setGlobalPrivateDnsModeSpecifiedHost("${host}") + DISALLOW_CONFIG_VPN`,
      mode === 'off'
        ? 'Disabled system Private DNS filter.'
        : `Enforced Family Private DNS (${host}) and blocked VPN bypasses.`,
      mode === 'off' ? 'info' : 'enforced',
      timestamp
    ),
  };

  return {
    ok: true,
    nextState: recordAdminSettingMutation(updated, `familyDns=${mode}`, timestamp, nowMs),
  };
}

export function updateInAppBrowserWhitelist(
  state: KioskState,
  packages: string[],
  timestamp = '08:31:25'
): KioskState {
  const current = state.blockerShields ?? DEFAULT_BLOCKER_SHIELDS;
  const cleaned = Array.from(
    new Set(['com.kiosk.launcher', ...packages.map((p) => p.trim()).filter((p) => p.length > 0)])
  );
  return {
    ...state,
    blockerShields: {
      ...current,
      inAppBrowserWhitelist: cleaned,
    },
    events: appendEvent(
      state.events,
      `KioskPreferences.setInAppBrowserWhitelist(${cleaned.length} pkgs)`,
      `Updated In-App Browser whitelist: ${cleaned.join(', ')}.`,
      'enforced',
      timestamp
    ),
  };
}

export function updateBlockedKeywords(
  state: KioskState,
  keywords: string[],
  timestamp = '08:31:25'
): KioskState {
  const current = state.blockerShields ?? DEFAULT_BLOCKER_SHIELDS;
  const cleaned = Array.from(
    new Set(keywords.map((k) => k.trim().toLowerCase()).filter((k) => k.length >= 2))
  );
  return {
    ...state,
    blockerShields: {
      ...current,
      blockedKeywords: cleaned,
    },
    events: appendEvent(
      state.events,
      `KioskPreferences.setBlockedKeywords(${cleaned.length} terms)`,
      `Updated Chrome URLBlocklist & browser search keywords (${cleaned.length} terms).`,
      'enforced',
      timestamp
    ),
  };
}

export function activateStrictShieldLock(
  state: KioskState,
  minutes: number,
  timestamp = '08:31:25',
  nowMs = Date.now()
): KioskState {
  const current = state.blockerShields ?? DEFAULT_BLOCKER_SHIELDS;
  const until = Math.max(current.strictShieldLockUntilMs ?? 0, nowMs + minutes * 60_000);
  return {
    ...state,
    blockerShields: {
      ...current,
      strictShieldLockUntilMs: until,
    },
    events: appendEvent(
      state.events,
      `BlockerShield.lockStrictCooldown(${minutes}m)`,
      `Activated ${minutes}-minute anti-relapse shield lock; weakening filters is blocked until expiry.`,
      'enforced',
      timestamp
    ),
  };
}

export function testInAppBrowserAccess(
  state: KioskState,
  packageName: string,
  timestamp = '08:31:26',
  nowMs = Date.now()
): { nextState: KioskState; allowed: boolean; reason: string } {
  const shields = state.blockerShields ?? DEFAULT_BLOCKER_SHIELDS;
  const whitelisted =
    packageName === 'com.kiosk.launcher' ||
    shields.inAppBrowserWhitelist.some(
      (pkg) => pkg.trim().toLowerCase() === packageName.trim().toLowerCase()
    );

  if (!shields.blockInAppBrowsers || whitelisted) {
    const reason = !shields.blockInAppBrowsers
      ? `Allowed In-App Browser inside ${packageName} (In-App Browser Shield is off).`
      : `Allowed In-App Browser inside ${packageName} (package is on Admin In-App Whitelist).`;
    return {
      allowed: true,
      reason,
      nextState: {
        ...state,
        events: appendEvent(
          state.events,
          `KioskGuard.checkInAppBrowser("${packageName}") -> ALLOWED`,
          reason,
          'allowed',
          timestamp
        ),
      },
    };
  }

  const reason = `Blocked embedded In-App Browser (WebView/CustomTab) inside ${packageName} — not on Admin Whitelist.`;
  const blocked: KioskState = {
    ...state,
    blockedAttemptsToday: (state.blockedAttemptsToday ?? 0) + 1,
    blockedNotice: reason,
    events: appendEvent(
      state.events,
      `KioskGuardAccessibilityService.blockInAppBrowser("${packageName}")`,
      reason,
      'blocked',
      timestamp
    ),
  };
  return {
    allowed: false,
    reason,
    nextState: recordBypassAttempt(blocked, `In-app WebView attempt: ${packageName}`, 6, timestamp, nowMs),
  };
}

export function updateAllowedDomains(
  state: KioskState,
  domains: string[],
  timestamp = '08:31:25'
): KioskState {
  const cleaned = Array.from(
    new Set(
      domains
        .map((d) =>
          d
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/\/.*$/, '')
        )
        .filter((d) => d.length > 0 && !BLOCKED_DISTRACTION_DOMAINS.includes(d))
    )
  );

  return {
    ...state,
    allowedDomains: cleaned,
    events: appendEvent(
      state.events,
      `KioskPreferences.setAllowedDomains(${cleaned.length} hosts)`,
      `Updated Kiosk Browser domain allowlist: ${cleaned.join(', ') || 'none'}.`,
      'enforced',
      timestamp
    ),
  };
}

export function navigateKioskBrowser(
  state: KioskState,
  rawUrl: string,
  timestamp = '08:31:26',
  nowMs = Date.now()
): { nextState: KioskState; ok: boolean; host: string; reason?: string } {
  const shields = state.blockerShields ?? DEFAULT_BLOCKER_SHIELDS;
  const check = isUrlAllowedInKioskBrowser(
    rawUrl,
    state.allowedDomains,
    shields.disablePornOnBrowsers ? shields.blockedKeywords : [],
    shields.blockShortFormFeeds
  );
  const normalizedUrl = rawUrl.trim().includes('://')
    ? rawUrl.trim()
    : `https://${check.host || rawUrl.trim()}`;

  if (!check.allowed) {
    const blocked: KioskState = {
      ...state,
      blockedAttemptsToday: (state.blockedAttemptsToday ?? 0) + 1,
      browserBlockedUrl: normalizedUrl,
      events: appendEvent(
        state.events,
        `KioskBrowserClient.shouldOverrideUrlLoading("${check.host || rawUrl}") -> BLOCKED`,
        check.reason ?? 'Navigation blocked by Kiosk Browser domain policy.',
        'blocked',
        timestamp
      ),
    };
    return {
      ok: false,
      host: check.host,
      reason: check.reason,
      nextState: recordBypassAttempt(
        blocked,
        `Blocked browser URL: ${check.host || rawUrl}`,
        5,
        timestamp,
        nowMs
      ),
    };
  }

  return {
    ok: true,
    host: check.host,
    nextState: {
      ...state,
      browserCurrentUrl: normalizedUrl,
      browserBlockedUrl: null,
      events: appendEvent(
        state.events,
        `KioskBrowserActivity.loadUrl("https://${check.host}")`,
        `Loaded allowlisted host ${check.host} inside pinned Kiosk Browser.`,
        'allowed',
        timestamp
      ),
    },
  };
}

export function setAdminSystemUnlock(
  state: KioskState,
  unlocked: boolean,
  timestamp = '08:31:25',
  nowMs = Date.now()
): KioskState {
  const updated: KioskState = {
    ...state,
    adminUnlocked: unlocked,
    events: appendEvent(
      state.events,
      `DevicePolicyHelper.setAdminUnlockState(${unlocked})`,
      unlocked
        ? 'Temporarily lifted DISALLOW_APPS_CONTROL & unsuspended Settings/PackageInstaller.'
        : 'Re-enforced DISALLOW_APPS_CONTROL & suspended Settings/PackageInstaller.',
      unlocked ? 'info' : 'enforced',
      timestamp
    ),
  };
  return recordAdminSettingMutation(updated, `adminUnlock=${unlocked}`, timestamp, nowMs);
}

export function returnToKioskHome(
  state: KioskState,
  timestamp = '08:31:30'
): KioskState {
  return {
    ...state,
    activeScreen: 'home',
    activeAppPackage: null,
    pinGateTarget: null,
    adminUnlocked: false,
    lockTaskActive: state.isDeviceOwner,
    blockedNotice: null,
    events: appendEvent(
      state.events,
      'KioskLauncherActivity.onResume()',
      'Returned to Kiosk Home; temporary Settings/Uninstall unlock automatically revoked.',
      'enforced',
      timestamp
    ),
  };
}

export function toggleDeviceOwnerMode(
  state: KioskState,
  isDeviceOwner: boolean,
  timestamp = '08:31:35'
): KioskState {
  return {
    ...state,
    isDeviceOwner,
    lockTaskActive: isDeviceOwner,
    events: appendEvent(
      state.events,
      isDeviceOwner
        ? 'dpm set-device-owner com.kiosk.launcher/.admin.KioskDeviceAdminReceiver'
        : 'dpm remove-active-admin com.kiosk.launcher/.admin.KioskDeviceAdminReceiver',
      isDeviceOwner
        ? 'Device Owner enabled: enforced DISALLOW_SAFE_BOOT, DISALLOW_FACTORY_RESET, DISALLOW_ADD_USER, DISALLOW_APPS_CONTROL, Family DNS & hardware policies.'
        : 'Device Owner disabled: UserManager restrictions cleared (standard launcher fallback).',
      isDeviceOwner ? 'enforced' : 'info',
      timestamp
    ),
  };
}

export function setAppTimeLimit(
  state: KioskState,
  packageName: string,
  minutes: number,
  timestamp = '08:31:26',
  nowMs = Date.now()
): { nextState: KioskState; ok: boolean; error?: string } {
  const current = state.appTimeLimits ?? {};
  const existingLimit = current[packageName] ?? 0;
  const clamped = minutes <= 0 ? 0 : Math.min(Math.round(minutes), MAX_DAILY_APP_LIMIT_MINUTES);
  const remainingStrictMins = getStrictShieldRemainingMinutes(state, nowMs);

  const isWeakening = existingLimit > 0 && (clamped === 0 || clamped > existingLimit);
  if (isWeakening && remainingStrictMins > 0) {
    return {
      ok: false,
      error: `Strict Anti-Relapse Lock active: app limits cannot be raised or removed for ${remainingStrictMins}m.`,
      nextState: recordBypassAttempt(state, `Strict Lock bypass: raise/remove limit on ${packageName}`, 10, timestamp, nowMs),
    };
  }

  const nextLimits = { ...current };
  if (clamped === 0) {
    delete nextLimits[packageName];
  } else {
    nextLimits[packageName] = clamped;
  }

  let nextState: KioskState = {
    ...ensureUsageDateCurrent(state, getLocalDateIso(nowMs)),
    appTimeLimits: nextLimits,
  };

  if (
    !nextState.adminUnlocked &&
    nextState.activeAppPackage === packageName &&
    getAppScheduleOrLimitBlockReason(nextState, packageName, { nowMs }) !== null
  ) {
    nextState = {
      ...nextState,
      activeScreen: 'home',
      activeAppPackage: null,
      blockedAttemptsToday: (nextState.blockedAttemptsToday ?? 0) + 1,
      blockedNotice: `${packageName} immediately closed: today's usage already meets the ${clamped}m limit.`,
    };
  }

  return {
    ok: true,
    nextState: recordAdminSettingMutation(
      {
        ...nextState,
        events: appendEvent(
          nextState.events,
          `AppBlock.setDailyLimit("${packageName}", ${clamped}m)`,
          clamped === 0
            ? `Removed daily time limit on ${packageName} (Unlimited).`
            : `Set daily time limit for ${packageName} to ${clamped} minutes/day.`,
          clamped > 0 ? 'enforced' : 'info',
          timestamp
        ),
      },
      `limit(${packageName}=${clamped}m)`,
      timestamp,
      nowMs
    ),
  };
}

export function resetAppUsage(
  state: KioskState,
  packageName: string,
  timestamp = '08:31:26',
  nowMs = Date.now()
): { nextState: KioskState; ok: boolean; error?: string } {
  const remainingStrictMins = getStrictShieldRemainingMinutes(state, nowMs);
  if (remainingStrictMins > 0) {
    return {
      ok: false,
      error: `Strict Anti-Relapse Lock active: cannot reset daily usage for ${remainingStrictMins}m.`,
      nextState: recordBypassAttempt(state, `Strict Lock bypass: reset usage ${packageName}`, 10, timestamp, nowMs),
    };
  }
  const current = { ...(state.appUsageSeconds ?? {}) };
  delete current[packageName];
  return {
    ok: true,
    nextState: {
      ...ensureUsageDateCurrent(state, getLocalDateIso(nowMs)),
      appUsageSeconds: current,
      events: appendEvent(
        state.events,
        `AppBlock.resetDailyUsage("${packageName}")`,
        `Reset today's foreground usage counter for ${packageName}.`,
        'info',
        timestamp
      ),
    },
  };
}

export function advanceAppUsage(
  state: KioskState,
  packageName: string,
  deltaSeconds: number,
  timestamp = '08:31:27',
  nowMs = Date.now()
): KioskState {
  if (deltaSeconds <= 0) return state;
  const rolled = ensureUsageDateCurrent(state, getLocalDateIso(nowMs));
  const limitMins = (rolled.appTimeLimits ?? {})[packageName] ?? 0;
  if (limitMins <= 0) return rolled;

  const prevUsage = (rolled.appUsageSeconds ?? {})[packageName] ?? 0;
  const nextUsage = prevUsage + deltaSeconds;
  const updated: KioskState = {
    ...rolled,
    appUsageSeconds: {
      ...(rolled.appUsageSeconds ?? {}),
      [packageName]: nextUsage,
    },
  };

  const remainingAfter = getAppRemainingSeconds(updated, packageName, rolled.usageDateIso);
  if (
    remainingAfter !== null &&
    remainingAfter <= 0 &&
    !updated.adminUnlocked &&
    (updated.activeAppPackage === packageName ||
      (updated.activeScreen === 'kiosk_browser' && packageName === KIOSK_BROWSER_PACKAGE))
  ) {
    const appLabel =
      getAllInstalledApps(updated).find((a) => a.packageName === packageName)?.label ?? packageName;
    const notice = `${appLabel} (${packageName}) reached its ${limitMins}m/day limit and was suspended until tomorrow.`;
    return {
      ...updated,
      activeScreen: 'home',
      activeAppPackage: null,
      lockTaskActive: updated.isDeviceOwner,
      blockedAttemptsToday: (updated.blockedAttemptsToday ?? 0) + 1,
      blockedNotice: notice,
      events: appendEvent(
        updated.events,
        `KioskGuard.evictAndSuspend("${packageName}", ${limitMins}m/${limitMins}m)`,
        notice,
        'blocked',
        timestamp
      ),
    };
  }

  return updated;
}

export function updateDowntimeSchedule(
  state: KioskState,
  patch: Partial<DowntimeSchedule>,
  timestamp = '08:31:28',
  nowMs = Date.now()
): { nextState: KioskState; ok: boolean; error?: string } {
  const current = state.downtimeSchedule ?? DEFAULT_DOWNTIME_SCHEDULE;
  const nextSchedule: DowntimeSchedule = {
    ...current,
    ...patch,
    startHour:
      patch.startHour !== undefined
        ? Math.max(0, Math.min(23, Math.floor(patch.startHour)))
        : current.startHour,
    endHour:
      patch.endHour !== undefined
        ? Math.max(0, Math.min(23, Math.floor(patch.endHour)))
        : current.endHour,
  };

  const remainingStrictMins = getStrictShieldRemainingMinutes(state, nowMs);
  if (current.enabled && patch.enabled === false && remainingStrictMins > 0) {
    return {
      ok: false,
      error: `Strict Anti-Relapse Lock active: Quiet Hours cannot be disabled for ${remainingStrictMins}m.`,
      nextState: recordBypassAttempt(state, 'Strict Lock bypass: disable Quiet Hours', 10, timestamp, nowMs),
    };
  }

  let nextState: KioskState = {
    ...state,
    downtimeSchedule: nextSchedule,
  };

  const s = String(nextSchedule.startHour).padStart(2, '0');
  const e = String(nextSchedule.endHour).padStart(2, '0');

  if (
    isDowntimeActive(nextState, new Date(nowMs).getHours()) &&
    !nextState.adminUnlocked &&
    nextState.activeAppPackage &&
    !ESSENTIAL_FOCUS_PACKAGES.has(nextState.activeAppPackage) &&
    nextState.activeScreen !== 'home' &&
    nextState.activeScreen !== 'admin_settings' &&
    nextState.activeScreen !== 'pin_gate'
  ) {
    nextState = {
      ...nextState,
      activeScreen: 'home',
      activeAppPackage: null,
      blockedNotice: `Scheduled Quiet Hours (${s}:00–${e}:00) active: non-essential app paused.`,
    };
  }

  return {
    ok: true,
    nextState: recordAdminSettingMutation(
      {
        ...nextState,
        events: appendEvent(
          nextState.events,
          `AppBlock.setDowntimeSchedule(enabled=${nextSchedule.enabled}, ${s}:00-${e}:00)`,
          nextSchedule.enabled
            ? `Enabled Scheduled Quiet Hours (${s}:00–${e}:00${nextSchedule.simulateActiveNow ? ', simulated active now' : ''}).`
            : 'Disabled Scheduled Quiet Hours.',
          nextSchedule.enabled ? 'enforced' : 'info',
          timestamp
        ),
      },
      `downtime=${nextSchedule.enabled}`,
      timestamp,
      nowMs
    ),
  };
}

export function setFocusBlockSession(
  state: KioskState,
  minutes: number,
  timestamp = '08:31:29',
  nowMs = Date.now()
): { nextState: KioskState; ok: boolean; error?: string } {
  const remainingStrictMins = getStrictShieldRemainingMinutes(state, nowMs);
  const currentlyActive = getFocusBlockRemainingMinutes(state, nowMs) > 0;
  if (minutes <= 0 && currentlyActive && remainingStrictMins > 0) {
    return {
      ok: false,
      error: `Strict Anti-Relapse Lock active: Freedom Focus Lock cannot be cancelled for ${remainingStrictMins}m.`,
      nextState: recordBypassAttempt(state, 'Strict Lock bypass: cancel Focus Lock', 10, timestamp, nowMs),
    };
  }

  const nextUntil = minutes <= 0 ? 0 : nowMs + minutes * 60_000;
  let nextState: KioskState = {
    ...state,
    focusBlockUntilMs: nextUntil,
  };

  if (
    minutes > 0 &&
    !nextState.adminUnlocked &&
    nextState.activeAppPackage &&
    !ESSENTIAL_FOCUS_PACKAGES.has(nextState.activeAppPackage) &&
    nextState.activeScreen !== 'home' &&
    nextState.activeScreen !== 'admin_settings' &&
    nextState.activeScreen !== 'pin_gate'
  ) {
    nextState = {
      ...nextState,
      activeScreen: 'home',
      activeAppPackage: null,
      blockedNotice: `Freedom Focus Lock (${minutes}m) active: non-Focus apps paused.`,
    };
  }

  return {
    ok: true,
    nextState: {
      ...nextState,
      events: appendEvent(
        nextState.events,
        minutes <= 0
          ? 'FreedomFocusBlock.stop()'
          : `FreedomFocusBlock.start(${minutes}m)`,
        minutes <= 0
          ? 'Ended Freedom Focus Lock session.'
          : `Started ${minutes}-minute Freedom Focus Lock (blocks all non-essential apps).`,
        minutes <= 0 ? 'info' : 'enforced',
        timestamp
      ),
    },
  };
}

export function simulateDeviceReboot(
  state: KioskState,
  timestamp = '08:32:00',
  nowMs = Date.now()
): KioskState {
  const rolled = ensureUsageDateCurrent(state, getLocalDateIso(nowMs));
  const nextRebootCount = rolled.rebootCount + 1;
  const resetBase: KioskState = {
    ...rolled,
    adminUnlocked: false,
    activeScreen: 'home',
    activeAppPackage: null,
    pinGateTarget: null,
    blockedNotice: null,
    lockTaskActive: rolled.isDeviceOwner,
    rebootCount: nextRebootCount,
  };

  let afterMode: KioskState = resetBase;
  if (rolled.kioskMode === 'kiosk_browser') {
    const blockReason = getAppScheduleOrLimitBlockReason(resetBase, KIOSK_BROWSER_PACKAGE, { nowMs });
    afterMode =
      blockReason === null
        ? launchApp(resetBase, KIOSK_BROWSER_PACKAGE, timestamp, nowMs)
        : { ...resetBase, blockedNotice: blockReason };
  } else if (rolled.kioskMode === 'single_app' && rolled.singleAppPackage) {
    const blockReason = getAppScheduleOrLimitBlockReason(resetBase, rolled.singleAppPackage, { nowMs });
    afterMode =
      blockReason === null
        ? launchApp(resetBase, rolled.singleAppPackage, timestamp, nowMs)
        : { ...resetBase, blockedNotice: blockReason };
  }

  return {
    ...afterMode,
    events: appendEvent(
      afterMode.events,
      'BootCompletedReceiver.onReceive(LOCKED_BOOT_COMPLETED)',
      rolled.isDeviceOwner
        ? `Reboot #${nextRebootCount} complete (${rolled.kioskMode}): restored ${rolled.allowedPackages.length} allowed apps, ${Object.keys(rolled.appTimeLimits ?? {}).length} app time limits, BlockP shields & hardware locks.`
        : `Reboot #${nextRebootCount} complete: restored preferences cleanly.`,
      'enforced',
      timestamp
    ),
  };
}

/**
 * Emergency Panic Button Protocol:
 * Immediately kills active third-party/browser apps, wipes clipboard & WebView state,
 * engages Strict Anti-Relapse Shield Lock, and locks the screen onto the Kiosk Dashboard.
 */
export function triggerPanicLockdown(
  state: KioskState,
  durationMinutes = PANIC_RECOVERY_MINUTES,
  timestamp = '08:35:00',
  nowMs = Date.now()
): KioskState {
  const safeMins = Math.max(1, Math.round(durationMinutes));
  const nextPanicUntil = Math.max(state.panicLockUntilMs ?? 0, nowMs + safeMins * 60_000);
  const currentShields = state.blockerShields ?? DEFAULT_BLOCKER_SHIELDS;
  const nextShieldLockUntil = Math.max(
    currentShields.strictShieldLockUntilMs ?? 0,
    nowMs + safeMins * 60_000
  );
  const killedTarget = state.activeAppPackage ? `Killed ${state.activeAppPackage} & background apps` : 'Killed background external apps';
  const remainingMins = Math.ceil((nextPanicUntil - nowMs) / 60_000);
  const notice = `Emergency Panic Activated: ${killedTarget}, wiped clipboard, and locked screen to Kiosk Dashboard for ${remainingMins}m.`;

  let nextEvents = appendEvent(
    state.events,
    'ClipboardManager.clearPrimaryClip() + killBackgroundProcesses()',
    `${killedTarget}, cleared device clipboard, and scrubbed active Kiosk Browser history.`,
    'enforced',
    timestamp
  );
  nextEvents = appendEvent(
    nextEvents,
    `PanicController.lockToKioskDashboard(${remainingMins}m)`,
    notice,
    'blocked',
    timestamp
  );

  return {
    ...state,
    activeScreen: 'home',
    activeAppPackage: null,
    pinGateTarget: null,
    adminUnlocked: false,
    lockTaskActive: state.isDeviceOwner,
    browserCurrentUrl: 'about:blank',
    browserBlockedUrl: null,
    panicLockUntilMs: nextPanicUntil,
    panicCount: (state.panicCount ?? 0) + 1,
    lastClipboardWipedAt: timestamp,
    blockedAttemptsToday: (state.blockedAttemptsToday ?? 0) + 1,
    blockedNotice: notice,
    blockerShields: {
      ...currentShields,
      strictShieldLockUntilMs: nextShieldLockUntil,
    },
    events: nextEvents,
  };
}

export function clearPanicLockdown(
  state: KioskState,
  timestamp = '08:36:00'
): KioskState {
  return {
    ...state,
    panicLockUntilMs: 0,
    blockedNotice: null,
    events: appendEvent(
      state.events,
      'PanicController.clearLockdown()',
      'Cleared Emergency Panic Dashboard lock and restored allowed kiosk packages.',
      'info',
      timestamp
    ),
  };
}
