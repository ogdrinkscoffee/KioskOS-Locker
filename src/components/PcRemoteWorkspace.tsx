import React, { useState } from 'react';
import {
  Check,
  Cloud,
  CloudOff,
  Copy,
  Flame,
  KeyRound,
  Laptop,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Unlock,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  BlockerShieldToggleKey,
  DowntimeSchedule,
  FamilyDnsMode,
  KioskOperationMode,
  KioskState,
  MAX_ADMIN_PIN_LENGTH,
  getAllInstalledApps,
  getAppRemainingSeconds,
  getFocusBlockRemainingMinutes,
  getPanicLockRemainingMinutes,
  getPinLockoutRemainingSeconds,
  getStrictShieldRemainingMinutes,
} from '../utils/kioskEngine';
import {
  SelfImprovementState,
  formatIsoDate,
  getTodayFocusSummary,
} from '../utils/selfImprovementEngine';
import { CloudDeviceSnapshot, verifyAdminPasscodeHash } from '../utils/cloudSyncEngine';
import { User, firebaseConfig } from '../firebase';

interface PcRemoteWorkspaceProps {
  user: User | null;
  authLoading: boolean;
  authError: string | null;
  isOnline: boolean;
  cloudConnected: boolean;
  syncBusy: boolean;
  lastSyncedAt: string | null;
  pendingOfflineSync: boolean;
  syncError: string | null;
  syncedDevices: CloudDeviceSnapshot[];
  selectedDeviceId: string;
  remoteDevice: CloudDeviceSnapshot | null;
  localKioskState: KioskState;
  selfImprovement: SelfImprovementState;
  onSelectDeviceId: (deviceId: string) => void;
  onSignInGoogle: () => Promise<void>;
  onSignOutGoogle: () => Promise<void>;
  onSyncNow: () => Promise<void>;
  onRemoteUpdateSettings: (
    updater: (current: KioskState) => KioskState,
    options?: { clearPinLockout?: boolean; newPlainPin?: string }
  ) => Promise<{ ok: boolean; error?: string }>;
  onToggleHabitToday: (habitId: string) => void;
  onLogCleanDay: () => void;
  onLogUrgeVictory: () => void;
  onOpenSelfImprovementTab: () => void;
}

const SHIELD_TOGGLES: { key: BlockerShieldToggleKey; label: string; detail: string }[] = [
  {
    key: 'disablePornOnBrowsers',
    label: 'Disable Porn on Browsers',
    detail: 'SafeSearch + Strict YouTube + Block Incognito',
  },
  {
    key: 'blockInAppBrowsers',
    label: 'Block In-App Browsers (Except Whitelist)',
    detail: 'Intercepts WebView / CustomTabs inside apps',
  },
  {
    key: 'blockUnsupportedBrowsers',
    label: 'Block Unsupported Browsers',
    detail: 'Suspends Firefox, Brave, Opera, DuckDuckGo, Tor',
  },
  {
    key: 'blockShortFormFeeds',
    label: 'Block Short-Form Feeds',
    detail: 'Blocks YouTube Shorts, Reels & TikTok feeds',
  },
];

