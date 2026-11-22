import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Timer,
  Unlock,
} from 'lucide-react';
import {
  BLOCKED_DISTRACTION_DOMAINS,
  BlockerShieldToggleKey,
  DEFAULT_BLOCKER_SHIELDS,
  DEFAULT_DOWNTIME_SCHEDULE,
  DEFAULT_HARDWARE_LOCKS,
  DISTRUST_TIER1_THRESHOLD,
  DISTRUST_TIER2_THRESHOLD,
  DowntimeSchedule,
  FamilyDnsMode,
  HardwareLockPolicyKey,
  KIOSK_BROWSER_PACKAGE,
  KioskOperationMode,
  KioskState,
  RestrictionKey,
  UNSUPPORTED_BROWSER_PACKAGES,
  getAllInstalledApps,
  getAppRemainingSeconds,
  getEnforcedRestrictions,
  getFocusBlockRemainingMinutes,
  getLockTaskWhitelist,
  getPanicLockRemainingMinutes,
  getPinLockoutRemainingSeconds,
  getStrictShieldRemainingMinutes,
  getTamperWarningEvents,
  isDowntimeActive,
} from '../utils/kioskEngine';
import { useI18n } from '../i18n/LocaleProvider';

interface PolicyInspectorPanelProps {
  state: KioskState;
  onToggleDeviceOwner: () => void;
  onSimulateReboot: () => void;
  onToggleOrientation: () => void;
  onToggleFontScale: () => void;
  onToggleHardwarePolicy: (key: HardwareLockPolicyKey) => void;
  onToggleBlockerShield: (key: BlockerShieldToggleKey) => { ok: boolean; error?: string };
  onSetFamilyDnsMode: (mode: FamilyDnsMode) => { ok: boolean; error?: string };
  onTestInAppBrowser: (packageName: string) => { allowed: boolean; reason: string };
  onSetAppTimeLimit: (packageName: string, minutes: number) => { ok: boolean; error?: string };
  onResetAppUsage: (packageName: string) => { ok: boolean; error?: string };
  onUpdateDowntimeSchedule: (patch: Partial<DowntimeSchedule>) => { ok: boolean; error?: string };
  onSetFocusBlockSession: (minutes: number) => { ok: boolean; error?: string };
  onAdvanceAppUsage: (packageName: string, deltaSeconds: number) => void;
  onTriggerPanic: () => void;
  onClearPanicLockdown: () => void;
  onResetTamperDiagnostics: () => void;
  onSimulateRapidAdminToggles: () => void;
  onSetKioskMode: (mode: KioskOperationMode) => void;
  onResetAll: () => void;
}

const RESTRICTION_META: Record<
  RestrictionKey,
  { title: string; detail: string }
> = {
  DISALLOW_SAFE_BOOT: {
    title: 'UserManager.DISALLOW_SAFE_BOOT',
    detail: 'Blocks booting into Android Safe Mode to bypass the kiosk launcher.',
  },
  DISALLOW_FACTORY_RESET: {
    title: 'UserManager.DISALLOW_FACTORY_RESET',
    detail: 'Prevents wiping the device via Settings or hardware recovery triggers.',
  },
  DISALLOW_ADD_USER: {
    title: 'UserManager.DISALLOW_ADD_USER',
    detail: 'Disables creating secondary or guest user profiles.',
  },
  DISALLOW_APPS_CONTROL: {
    title: 'UserManager.DISALLOW_APPS_CONTROL',
    detail: 'Blocks modifying, force-stopping, or uninstalling apps unless unlocked by Admin Passcode.',
  },
};

