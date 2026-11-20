import {
  BlockerShieldPolicies,
  DEFAULT_BLOCKER_SHIELDS,
  DEFAULT_DOWNTIME_SCHEDULE,
  DEFAULT_HARDWARE_LOCKS,
  DowntimeSchedule,
  HardwareLockPolicies,
  KioskOperationMode,
  KioskState,
  MAX_DAILY_APP_LIMIT_MINUTES,
} from './kioskEngine';
import {
  AffirmationItem,
  FocusSessionLog,
  GoalItem,
  HabitItem,
  RichNote,
  SelfImprovementState,
  TaskItem,
} from './selfImprovementEngine';

export type SyncSourceTag = 'mobile_app' | 'web_simulator' | 'pc_web';

export interface CloudDeviceSnapshot {
  ownerId: string;
  deviceId: string;
  deviceLabel: string;
  platform: 'android' | 'web_simulator';
  isOnline: boolean;
  isDeviceOwner: boolean;
  kioskMode: KioskOperationMode;
  singleAppPackage: string;
  kioskTitle: string;
  activeScreen: string;
  lockTaskActive: boolean;
  adminPinSalt: string;
  adminPinHash: string;
  allowedPackages: string[];
  allowedDomains: string[];
  hardwareLocks: HardwareLockPolicies;
  blockerShields: BlockerShieldPolicies;
  appTimeLimits: Record<string, number>;
  appUsageSeconds: Record<string, number>;
  downtimeSchedule: DowntimeSchedule;
  focusBlockUntilMs: number;
  panicLockUntilMs: number;
  panicCount: number;
  blockedAttemptsToday: number;
  tamperWarningsCount: number;
  tamperEscalationTier: 0 | 1 | 2;
  pinLockedUntilMs: number;
  lastModifiedBy: SyncSourceTag;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CloudGrowthSnapshot {
  ownerId: string;
  profileId: string;
  cleanStreakDays: number;
  longestCleanStreakDays: number;
  lastCleanCheckInDate: string;
  cleanCheckInDates: string[];
  urgeVictories: number;
  whyIStarted: string;
  affirmations: AffirmationItem[];
  activeAffirmationIndex: number;
  lastAffirmationCommittedDate: string;
  focusSessions: FocusSessionLog[];
  habits: HabitItem[];
  tasks: TaskItem[];
  goals: GoalItem[];
  notes: RichNote[];
  lastUpdatedSource: SyncSourceTag;
  createdAt?: unknown;
  updatedAt?: unknown;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
const VALID_HEX64_REGEX = /^[a-f0-9]{64}$/;

export function sanitizeFirestoreId(raw: string, fallback = 'primary-device'): string {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  return cleaned.length > 0 && VALID_ID_REGEX.test(cleaned) ? cleaned : fallback;
}

export function generatePinSalt(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Matches Android KioskPreferences.hashPin("$salt:$pin") SHA-256 hex digest.
 */
export async function hashPinWithSalt(pin: string, salt: string): Promise<string> {
  const input = `${salt}:${pin}`;
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const encoded = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export async function verifyAdminPasscodeHash(
  candidatePin: string,
  salt: string,
  expectedHashHex: string
): Promise<boolean> {
  if (!candidatePin || candidatePin.trim().length === 0) return false;
  if (!salt || !VALID_HEX64_REGEX.test(expectedHashHex)) return false;
  const computed = await hashPinWithSalt(candidatePin, salt);
  if (computed.length !== expectedHashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i += 1) {
    diff |= computed.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
  }
  return diff === 0;
}

function clampStringList(items: string[], maxItems: number, maxLen = 160): string[] {
  return Array.from(
    new Set(
      items
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim().slice(0, maxLen))
        .filter((s) => s.length > 0)
    )
  ).slice(0, maxItems);
}

function sanitizeNumberMap(
  source: Record<string, number> | undefined,
  maxValue: number,
  maxKeys = 100
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!source) return out;
  for (const [k, v] of Object.entries(source)) {
    if (Object.keys(out).length >= maxKeys) break;
    if (typeof k === 'string' && k.trim().length > 0 && k.length <= 160 && Number.isFinite(v) && v > 0) {
      out[k] = Math.min(maxValue, Math.max(0, Math.round(v)));
    }
  }
  return out;
}

export function buildDeviceSyncPayload(params: {
  state: KioskState;
  ownerId: string;
  deviceId: string;
  deviceLabel?: string;
  platform?: 'android' | 'web_simulator';
  isOnline?: boolean;
  adminPinSalt: string;
  adminPinHash: string;
  source: SyncSourceTag;
}): CloudDeviceSnapshot {
  const {
    state,
    ownerId,
    deviceId,
    deviceLabel = 'Pixel Kiosk Mobile',
    platform = 'web_simulator',
    isOnline = true,
    adminPinSalt,
    adminPinHash,
    source,
  } = params;

  const hw = state.hardwareLocks ?? DEFAULT_HARDWARE_LOCKS;
  const bs = state.blockerShields ?? DEFAULT_BLOCKER_SHIELDS;
  const ds = state.downtimeSchedule ?? DEFAULT_DOWNTIME_SCHEDULE;

  return {
    ownerId: sanitizeFirestoreId(ownerId, 'user'),
    deviceId: sanitizeFirestoreId(deviceId, 'primary-device'),
    deviceLabel: deviceLabel.trim().slice(0, 80) || 'Pixel Kiosk Mobile',
    platform,
    isOnline: Boolean(isOnline),
    isDeviceOwner: Boolean(state.isDeviceOwner),
    kioskMode: state.kioskMode,
    singleAppPackage: (state.singleAppPackage ?? '').slice(0, 160),
    kioskTitle: (state.kioskTitle.trim() || 'Kiosk Home').slice(0, 80),
    activeScreen: state.activeScreen.slice(0, 40),
    lockTaskActive: Boolean(state.lockTaskActive),
    adminPinSalt: adminPinSalt.slice(0, 64),
    adminPinHash: adminPinHash.slice(0, 64).toLowerCase(),
    allowedPackages: clampStringList(state.allowedPackages, 120),
    allowedDomains: clampStringList(state.allowedDomains, 120),
    hardwareLocks: {
      statusBarDisabled: Boolean(hw.statusBarDisabled),
      keyguardDisabled: Boolean(hw.keyguardDisabled),
      cameraDisabled: Boolean(hw.cameraDisabled),
      usbTransferBlocked: Boolean(hw.usbTransferBlocked),
      dateTimeLocked: Boolean(hw.dateTimeLocked),
      screenCaptureDisabled: Boolean(hw.screenCaptureDisabled),
      keepScreenAwake: Boolean(hw.keepScreenAwake),
    },
    blockerShields: {
      disablePornOnBrowsers: Boolean(bs.disablePornOnBrowsers),
      blockInAppBrowsers: Boolean(bs.blockInAppBrowsers),
      inAppBrowserWhitelist: clampStringList(bs.inAppBrowserWhitelist, 60),
      blockUnsupportedBrowsers: Boolean(bs.blockUnsupportedBrowsers),
      blockShortFormFeeds: Boolean(bs.blockShortFormFeeds),
      familyDnsMode: bs.familyDnsMode,
      blockedKeywords: clampStringList(bs.blockedKeywords, 100),
      strictShieldLockUntilMs: Math.max(0, Math.floor(bs.strictShieldLockUntilMs ?? 0)),
    },
    appTimeLimits: sanitizeNumberMap(state.appTimeLimits, MAX_DAILY_APP_LIMIT_MINUTES, 100),
    appUsageSeconds: sanitizeNumberMap(state.appUsageSeconds, 86400, 100),
    downtimeSchedule: {
      enabled: Boolean(ds.enabled),
      startHour: Math.max(0, Math.min(23, Math.floor(ds.startHour))),
      endHour: Math.max(0, Math.min(23, Math.floor(ds.endHour))),
      simulateActiveNow: Boolean(ds.simulateActiveNow),
    },
    focusBlockUntilMs: Math.max(0, Math.floor(state.focusBlockUntilMs ?? 0)),
    panicLockUntilMs: Math.max(0, Math.floor(state.panicLockUntilMs ?? 0)),
    panicCount: Math.max(0, Math.min(100000, Math.floor(state.panicCount ?? 0))),
    blockedAttemptsToday: Math.max(0, Math.min(100000, Math.floor(state.blockedAttemptsToday ?? 0))),
    tamperWarningsCount: Math.max(0, Math.min(100000, Math.floor(state.tamperWarningsCount ?? 0))),
    tamperEscalationTier:
      state.tamperEscalationTier === 1 || state.tamperEscalationTier === 2
        ? state.tamperEscalationTier
        : 0,
    pinLockedUntilMs: Math.max(0, Math.floor(state.pinLockedUntilMs ?? 0)),
    lastModifiedBy: source,
  };
}

export function buildGrowthSyncPayload(params: {
  growth: SelfImprovementState;
  ownerId: string;
  profileId?: string;
  source: SyncSourceTag;
}): CloudGrowthSnapshot {
  const { growth, ownerId, profileId = 'main', source } = params;
  return {
    ownerId: sanitizeFirestoreId(ownerId, 'user'),
    profileId: sanitizeFirestoreId(profileId, 'main'),
    cleanStreakDays: Math.max(0, Math.min(36500, Math.floor(growth.cleanStreakDays))),
    longestCleanStreakDays: Math.max(0, Math.min(36500, Math.floor(growth.longestCleanStreakDays))),
    lastCleanCheckInDate: (growth.lastCleanCheckInDate ?? '').slice(0, 20),
    cleanCheckInDates: clampStringList(growth.cleanCheckInDates, 400, 20),
    urgeVictories: Math.max(0, Math.min(1_000_000, Math.floor(growth.urgeVictories))),
    whyIStarted: growth.whyIStarted.slice(0, 2000),
    affirmations: growth.affirmations.slice(0, 80),
    activeAffirmationIndex: Math.max(0, Math.min(1000, Math.floor(growth.activeAffirmationIndex))),
    lastAffirmationCommittedDate: (growth.lastAffirmationCommittedDate ?? '').slice(0, 20),
    focusSessions: growth.focusSessions.slice(0, 200),
    habits: growth.habits.slice(0, 80),
    tasks: growth.tasks.slice(0, 150),
    goals: growth.goals.slice(0, 50),
    notes: growth.notes.slice(0, 100),
    lastUpdatedSource: source,
  };
}

export function applyRemoteDeviceToKioskState(
  localState: KioskState,
  remote: CloudDeviceSnapshot,
  optionalNewPlainPin?: string
): KioskState {
  return {
    ...localState,
    adminPin: optionalNewPlainPin ? optionalNewPlainPin : localState.adminPin,
    kioskMode: remote.kioskMode,
    singleAppPackage: remote.singleAppPackage ? remote.singleAppPackage : null,
    kioskTitle: remote.kioskTitle,
    allowedPackages: [...remote.allowedPackages],
    allowedDomains: [...remote.allowedDomains],
    hardwareLocks: { ...remote.hardwareLocks },
    blockerShields: {
      ...remote.blockerShields,
      inAppBrowserWhitelist: [...remote.blockerShields.inAppBrowserWhitelist],
      blockedKeywords: [...remote.blockerShields.blockedKeywords],
    },
    appTimeLimits: { ...remote.appTimeLimits },
    appUsageSeconds: { ...remote.appUsageSeconds },
    downtimeSchedule: { ...remote.downtimeSchedule },
    focusBlockUntilMs: remote.focusBlockUntilMs,
    panicLockUntilMs: remote.panicLockUntilMs,
    tamperWarningsCount: remote.tamperWarningsCount,
    tamperEscalationTier: remote.tamperEscalationTier,
    pinLockedUntilMs: remote.pinLockedUntilMs,
    blockedNotice:
      remote.lastModifiedBy === 'pc_web'
        ? 'Applied password-authorized Admin Settings update from PC Web Remote.'
        : localState.blockedNotice,
  };
}

export function applyRemoteGrowthToLocalState(
  localGrowth: SelfImprovementState,
  remote: CloudGrowthSnapshot
): SelfImprovementState {
  return {
    ...localGrowth,
    cleanStreakDays: remote.cleanStreakDays,
    longestCleanStreakDays: remote.longestCleanStreakDays,
    lastCleanCheckInDate: remote.lastCleanCheckInDate || null,
    cleanCheckInDates: [...remote.cleanCheckInDates],
    urgeVictories: remote.urgeVictories,
    whyIStarted: remote.whyIStarted,
    affirmations: remote.affirmations.length > 0 ? [...remote.affirmations] : localGrowth.affirmations,
    activeAffirmationIndex: remote.activeAffirmationIndex,
    lastAffirmationCommittedDate: remote.lastAffirmationCommittedDate || null,
    focusSessions: [...remote.focusSessions],
    habits: [...remote.habits],
    tasks: [...remote.tasks],
    goals: [...remote.goals],
    notes: [...remote.notes],
  };
}