export const PcRemoteWorkspace: React.FC<PcRemoteWorkspaceProps> = ({
  user,
  authLoading,
  authError,
  isOnline,
  cloudConnected,
  syncBusy,
  lastSyncedAt,
  pendingOfflineSync,
  syncError,
  syncedDevices,
  selectedDeviceId,
  remoteDevice,
  localKioskState,
  selfImprovement,
  onSelectDeviceId,
  onSignInGoogle,
  onSignOutGoogle,
  onSyncNow,
  onRemoteUpdateSettings,
  onToggleHabitToday,
  onLogCleanDay,
  onLogUrgeVictory,
  onOpenSelfImprovementTab,
}) => {
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [remoteAdminUnlocked, setRemoteAdminUnlocked] = useState(false);
  const [failedVerifyCount, setFailedVerifyCount] = useState(0);
  const [remoteVerifyCooldownUntil, setRemoteVerifyCooldownUntil] = useState(0);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [newPinDraft, setNewPinDraft] = useState('');
  const [confirmPinDraft, setConfirmPinDraft] = useState('');
  const [titleDraft, setTitleDraft] = useState(remoteDevice?.kioskTitle ?? localKioskState.kioskTitle);

  const today = formatIsoDate();
  const focusSummary = getTodayFocusSummary(selfImprovement, today);

  // Use live synced device telemetry if signed in and available; otherwise show clean status preview notice
  const activeStatusSource = remoteDevice;
  const effectiveKioskForReadout: KioskState = activeStatusSource
    ? {
        ...localKioskState,
        isDeviceOwner: activeStatusSource.isDeviceOwner,
        kioskMode: activeStatusSource.kioskMode,
        singleAppPackage: activeStatusSource.singleAppPackage || null,
        kioskTitle: activeStatusSource.kioskTitle,
        activeScreen: (activeStatusSource.activeScreen as KioskState['activeScreen']) || 'home',
        lockTaskActive: activeStatusSource.lockTaskActive,
        allowedPackages: activeStatusSource.allowedPackages,
        allowedDomains: activeStatusSource.allowedDomains,
        hardwareLocks: activeStatusSource.hardwareLocks,
        blockerShields: activeStatusSource.blockerShields,
        appTimeLimits: activeStatusSource.appTimeLimits,
        appUsageSeconds: activeStatusSource.appUsageSeconds,
        downtimeSchedule: activeStatusSource.downtimeSchedule,
        focusBlockUntilMs: activeStatusSource.focusBlockUntilMs,
        panicLockUntilMs: activeStatusSource.panicLockUntilMs,
        panicCount: activeStatusSource.panicCount,
        blockedAttemptsToday: activeStatusSource.blockedAttemptsToday,
        tamperWarningsCount: activeStatusSource.tamperWarningsCount,
        tamperEscalationTier: activeStatusSource.tamperEscalationTier,
        pinLockedUntilMs: activeStatusSource.pinLockedUntilMs,
      }
    : localKioskState;

  const panicMinsLeft = getPanicLockRemainingMinutes(effectiveKioskForReadout);
  const focusMinsLeft = getFocusBlockRemainingMinutes(effectiveKioskForReadout);
  const strictMinsLeft = getStrictShieldRemainingMinutes(effectiveKioskForReadout);
  const pinLockoutSecs = getPinLockoutRemainingSeconds(effectiveKioskForReadout);
  const shieldsCount = SHIELD_TOGGLES.filter(
    (s) => effectiveKioskForReadout.blockerShields[s.key]
  ).length;
  const allInstalledApps = getAllInstalledApps(effectiveKioskForReadout).filter(
    (a) => !a.isSystemRestricted
  );

  const copyText = (key: string, value: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(value).catch(() => {});
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    }
  };

  const handleUnlockRemoteAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = Date.now();
    if (remoteVerifyCooldownUntil > now) {
      const secs = Math.ceil((remoteVerifyCooldownUntil - now) / 1000);
      setPasswordError(`Too many wrong passwords. Wait ${secs}s before retrying.`);
      return;
    }

    if (!remoteDevice) {
      setPasswordError('No synced mobile device record found yet. Click Sync Device Now first.');
      return;
    }

    const ok = await verifyAdminPasscodeHash(
      adminPasswordInput,
      remoteDevice.adminPinSalt,
      remoteDevice.adminPinHash
    );

    if (ok) {
      setRemoteAdminUnlocked(true);
      setFailedVerifyCount(0);
      setRemoteVerifyCooldownUntil(0);
      setPasswordError(null);
      setAdminPasswordInput('');
      setTitleDraft(remoteDevice.kioskTitle);
      setActionFeedback({
        type: 'ok',
        text: 'Admin Password verified. Remote settings unlocked for troubleshooting.',
      });
    } else {
      const nextFails = failedVerifyCount + 1;
      if (nextFails >= 5) {
        setFailedVerifyCount(0);
        setRemoteVerifyCooldownUntil(now + 30_000);
        setPasswordError('Too many failed attempts. Remote Admin Gate locked for 30s.');
      } else {
        setFailedVerifyCount(nextFails);
        setPasswordError(`Incorrect Admin Password (${nextFails}/5 attempts).`);
      }
      setAdminPasswordInput('');
    }
  };

  const applySettingAction = async (
    updater: (curr: KioskState) => KioskState,
    successMsg: string,
    options?: { clearPinLockout?: boolean; newPlainPin?: string }
  ) => {
    const res = await onRemoteUpdateSettings(updater, options);
    if (res.ok) {
      setActionFeedback({ type: 'ok', text: successMsg });
    } else {
      setActionFeedback({ type: 'error', text: res.error ?? 'Failed to apply remote update.' });
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Account & Offline-First Guarantee Header */}
      <section className="surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Laptop className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" aria-hidden="true" />
              <h2 className="text-base font-semibold tracking-tight">
                PC Web Dashboard &amp; Cross-Device Sync
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
              Check your mobile kiosk status and track your self-improvement progress from any PC browser.
              Mobile apps and kiosk lock rules remain <strong>100% functional offline</strong> and{' '}
              <strong>never require an account</strong> to run.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 shrink-0">
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  <span>Offline (Local Safe)</span>
                </>
              )}
            </span>

            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => void onSyncNow()}
                  disabled={syncBusy || !isOnline}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${syncBusy ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>{syncBusy ? 'Syncing...' : 'Sync Now'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRemoteAdminUnlocked(false);
                    void onSignOutGoogle();
                  }}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                data-testid="pc-google-signin-button"
                disabled={authLoading}
                onClick={() => void onSignInGoogle()}
                className="min-h-[40px] max-w-full px-3.5 sm:px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="sm:hidden">
                  {authLoading ? 'Checking...' : 'Sign In with Google'}
                </span>
                <span className="hidden sm:inline">
                  {authLoading ? 'Checking Account...' : 'Create Account / Sign In with Google'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Account & Sync Bar */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {user ? (
            <div className="flex flex-wrap items-center gap-3 text-slate-700 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
                <Cloud
                  className={`w-4 h-4 ${cloudConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}
                  aria-hidden="true"
                />
                <span>{user.email}</span>
              </span>
              <span className="text-slate-400 dark:text-slate-600" aria-hidden="true">·</span>
              <span className="tabular-nums text-slate-600 dark:text-slate-400">
                {pendingOfflineSync
                  ? 'Offline changes queued — will sync automatically when online'
                  : lastSyncedAt
                  ? `Last synced ${lastSyncedAt}`
                  : 'Connected to Cloud Sync'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <CloudOff className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden="true" />
              <span>
                Standalone Offline Mode active — sign in with Google above to sync with your PC and access remote recovery.
              </span>
            </div>
          )}

          {user && syncedDevices.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="pc-device-select" className="text-xs text-slate-600 dark:text-slate-400">
                Device:
              </label>
              <select
                id="pc-device-select"
                value={selectedDeviceId}
                onChange={(e) => {
                  setRemoteAdminUnlocked(false);
                  onSelectDeviceId(e.target.value);
                }}
                className="h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-800 dark:text-slate-100"
              >
                {syncedDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.deviceLabel} ({d.platform === 'android' ? 'Android APK' : 'Simulator'})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {(authError || syncError) && (
          <div
            role="alert"
            className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200 flex items-start gap-2"
          >
            <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{authError ?? syncError}</span>
          </div>
        )}
      </section>

      {!user ? (
        /* Signed-Out / Local Preview Card */
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="surface p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Smartphone className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              <span>Local Mobile Status (Offline-Ready Preview)</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Right now you are viewing this device&apos;s local offline state without an account. Create
              or sign in to a Google account above to view &amp; manage this phone remotely from any PC.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-slate-600 dark:text-slate-400">Kiosk Mode</div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {localKioskState.kioskMode === 'single_app'
                    ? 'Single-App'
                    : localKioskState.kioskMode === 'kiosk_browser'
                    ? 'Locked Browser'
                    : 'Multi-App HOME'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-slate-600 dark:text-slate-400">Protection Shields</div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                  {shieldsCount} / 4 Enforced
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-slate-600 dark:text-slate-400">Clean Streak</div>
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                  {selfImprovement.cleanStreakDays} Days
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-slate-600 dark:text-slate-400">Offline Guarantee</div>
                <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mt-1">100% Local Ready</div>
              </div>
            </div>
          </div>

          <div className="surface p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Lock className="w-4 h-4 text-slate-700 dark:text-slate-300" aria-hidden="true" />
              <span>How PC Web Remote + Password Lock Works</span>
            </div>
            <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>Account Sync:</strong> Sign in with Google on PC Web (and optionally enable PC Cloud
                  Sync inside your Android APK Admin Settings) to sync progress and phone telemetry.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>No Password Required to Check Progress:</strong> View phone lock state, blocked
                  attempts, clean streak, focus sessions, and daily habits right from your PC.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>Admin Password Gate for Settings:</strong> Modifying apps, DNS shields, time limits,
                  or clearing emergency lockouts on PC requires your phone&apos;s salted Admin Password.
                </span>
              </li>
            </ul>
          </div>
        </section>
      ) : (
        <>
          {/* Section 1: Live Phone Status Telemetry */}
          <section className="surface p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  <span>
                    Phone Status: {remoteDevice?.deviceLabel ?? 'Simulator Device'}
                  </span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Live Device Owner telemetry synced under your account. View-only status requires no Admin Password.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                {remoteDevice
                  ? `Last write: ${remoteDevice.lastModifiedBy}`
                  : 'Initializing first cloud sync...'}
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Device Owner &amp; Mode</div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {effectiveKioskForReadout.isDeviceOwner ? 'DO Enforced' : 'Standard Mode'}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                  {effectiveKioskForReadout.kioskMode === 'single_app'
                    ? 'Single-App Lock'
                    : effectiveKioskForReadout.kioskMode === 'kiosk_browser'
                    ? 'Locked Kiosk Browser'
                    : 'Multi-App Kiosk HOME'}
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">BlockP &amp; DNS Shields</div>
                <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-1 tabular-nums">
                  {shieldsCount} / 4 Active
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                  DNS: {effectiveKioskForReadout.blockerShields.familyDnsMode}
                  {strictMinsLeft > 0 ? ` · Strict ${strictMinsLeft}m` : ''}
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Emergency Panic &amp; Focus</div>
                <div
                  className={`text-sm font-bold mt-1 tabular-nums ${
                    panicMinsLeft > 0 ? 'text-red-700 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {panicMinsLeft > 0
                    ? `Panic Lock (${panicMinsLeft}m)`
                    : focusMinsLeft > 0
                    ? `Focus Lock (${focusMinsLeft}m)`
                    : 'Normal Dashboard'}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 tabular-nums">
                  Panic count: {effectiveKioskForReadout.panicCount} · Apps:{' '}
                  {effectiveKioskForReadout.allowedPackages.length}
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Security &amp; Tamper</div>
                <div
                  className={`text-sm font-bold mt-1 tabular-nums ${
                    effectiveKioskForReadout.tamperWarningsCount > 0 || pinLockoutSecs > 0
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {pinLockoutSecs > 0
                    ? `PIN Locked (${pinLockoutSecs}s)`
                    : `${effectiveKioskForReadout.tamperWarningsCount} Warnings`}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 tabular-nums">
                  Blocked today: {effectiveKioskForReadout.blockedAttemptsToday} · Tier{' '}
                  {effectiveKioskForReadout.tamperEscalationTier}
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Synced Self-Improvement Tracker */}
          <section className="surface p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2">
                  <Flame className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  <span>Self-Improvement Sync (PC &harr; Mobile)</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Log clean days, urge victories, and habit completions from PC — synced automatically with mobile.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenSelfImprovementTab}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap"
              >
                Open Full Analytics &amp; Notes
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Clean Recovery Streak</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                    {selfImprovement.cleanStreakDays} Days
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 tabular-nums">
                    Best: {selfImprovement.longestCleanStreakDays}d · {selfImprovement.urgeVictories}{' '}
                    urges resisted
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onLogCleanDay}
                    disabled={selfImprovement.lastCleanCheckInDate === today}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 disabled:bg-emerald-700 dark:disabled:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
                  >
                    {selfImprovement.lastCleanCheckInDate === today ? 'Logged Today' : '+1 Clean Day'}
                  </button>
                  <button
                    type="button"
                    onClick={onLogUrgeVictory}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap"
                  >
                    +Urge Resisted
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 md:col-span-2 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Today&apos;s Habits ({selfImprovement.habits.filter((h) => h.completedDates.includes(today)).length}/
                    {selfImprovement.habits.length})
                  </span>
                  <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                    Focus today: {focusSummary.minutes}m ({focusSummary.sessions} sessions)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selfImprovement.habits.slice(0, 6).map((habit) => {
                    const done = habit.completedDates.includes(today);
                    return (
                      <button
                        key={habit.id}
                        type="button"
                        onClick={() => onToggleHabitToday(habit.id)}
                        className={`p-2.5 rounded-lg border text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                          done
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate font-medium">{habit.title}</span>
                        <span
                          className={`text-[11px] font-semibold shrink-0 ${
                            done ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {done ? 'Done' : 'Pending'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Section 3: Password-Gated Remote Admin Settings */}
          <section className="surface p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2">
                  {remoteAdminUnlocked ? (
                    <Unlock className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  ) : (
                    <Lock className="w-4 h-4 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                  )}
                  <span>Remote Admin Settings (Password Protected)</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Change kiosk modes, unblock apps, troubleshoot mobile lockouts, or update shields — ONLY with your device Admin Password.
                </p>
              </div>
              {remoteAdminUnlocked && (
                <button
                  type="button"
                  onClick={() => {
                    setRemoteAdminUnlocked(false);
                    setActionFeedback(null);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap"
                >
                  Lock Admin Panel
                </button>
              )}
            </div>

            {!remoteAdminUnlocked ? (
              <form
                onSubmit={(e) => void handleUnlockRemoteAdmin(e)}
                data-testid="pc-admin-password-gate"
                className="max-w-md space-y-3"
              >
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  Enter the device&apos;s Admin Password (default <code className="font-mono font-semibold">1234</code>{' '}
                  unless changed on phone) verified via salted SHA-256 hash:
                </p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <KeyRound
                      className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      type="password"
                      aria-label="Remote Admin Password"
                      data-testid="pc-admin-password-input"
                      maxLength={MAX_ADMIN_PIN_LENGTH}
                      value={adminPasswordInput}
                      onChange={(e) => {
                        setPasswordError(null);
                        setAdminPasswordInput(e.target.value);
                      }}
                      placeholder="Enter Admin Password (4–50 chars)"
                      className="w-full h-10 pl-8 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono text-xs focus:outline-2 focus:outline-sky-600"
                    />
                  </div>
                  <button
                    type="submit"
                    data-testid="pc-admin-unlock-button"
                    className="h-10 px-4 rounded-lg bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    Unlock Settings
                  </button>
                </div>
                {passwordError && (
                  <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
                    {passwordError}
                  </p>
                )}
              </form>
            ) : (
              <div data-testid="pc-remote-admin-panel" className="space-y-5">
                {actionFeedback && (
                  <div
                    role="status"
                    className={`p-3 rounded-lg border text-xs font-medium flex items-center justify-between gap-2 ${
                      actionFeedback.type === 'ok'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                        : 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
                    }`}
                  >
                    <span>{actionFeedback.text}</span>
                    <button
                      type="button"
                      onClick={() => setActionFeedback(null)}
                      className="font-semibold px-1.5 shrink-0"
                    >
                      Close
                    </button>
                  </div>
                )}

                {/* Troubleshooting & Recovery Actions */}
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2.5">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Mobile Issue Recovery &amp; Emergency Overrides
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid="pc-clear-panic-button"
                      onClick={() =>
                        void applySettingAction(
                          (curr) => ({ ...curr, panicLockUntilMs: 0, blockedNotice: null }),
                          'Cleared Emergency Panic Lock remotely.'
                        )
                      }
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap"
                    >
                      Clear Panic Lock {panicMinsLeft > 0 ? `(${panicMinsLeft}m)` : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void applySettingAction(
                          (curr) => ({ ...curr, focusBlockUntilMs: 0 }),
                          'Ended Freedom Focus Lock remotely.'
                        )
                      }
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap"
                    >
                      End Focus Lock {focusMinsLeft > 0 ? `(${focusMinsLeft}m)` : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void applySettingAction(
                          (curr) => ({
                            ...curr,
                            pinLockedUntilMs: 0,
                            failedPinAttempts: 0,
                            tamperEscalationTier: 0,
                          }),
                          'Cleared Tamper / PIN Lockout cooldown remotely.',
                          { clearPinLockout: true }
                        )
                      }
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap"
                    >
                      Clear Tamper Lockout
                    </button>
                  </div>
                </div>

                {/* Boot Mode & Title */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Kiosk Operation Mode</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: 'multi_app', label: 'Multi-App HOME' },
                          { id: 'single_app', label: 'Single-App' },
                          { id: 'kiosk_browser', label: 'Browser Only' },
                        ] as const
                      ).map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() =>
                            void applySettingAction(
                              (curr) => ({ ...curr, kioskMode: mode.id }),
                              `Switched remote kiosk boot mode to ${mode.label}.`
                            )
                          }
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap ${
                            effectiveKioskForReadout.kioskMode === mode.id
                              ? 'bg-sky-600 border-sky-600 text-white'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const clean = titleDraft.trim() || 'Kiosk Home';
                      void applySettingAction(
                        (curr) => ({ ...curr, kioskTitle: clean }),
                        `Updated phone Kiosk Header Title to "${clean}".`
                      );
                    }}
                    className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5"
                  >
                    <label htmlFor="pc-kiosk-title" className="block text-xs font-bold text-slate-900 dark:text-slate-100">
                      Kiosk Dashboard Header Title
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="pc-kiosk-title"
                        type="text"
                        maxLength={80}
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        className="flex-1 h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                      />
                      <button
                        type="submit"
                        className="h-9 px-3 rounded-lg bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 text-white text-xs font-semibold whitespace-nowrap"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                </div>

                {/* BlockP Shields & Family DNS */}
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Porn, In-App Browser &amp; Family DNS Shields
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'cloudflare', label: '1.1.1.3 Family' },
                          { id: 'cleanbrowsing', label: 'CleanBrowsing' },
                          { id: 'off', label: 'DNS Off' },
                        ] as const
                      ).map((dns) => (
                        <button
                          key={dns.id}
                          type="button"
                          onClick={() => {
                            if (dns.id === 'off' && strictMinsLeft > 0) {
                              setActionFeedback({
                                type: 'error',
                                text: `Strict Anti-Relapse Lock active (${strictMinsLeft}m left) — DNS cannot be turned off.`,
                              });
                              return;
                            }
                            void applySettingAction(
                              (curr) => ({
                                ...curr,
                                blockerShields: {
                                  ...curr.blockerShields,
                                  familyDnsMode: dns.id as FamilyDnsMode,
                                },
                              }),
                              `Set Family DNS mode to ${dns.label}.`
                            );
                          }}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-semibold whitespace-nowrap ${
                            effectiveKioskForReadout.blockerShields.familyDnsMode === dns.id
                              ? 'bg-slate-900 dark:bg-sky-600 border-slate-900 dark:border-sky-500 text-white'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                          }`}
                        >
                          {dns.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {SHIELD_TOGGLES.map((shield) => {
                      const active = effectiveKioskForReadout.blockerShields[shield.key];
                      return (
                        <div
                          key={shield.key}
                          className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {shield.label}
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">{shield.detail}</div>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={active}
                            onClick={() => {
                              if (active && strictMinsLeft > 0) {
                                setActionFeedback({
                                  type: 'error',
                                  text: `Strict Anti-Relapse Lock active (${strictMinsLeft}m left).`,
                                });
                                return;
                              }
                              void applySettingAction(
                                (curr) => ({
                                  ...curr,
                                  blockerShields: {
                                    ...curr.blockerShields,
                                    [shield.key]: !active,
                                  },
                                }),
                                `${shield.label} ${!active ? 'enabled' : 'disabled'} remotely.`
                              );
                            }}
                            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold shrink-0 whitespace-nowrap ${
                              active
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {active ? 'On' : 'Off'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Allowed Apps & Per-App Limits */}
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Allowed Apps &amp; Daily Time Caps
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {allInstalledApps.map((app) => {
                      const allowed = effectiveKioskForReadout.allowedPackages.includes(app.packageName);
                      const limitMins = effectiveKioskForReadout.appTimeLimits[app.packageName] ?? 0;
                      const remSec = getAppRemainingSeconds(effectiveKioskForReadout, app.packageName);
                      return (
                        <div
                          key={app.packageName}
                          className="py-2 flex flex-wrap items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{app.label}</div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              {app.packageName}
                              {remSec !== null ? ` · ${Math.ceil(remSec / 60)}m left today` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <select
                              aria-label={`Remote daily limit for ${app.label}`}
                              value={limitMins}
                              onChange={(e) => {
                                const nextMins = Number.parseInt(e.target.value, 10);
                                if (strictMinsLeft > 0 && limitMins > 0 && (nextMins === 0 || nextMins > limitMins)) {
                                  setActionFeedback({
                                    type: 'error',
                                    text: `Strict Anti-Relapse Lock prevents raising or removing limits for ${strictMinsLeft}m.`,
                                  });
                                  return;
                                }
                                void applySettingAction((curr) => {
                                  const nextLimits = { ...curr.appTimeLimits };
                                  if (nextMins <= 0) delete nextLimits[app.packageName];
                                  else nextLimits[app.packageName] = nextMins;
                                  return { ...curr, appTimeLimits: nextLimits };
                                }, `Updated ${app.label} daily cap to ${nextMins > 0 ? `${nextMins}m` : 'Unlimited'}.`);
                              }}
                              className="h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs font-mono"
                            >
                              <option value={0}>Unlimited</option>
                              <option value={5}>5m/day</option>
                              <option value={15}>15m/day</option>
                              <option value={30}>30m/day</option>
                              <option value={60}>60m/day</option>
                              <option value={120}>120m/day</option>
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                void applySettingAction(
                                  (curr) => ({
                                    ...curr,
                                    allowedPackages: allowed
                                      ? curr.allowedPackages.filter((p) => p !== app.packageName)
                                      : [...curr.allowedPackages, app.packageName],
                                  }),
                                  `${allowed ? 'Removed' : 'Added'} ${app.label} on Kiosk Home.`
                                )
                              }
                              className={`min-w-[74px] h-8 px-2.5 rounded-lg border text-xs font-semibold whitespace-nowrap ${
                                allowed
                                  ? 'bg-sky-600 border-sky-600 text-white'
                                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {allowed ? 'Allowed' : 'Hidden'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Change Admin Password Remotely */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newPinDraft.length < 4 || newPinDraft.length > MAX_ADMIN_PIN_LENGTH || newPinDraft.trim().length === 0) {
                      setActionFeedback({
                        type: 'error',
                        text: 'New Admin Password must be 4 to 50 non-blank characters.',
                      });
                      return;
                    }
                    if (newPinDraft !== confirmPinDraft) {
                      setActionFeedback({ type: 'error', text: 'New password confirmation does not match.' });
                      return;
                    }
                    const nextPin = newPinDraft;
                    setNewPinDraft('');
                    setConfirmPinDraft('');
                    void applySettingAction(
                      (curr) => ({ ...curr, adminPin: nextPin }),
                      `Updated device Admin Password (${nextPin.length} chars) & rotated salted hash.`,
                      { newPlainPin: nextPin }
                    );
                  }}
                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5"
                >
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Rotate Device Admin Password (4–50 chars)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="password"
                      maxLength={MAX_ADMIN_PIN_LENGTH}
                      value={newPinDraft}
                      onChange={(e) => setNewPinDraft(e.target.value)}
                      placeholder="New password (4–50 chars)"
                      className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono text-xs"
                    />
                    <input
                      type="password"
                      maxLength={MAX_ADMIN_PIN_LENGTH}
                      value={confirmPinDraft}
                      onChange={(e) => setConfirmPinDraft(e.target.value)}
                      placeholder="Confirm password"
                      className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono text-xs"
                    />
                    <button
                      type="submit"
                      className="h-9 px-4 rounded-lg bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 text-white text-xs font-semibold whitespace-nowrap"
                    >
                      Save New Password
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>

          {/* Section 4: Pair Physical Android APK */}
          <section className="surface p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>Android APK Cloud Sync Credentials (Optional Pairing)</span>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Offline-First REST Sync</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              In your Android Kiosk Launcher, open <strong>Admin Settings &rarr; PC Cloud Sync</strong> to link your
              physical phone using this Firebase Project &amp; Database. Your phone continues working identically when offline.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {[
                { key: 'uid', label: 'Account UID', val: user.uid, display: user.uid },
                {
                  key: 'token',
                  label: 'Sync Refresh Token (Secret)',
                  val: user.refreshToken || '',
                  display: user.refreshToken ? '••••••••••••••••••••' : 'Unavailable',
                },
                {
                  key: 'proj',
                  label: 'Firebase Project ID',
                  val: firebaseConfig.projectId,
                  display: firebaseConfig.projectId,
                },
                {
                  key: 'db',
                  label: 'Firestore Database ID',
                  val: firebaseConfig.firestoreDatabaseId,
                  display: firebaseConfig.firestoreDatabaseId,
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{item.label}</div>
                    <div className="font-mono text-[11px] text-slate-900 dark:text-slate-100 truncate mt-0.5">
                      {item.display}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!item.val}
                    onClick={() => copyText(item.key, item.val)}
                    className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 text-[11px] font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 shrink-0"
                  >
                    <Copy className="w-3 h-3" aria-hidden="true" />
                    <span>{copiedKey === item.key ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