const HARDWARE_POLICY_ROWS: {
  key: HardwareLockPolicyKey;
  apiCall: string;
  detail: string;
  requiresDeviceOwner: boolean;
}[] = [
  {
    key: 'statusBarDisabled',
    apiCall: 'dpm.setStatusBarDisabled(admin, true)',
    detail: 'Blocks pulling down notification shade, Quick Settings toggles, and system alerts.',
    requiresDeviceOwner: true,
  },
  {
    key: 'usbTransferBlocked',
    apiCall: 'UserManager.DISALLOW_USB_FILE_TRANSFER + MOUNT_PHYSICAL_MEDIA',
    detail: 'Prevents sideloading APKs or extracting files via MTP/USB drives and SD cards.',
    requiresDeviceOwner: true,
  },
  {
    key: 'dateTimeLocked',
    apiCall: 'UserManager.DISALLOW_CONFIG_DATE_TIME',
    detail: 'Prevents altering device clock to bypass daily sobriety streaks or scheduled locks.',
    requiresDeviceOwner: true,
  },
  {
    key: 'cameraDisabled',
    apiCall: 'dpm.setCameraDisabled(admin, true)',
    detail: 'Disables hardware camera access across all installed apps.',
    requiresDeviceOwner: true,
  },
  {
    key: 'keyguardDisabled',
    apiCall: 'dpm.setKeyguardDisabled(admin, true)',
    detail: 'Bypasses Android keyguard lockscreen for instant dedicated terminal boot.',
    requiresDeviceOwner: true,
  },
  {
    key: 'screenCaptureDisabled',
    apiCall: 'dpm.setScreenCaptureDisabled(admin, true)',
    detail: 'Blocks screenshots and screen recording across kiosk sessions.',
    requiresDeviceOwner: true,
  },
  {
    key: 'keepScreenAwake',
    apiCall: 'WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON',
    detail: 'Keeps display awake during continuous kiosk check-in or deep focus timers.',
    requiresDeviceOwner: false,
  },
];

const BLOCKER_SHIELD_ROWS: {
  key: BlockerShieldToggleKey;
  apiCall: string;
  detail: string;
}[] = [
  {
    key: 'disablePornOnBrowsers',
    apiCall: 'dpm.setApplicationRestrictions("com.android.chrome", SafeSearch=true, Incognito=1)',
    detail: 'Forces Google SafeSearch, Strict YouTube Restricted Mode, URLBlocklist & disables Incognito.',
  },
  {
    key: 'blockInAppBrowsers',
    apiCall: 'KioskGuardAccessibilityService.blockInAppBrowsers(whitelistOnly=true)',
    detail: 'Blocks CustomTabs and embedded WebViews inside social/messaging apps unless whitelisted.',
  },
  {
    key: 'blockUnsupportedBrowsers',
    apiCall: `dpm.setPackagesSuspended([Firefox, Brave, Opera, DuckDuckGo, Tor])`,
    detail: 'Suspends unmonitored privacy/alternative browsers so web filters cannot be bypassed.',
  },
  {
    key: 'blockShortFormFeeds',
    apiCall: 'KioskGuard.blockShortFormFeeds(/shorts, /reels, TikTok)',
    detail: 'Blocks infinite-scroll short-form video feeds while preserving productive search & study.',
  },
];

type PolicySection = 'device' | 'access' | 'limits' | 'locks' | 'diagnostics';

const POLICY_SECTIONS: { id: PolicySection; label: string; Icon: React.ElementType }[] = [
  { id: 'device', label: 'Device', Icon: Smartphone },
  { id: 'access', label: 'Shields', Icon: ShieldCheck },
  { id: 'limits', label: 'Limits', Icon: Timer },
  { id: 'locks', label: 'Locks', Icon: Lock },
  { id: 'diagnostics', label: 'Diagnostics', Icon: Activity },
];

export const PolicyInspectorPanel: React.FC<PolicyInspectorPanelProps> = ({
  state,
  onToggleDeviceOwner,
  onSimulateReboot,
  onToggleOrientation,
  onToggleFontScale,
  onToggleHardwarePolicy,
  onToggleBlockerShield,
  onSetFamilyDnsMode,
  onTestInAppBrowser,
  onSetAppTimeLimit,
  onResetAppUsage,
  onUpdateDowntimeSchedule,
  onSetFocusBlockSession,
  onAdvanceAppUsage,
  onTriggerPanic,
  onClearPanicLockdown,
  onResetTamperDiagnostics,
  onSimulateRapidAdminToggles,
  onSetKioskMode,
  onResetAll,
}) => {
  const { tr } = useI18n();
  const [blockerAlert, setBlockerAlert] = useState<string | null>(null);
  const [limitAlert, setLimitAlert] = useState<string | null>(null);
  const [showHiddenScore, setShowHiddenScore] = useState(false);
  const restrictions = getEnforcedRestrictions(state);
  const hardwareLocks = state.hardwareLocks ?? DEFAULT_HARDWARE_LOCKS;
  const shields = state.blockerShields ?? DEFAULT_BLOCKER_SHIELDS;
  const downtime = state.downtimeSchedule ?? DEFAULT_DOWNTIME_SCHEDULE;
  const lockTaskWhitelist = getLockTaskWhitelist(state);
  const strictLockRemaining = getStrictShieldRemainingMinutes(state);
  const focusBlockRemaining = getFocusBlockRemainingMinutes(state);
  const panicLockRemaining = getPanicLockRemainingMinutes(state);
  const downtimeActive = isDowntimeActive(state);
  const limitedPackages = Object.entries(state.appTimeLimits ?? {}).filter(([, mins]) => mins > 0);
  const allApps = getAllInstalledApps(state);
  const tamperEvents = getTamperWarningEvents(state);
  const pinLockoutSeconds = getPinLockoutRemainingSeconds(state);
  const escalationTier = state.tamperEscalationTier ?? 0;
  const hiddenScore = state.distrustScore ?? 0;

  const activeHardwareCount = HARDWARE_POLICY_ROWS.filter(
    (row) => hardwareLocks[row.key] && (!row.requiresDeviceOwner || state.isDeviceOwner)
  ).length;

  const activeBlockerCount = BLOCKER_SHIELD_ROWS.filter((row) => shields[row.key]).length;
  const [policySection, setPolicySection] = useState<PolicySection>('device');

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label={tr("Policy groups")}
        className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 dark:border-white/10 dark:bg-white/[0.04]"
      >
        {POLICY_SECTIONS.map((tab) => {
          const active = policySection === tab.id;
          const Icon = tab.Icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPolicySection(tab.id)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                active
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {tr(tab.label)}
            </button>
          );
        })}
      </div>

      {policySection === 'device' && (<>
      {/* Device Controls */}
      <section className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{tr("Device Policy Controller")}</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{"\n              "}{tr("Test Device Owner provisioning, kiosk operation modes, hardware locks, and reboot recovery.")}{"\n            "}</p>
          </div>
          <button
            type="button"
            onClick={onResetAll}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{tr("Reset State")}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <button
            type="button"
            role="switch"
            aria-checked={state.isDeviceOwner}
            onClick={onToggleDeviceOwner}
            className={`min-h-[44px] px-4 py-2.5 rounded-lg border text-start flex items-center justify-between transition-colors ${
              state.isDeviceOwner
                ? 'border-sky-300 dark:border-sky-700 bg-sky-50/70 dark:bg-sky-950/50 text-slate-900 dark:text-slate-100'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div>
              <div className="text-xs font-semibold">{tr("Device Owner Mode")}</div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                {state.isDeviceOwner ? tr("Provisioned (dpm active)") : tr("Not provisioned")}
              </div>
            </div>
            <span
              className={`text-xs font-semibold ${
                state.isDeviceOwner ? 'text-sky-700 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {state.isDeviceOwner ? tr("Active") : tr("Inactive")}
            </span>
          </button>

          <button
            type="button"
            onClick={onSimulateReboot}
            className="min-h-[44px] px-4 py-2.5 rounded-lg border border-slate-900 dark:border-slate-700 bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors flex items-center justify-between"
          >
            <div className="text-start">
              <div className="text-xs font-semibold">{tr("Simulate Device Reboot")}</div>
              <div className="text-[11px] text-slate-300 dark:text-slate-400">{"\n                "}{tr("Fires LOCKED_BOOT_COMPLETED")}{"\n              "}</div>
            </div>
            <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onToggleOrientation}
            className="min-h-[42px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/60 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs"
          >
            <span className="font-medium text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
              <span>{tr("Config Orientation")}</span>
            </span>
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 capitalize">
              {state.orientation === 'portrait' ? tr('Portrait') : tr('Landscape')}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleFontScale}
            className="min-h-[42px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/60 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs"
          >
            <span className="font-medium text-slate-800 dark:text-slate-200">{tr("Config Font Scale")}</span>
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {state.fontScale}
            </span>
          </button>
        </div>

        {/* Kiosk Mode Selector */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{tr("Active Kiosk Boot Profile")}</div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400">{"\n              "}{tr("Choose Multi-App Grid, Single-App Auto-Launch, or Locked Web Browser mode.")}{"\n            "}</div>
          </div>
          <div className="flex items-center gap-1.5">
            {(
              [
                { id: 'multi_app', label: 'Multi-App' },
                { id: 'single_app', label: 'Single-App' },
                { id: 'kiosk_browser', label: 'Browser Only' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSetKioskMode(opt.id)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap transition-colors ${
                  state.kioskMode === opt.id
                    ? 'bg-sky-600 border-sky-600 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {tr(opt.label)}
              </button>
            ))}
          </div>
        </div>
      </section>

      </>)}

      {policySection === 'access' && (<>
      {/* BlockP / BlockerX / BlockerHero Porn & In-App Browser Shields */}
      <section className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{"\n              "}{tr("Porn, In-App Browser & DNS Shields (BlockP / BlockerX)")}{"\n            "}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{"\n              "}{tr("Native Chrome SafeSearch/No-Incognito, In-App WebView Whitelist, Unsupported Browsers, & Private DNS.")}{"\n            "}</p>
          </div>
          <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums shrink-0">
            {activeBlockerCount} / {BLOCKER_SHIELD_ROWS.length}{" "}{tr("Shields")}{"\n          "}</span>
        </div>

        {blockerAlert && (
          <div
            role="status"
            className="mt-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2"
          >
            <span>{blockerAlert}</span>
            <button
              type="button"
              onClick={() => setBlockerAlert(null)}
              className="text-amber-800 dark:text-amber-300 font-semibold px-1.5 shrink-0"
            >{"\n              "}{tr("Close")}{"\n            "}</button>
          </div>
        )}

        <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
          {BLOCKER_SHIELD_ROWS.map((row) => {
            const active = shields[row.key];
            return (
              <div key={row.key} className="py-2.5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {row.apiCall}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{row.detail}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={active}
                  onClick={() => {
                    const res = onToggleBlockerShield(row.key);
                    setBlockerAlert(res.ok ? null : res.error ?? null);
                  }}
                  className={`min-w-[82px] px-2.5 py-1 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {active ? tr("Enforced") : tr("Off")}
                </button>
              </div>
            );
          })}
        </div>

        {/* Private DNS & VPN Bypass Guard */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
              dpm.setGlobalPrivateDnsModeSpecifiedHost() + DISALLOW_CONFIG_VPN
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{"\n              "}{tr("System-wide DoT filtering; prevents VPN bypass when active.")}{"\n            "}</div>
          </div>
          <div className="flex items-center gap-1.5">
            {(
              [
                { id: 'cloudflare', label: '1.1.1.3 Family' },
                { id: 'cleanbrowsing', label: 'CleanBrowsing' },
                { id: 'off', label: 'Off' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  const res = onSetFamilyDnsMode(opt.id);
                  setBlockerAlert(res.ok ? null : res.error ?? null);
                }}
                className={`px-2.5 py-1 rounded-lg border text-xs font-semibold whitespace-nowrap ${
                  shields.familyDnsMode === opt.id
                    ? 'bg-slate-900 dark:bg-sky-600 border-slate-900 dark:border-sky-500 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {tr(opt.label)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span>{"\n            "}{tr("In-App Whitelist:")}{" "}<strong className="text-slate-900 dark:text-slate-100">{shields.inAppBrowserWhitelist.length}</strong> pkgs ·{' '}{"\n            "}{tr("Keywords:")}{" "}<strong className="text-slate-900 dark:text-slate-100">{shields.blockedKeywords.length}</strong> ·{' '}{"\n            "}{tr("Blocked Browsers:")}{" "}<strong className="text-slate-900 dark:text-slate-100">{UNSUPPORTED_BROWSER_PACKAGES.size}</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const res = onTestInAppBrowser('com.instagram.android');
                setBlockerAlert(res.reason);
              }}
              className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap"
            >{"\n              "}{tr("Simulate Instagram In-App Link")}{"\n            "}</button>
            {strictLockRemaining > 0 && (
              <span className="font-mono text-[11px] font-semibold text-amber-800 dark:text-amber-300 tabular-nums">{"\n                "}{tr("Strict Lock:")}{" "}{strictLockRemaining}m
              </span>
            )}
          </div>
        </div>
      </section>

      </>)}

      {policySection === 'limits' && (<>
      {/* App Time Limits, Scheduled Quiet Hours & Freedom Focus Lock */}
      <section className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{"\n              "}{tr("App Limits, Downtime & Focus Lock (AppBlock / Freedom)")}{"\n            "}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{"\n              "}{tr("Per-app daily foreground caps, Quiet Hours schedule, and Focus Lock with automatic package suspension.")}{"\n            "}</p>
          </div>
          <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums shrink-0">
            {limitedPackages.length}{" "}{tr("Capped ·")}{" "}{state.blockedAttemptsToday ?? 0}{" "}{tr("Blocked Today")}{"\n          "}</span>
        </div>

        {limitAlert && (
          <div
            role="status"
            className="mt-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2"
          >
            <span>{limitAlert}</span>
            <button
              type="button"
              onClick={() => setLimitAlert(null)}
              className="text-amber-800 dark:text-amber-300 font-semibold px-1.5 shrink-0"
            >{"\n              "}{tr("Close")}{"\n            "}</button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{"\n                "}{tr("Freedom Focus Lock")}{"\n              "}</div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                {focusBlockRemaining > 0
                  ? `${focusBlockRemaining}m left (Focus & Growth exempt)`
                  : tr("Inactive — tap to lock distracting apps")}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const res = onSetFocusBlockSession(25);
                  setLimitAlert(res.ok ? null : res.error ?? null);
                }}
                className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap"
              >{"\n                "}{tr("Focus 25m")}{"\n              "}</button>
              {focusBlockRemaining > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const res = onSetFocusBlockSession(0);
                    setLimitAlert(res.ok ? null : res.error ?? null);
                  }}
                  className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap"
                >{"\n                  "}{tr("Stop")}{"\n                "}</button>
              )}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{"\n                "}{tr("Quiet Hours (")}{String(downtime.startHour).padStart(2, '0')}:00–{String(downtime.endHour).padStart(2, '0')}:00)
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                {downtimeActive ? tr("Active now (blocking non-essential apps)") : downtime.enabled ? tr("Scheduled (outside window)") : tr("Disabled")}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={downtimeActive}
              onClick={() => {
                const nextActive = !downtimeActive;
                const res = onUpdateDowntimeSchedule({
                  enabled: nextActive,
                  simulateActiveNow: nextActive,
                });
                setLimitAlert(res.ok ? null : res.error ?? null);
              }}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 ${
                downtimeActive
                  ? 'bg-slate-900 dark:bg-sky-600 border-slate-900 dark:border-sky-500 text-white'
                  : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {downtimeActive ? tr("Active") : tr("Simulate Now")}
            </button>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{"\n              "}{tr("Configured Daily App Caps (")}{limitedPackages.length})
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const res = onSetAppTimeLimit(KIOSK_BROWSER_PACKAGE, 5);
                  setLimitAlert(
                    res.ok ? tr("Applied 5m/day limit to Kiosk Browser.") : res.error ?? null
                  );
                }}
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap"
              >{"\n                "}{tr("Cap Kiosk Browser 5m")}{"\n              "}</button>
              {((state.appTimeLimits ?? {})[KIOSK_BROWSER_PACKAGE] ?? 0) > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => onAdvanceAppUsage(KIOSK_BROWSER_PACKAGE, 300)}
                    className="px-2.5 py-1 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-[11px] font-medium text-amber-900 dark:text-amber-200 whitespace-nowrap"
                  >{"\n                    "}{tr("+5m Browser Use")}{"\n                  "}</button>
                  <button
                    type="button"
                    onClick={() => {
                      const res = onResetAppUsage(KIOSK_BROWSER_PACKAGE);
                      setLimitAlert(res.ok ? tr("Reset Kiosk Browser usage for today.") : res.error ?? null);
                    }}
                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"
                  >{"\n                    "}{tr("Reset Usage")}{"\n                  "}</button>
                </>
              )}
            </div>
          </div>

          {limitedPackages.length === 0 ? (
            <div className="text-xs text-slate-500 dark:text-slate-400">{"\n              "}{tr("No per-app time limits set yet. Set daily caps inside Admin Settings → Allowed Kiosk Apps or use the quick cap test above.")}{"\n            "}</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {limitedPackages.map(([pkg, limitMins]) => {
                const appLabel = allApps.find((a) => a.packageName === pkg)?.label ?? pkg;
                const usedSec = (state.appUsageSeconds ?? {})[pkg] ?? 0;
                const remSec = getAppRemainingSeconds(state, pkg) ?? 0;
                return (
                  <div key={pkg} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{appLabel}</span>{' '}
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">({pkg})</span>
                    </div>
                    <span
                      className={`font-mono text-[11px] tabular-nums shrink-0 ${
                        remSec <= 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-sky-700 dark:text-sky-400'
                      }`}
                    >
                      {Math.floor(usedSec / 60)}m / {limitMins}m ({Math.ceil(remSec / 60)}m left)
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      </>)}

      {policySection === 'locks' && (<>
      {/* Enforced UserManager Restrictions */}
      <section className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 break-words min-w-0">
            DevicePolicyManager.addUserRestriction()
          </h3>
          <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums shrink-0">
            {Object.values(restrictions).filter(Boolean).length} / 4 {tr('Enforced')}
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
          {(Object.keys(RESTRICTION_META) as RestrictionKey[]).map((key) => {
            const active = restrictions[key];
            const isTempLifted =
              key === 'DISALLOW_APPS_CONTROL' && state.isDeviceOwner && state.adminUnlocked;
            const meta = RESTRICTION_META[key];

            return (
              <div key={key} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {meta.title}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{meta.detail}</p>
                </div>
                <div className="shrink-0 flex items-center gap-1.5 text-xs font-medium">
                  {active ? (
                    <>
                      <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      <span className="text-emerald-700 dark:text-emerald-400">{tr("Enforced")}</span>
                    </>
                  ) : isTempLifted ? (
                    <>
                      <Unlock className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                      <span className="text-amber-700 dark:text-amber-400">{tr("Admin Unlocked")}</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="w-4 h-4 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                      <span className="text-slate-500 dark:text-slate-400">{tr("Inactive")}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Hardware, Peripheral & Anti-Tamper Restrictions */}
      <section className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{"\n              "}{tr("Hardware, Peripheral & Anti-Tamper Lockdown")}{"\n            "}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{"\n              "}{tr("Enterprise hardware & tamper policies (SureLock / Scalefusion pattern).")}{"\n            "}</p>
          </div>
          <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums shrink-0">
            {activeHardwareCount} / {HARDWARE_POLICY_ROWS.length}{" "}{tr("Active")}{"\n          "}</span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
          {HARDWARE_POLICY_ROWS.map((row) => {
            const checked = hardwareLocks[row.key];
            const enforced = checked && (!row.requiresDeviceOwner || state.isDeviceOwner);
            return (
              <div key={row.key} className="py-2.5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {row.apiCall}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{row.detail}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  onClick={() => onToggleHardwarePolicy(row.key)}
                  className={`min-w-[82px] px-2.5 py-1 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                    enforced
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                      : checked
                      ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {enforced ? tr("Enforced") : checked ? tr("Need DO") : tr("Off")}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span>{"\n            "}{tr("Kiosk Browser Guard:")}{" "}<strong className="text-slate-900 dark:text-slate-100">{state.allowedDomains.length}</strong>{' '}{"\n            "}{tr("allowlisted domains ·")}{' '}
            <strong className="text-red-700 dark:text-red-400">{BLOCKED_DISTRACTION_DOMAINS.length}</strong>{' '}{"\n            "}{tr("adult/social domains blocked")}{"\n          "}</span>
          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">{"\n            "}{tr("Admin Passcode:")}{" "}{state.adminPin.length}/50 chars
          </span>
        </div>
      </section>

      {/* LockTask Whitelist & Settings Guard */}
      <section className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{"\n            "}{tr("LockTask Allowlist & Settings Guard")}{"\n          "}</h3>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 shrink-0">
            {state.adminUnlocked ? (
              <>
                <Unlock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span className="text-amber-800 dark:text-amber-300">{tr("Settings Temporarily Unlocked")}</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span className="text-emerald-700 dark:text-emerald-400">{tr("Settings & Uninstall Blocked")}</span>
              </>
            )}
          </span>
        </div>

        <div className="mt-3">
          <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
            dpm.setLockTaskPackages(admin, arrayOf({lockTaskWhitelist.length}))
          </div>
          <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-800 dark:text-slate-200 space-y-1">
            {lockTaskWhitelist.map((pkg) => (
              <div key={pkg} className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" aria-hidden="true" />
                <span>{pkg}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      </>)}

      {policySection === 'diagnostics' && (<>
      {/* Bypass & Tamper Diagnostics */}
      <section className="surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{"\n              "}{tr("Bypass & Tamper Diagnostics")}{"\n            "}</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{"\n              "}{tr("Detects rapid admin setting toggles & bypass surges, logs Tamper Warnings, and triggers escalating lockouts.")}{"\n            "}</p>
          </div>
          <span
            className={`text-xs font-semibold tabular-nums shrink-0 ${
              tamperEvents.length > 0 ? 'text-red-700 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {state.tamperWarningsCount ?? tamperEvents.length}{" "}{tr("Tamper Warnings")}{"\n          "}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80">
            <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{tr("Escalation Status")}</div>
            <div
              className={`text-xs font-bold mt-1 ${
                escalationTier >= 2
                  ? 'text-red-700 dark:text-red-400'
                  : escalationTier === 1
                  ? 'text-amber-800 dark:text-amber-300'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {escalationTier >= 2
                ? tr("Tier 2 (+300s + 30m Shield Lock)")
                : escalationTier === 1
                ? tr("Tier 1 (+90s Extra Lockout)")
                : tr("Normal (No Lockout Escalation)")}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80">
            <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{tr("Active Admin Lockout")}</div>
            <div className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
              {pinLockoutSeconds > 0 ? `${pinLockoutSeconds}s Remaining` : tr("Unlocked / Ready")}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{tr("Internal Distrust Score")}</div>
              <div className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
                {showHiddenScore
                  ? `${hiddenScore} pts (T1:${DISTRUST_TIER1_THRESHOLD} / T2:${DISTRUST_TIER2_THRESHOLD})`
                  : tr("Hidden from device UI")}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowHiddenScore((prev) => !prev)}
              aria-label={showHiddenScore ? tr("Hide hidden distrust score") : tr("Reveal hidden distrust score")}
              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 shrink-0"
            >
              {showHiddenScore ? (
                <>
                  <EyeOff className="w-3 h-3" aria-hidden="true" />
                  <span>{tr("Hide")}</span>
                </>
              ) : (
                <>
                  <Eye className="w-3 h-3" aria-hidden="true" />
                  <span>{tr("Reveal")}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Emergency Panic Lockdown & Clipboard Wipe */}
        <div
          data-testid="policy-panic-status"
          className={`mt-3 p-3 rounded-lg border flex flex-wrap items-center justify-between gap-3 ${
            panicLockRemaining > 0
              ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800'
              : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700/80'
          }`}
        >
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {panicLockRemaining > 0
                ? `Emergency Panic Lockdown Active (${panicLockRemaining}m left)`
                : tr("Emergency Panic Recovery Protocol")}
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 tabular-nums mt-0.5">{"\n              "}{tr("Triggers:")}{" "}{state.panicCount ?? 0}{" "}{tr("· Clipboard Wipe:")}{' '}
              {state.lastClipboardWipedAt ? `Cleared at ${state.lastClipboardWipedAt}` : tr("Not yet triggered")}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                  void navigator.clipboard.writeText('').catch(() => {});
                }
                onTriggerPanic();
              }}
              className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold whitespace-nowrap"
            >{"\n              "}{tr("Trigger Emergency Panic")}{"\n            "}</button>
            {panicLockRemaining > 0 && (
              <button
                type="button"
                data-testid="clear-panic-lock-button"
                onClick={onClearPanicLockdown}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap"
              >{"\n                "}{tr("Clear Panic Lock")}{"\n              "}</button>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSimulateRapidAdminToggles}
              className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900/60 text-xs font-semibold text-red-900 dark:text-red-200 whitespace-nowrap"
            >{"\n              "}{tr("Simulate Rapid Admin Toggles (4x)")}{"\n            "}</button>
            <button
              type="button"
              onClick={onResetTamperDiagnostics}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"
            >{"\n              "}{tr("Reset Diagnostics")}{"\n            "}</button>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">{"\n            "}{tr("Thresholds: ≥4 toggles / 15s → Warning · 40+ pts → +90s Lockout · 70+ pts → +300s & 30m Shield Lock")}{"\n          "}</span>
        </div>

        {tamperEvents.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
            <div className="text-[11px] font-semibold text-red-800 dark:text-red-300">{"\n              "}{tr("Recent Tamper Warning Entries (")}{tamperEvents.length})
            </div>
            {tamperEvents.slice(0, 3).map((evt) => (
              <div
                key={evt.id}
                className="p-2 rounded-lg bg-red-50/70 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200 flex items-start justify-between gap-2"
              >
                <span className="font-medium">{evt.detail}</span>
                <span className="font-mono text-[11px] text-red-700 dark:text-red-400 shrink-0 tabular-nums">
                  {evt.timestamp}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Android Policy Event Log */}
      <section className="surface p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{tr("Kotlin Policy Execution Trace")}</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{state.events.length}{" "}{tr("events")}</span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-1 max-h-[260px] overflow-y-auto">
          {state.events.map((event) => {
            const isTamper =
              event.apiCall.includes('TamperDiagnostics') ||
              event.detail.includes('Tamper Warning');
            return (
              <div
                key={event.id}
                className={`py-2.5 flex items-start justify-between gap-3 ${
                  isTamper ? 'bg-red-50/50 dark:bg-red-950/40 px-2 -mx-2 rounded' : ''
                }`}
              >
                <div className="min-w-0">
                  <div
                    className={`font-mono text-xs font-medium truncate ${
                      isTamper ? 'text-red-900 dark:text-red-200 font-semibold' : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {event.apiCall}
                  </div>
                  <div className={`text-xs mt-0.5 ${isTamper ? 'text-red-800 dark:text-red-300' : 'text-slate-600 dark:text-slate-400'}`}>
                    {event.detail}
                  </div>
                </div>
                <div className="text-end shrink-0">
                  <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {event.timestamp}
                  </div>
                  <div
                    className={`text-[11px] font-semibold capitalize ${
                      isTamper
                        ? 'text-red-700 dark:text-red-400'
                        : event.outcome === 'blocked'
                        ? 'text-red-600 dark:text-red-400'
                        : event.outcome === 'enforced'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-sky-700 dark:text-sky-400'
                    }`}
                  >
                    {isTamper ? tr("Tamper Warning") : event.outcome}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      </>)}
    </div>
  );
};
