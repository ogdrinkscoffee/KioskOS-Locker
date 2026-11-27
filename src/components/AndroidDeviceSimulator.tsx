import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BatteryCharging,
  Calculator,
  Camera,
  Check,
  ClipboardCheck,
  Eye,
  EyeOff,
  Flame,
  Globe,
  Home,
  KeyRound,
  Lock,
  OctagonAlert,
  PackageSearch,
  PlugZap,
  Plus,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  ShoppingBag,
  Square,
  Store,
  Trash2,
  Unlock,
  Zap,
} from 'lucide-react';
import {
  BlockerShieldToggleKey,
  DEFAULT_ADMIN_RESTRICTIONS,
  DEFAULT_BLOCKER_SHIELDS,
  DEFAULT_DOWNTIME_SCHEDULE,
  DowntimeSchedule,
  FamilyDnsMode,
  HardwareLockPolicyKey,
  KIOSK_BROWSER_PACKAGE,
  KioskOperationMode,
  KioskState,
  MAX_ADMIN_PIN_LENGTH,
  PinGateTarget,
  RestrictionKey,
  SELF_IMPROVEMENT_PACKAGE,
  UNSUPPORTED_BROWSER_PACKAGES,
  getAllInstalledApps,
  getAppRemainingSeconds,
  getAppScheduleOrLimitBlockReason,
  getFocusBlockRemainingMinutes,
  getPanicLockRemainingMinutes,
  getPinLockoutRemainingSeconds,
  getStrictShieldRemainingMinutes,
  getVisibleHomeApps,
  isAppPasswordProtected,
  isDowntimeActive,
} from '../utils/kioskEngine';
import {
  SelfImprovementState,
  formatCountdown,
  formatIsoDate,
  getTodayFocusSummary,
} from '../utils/selfImprovementEngine';
import { KioskAccountabilityDashboard } from './KioskAccountabilityDashboard';
import { AppAccessPinModal } from './AppAccessPinModal';
import { useI18n } from '../i18n/LocaleProvider';
import {
  adminPinValueSchema,
  browserUrlSchema,
  customAppFormSchema,
  downtimeHoursSchema,
  escapeHtml,
  kioskTitleSchema,
  quickDiaryFormSchema,
} from '../utils/validation';
import { DEFAULT_PAGE_SIZE, paginateItems } from '../utils/pagination';

interface AndroidDeviceSimulatorProps {
  state: KioskState;
  selfImprovement: SelfImprovementState;
  onLaunchApp: (packageName: string) => void;
  onAttemptUninstall: (packageName: string) => void;
  onOpenPinGate: (target: PinGateTarget) => void;
  onSubmitPin: (pin: string) => { verified: boolean; lockedOutSeconds?: number };
  onCancelPinGate: () => void;
  onToggleAllowedApp: (packageName: string) => void;
  onToggleAppPasswordProtection: (packageName: string) => void;
  onVerifyAppAccessPin: (packageName: string, pin: string) => { verified: boolean; lockedOutSeconds?: number };
  onAddCustomApp: (label: string, packageName: string) => { ok: boolean; error?: string };
  onUpdatePin: (currentPin: string, newPin: string, confirmPin: string) => { ok: boolean; error?: string };
  onSetAdminUnlock: (unlocked: boolean) => void;
  onSetKioskMode: (mode: KioskOperationMode, singleAppPackage?: string | null) => void;
  onUpdateKioskTitle: (title: string) => void;
  onToggleAdminRestriction: (key: RestrictionKey) => void;
  onToggleHardwarePolicy: (key: HardwareLockPolicyKey) => void;
  onToggleBlockerShield: (key: BlockerShieldToggleKey) => { ok: boolean; error?: string };
  onSetFamilyDnsMode: (mode: FamilyDnsMode) => { ok: boolean; error?: string };
  onUpdateAllowedDomains: (domains: string[]) => void;
  onUpdateInAppWhitelist: (packages: string[]) => void;
  onUpdateBlockedKeywords: (keywords: string[]) => void;
  onActivateStrictLock: (minutes: number) => void;
  onTestInAppBrowser: (packageName: string) => { allowed: boolean; reason: string };
  onNavigateBrowser: (url: string) => { ok: boolean; reason?: string };
  onSetAppTimeLimit: (packageName: string, minutes: number) => { ok: boolean; error?: string };
  onResetAppUsage: (packageName: string) => { ok: boolean; error?: string };
  onUpdateDowntimeSchedule: (patch: Partial<DowntimeSchedule>) => { ok: boolean; error?: string };
  onSetFocusBlockSession: (minutes: number) => { ok: boolean; error?: string };
  onAdvanceAppUsage: (packageName: string, deltaSeconds: number) => void;
  onTriggerPanic: () => void;
  onReturnHome: () => void;
  onDismissNotice: () => void;
  onToggleHabitToday: (habitId: string) => void;
  onToggleTask: (taskId: string) => void;
  onLogCleanDay: () => void;
  onRecordFocusSession: (minutes: number, label: string) => void;
  onQuickSaveDiaryNote: (title: string, body: string) => void;
  onOpenFullSelfImprovement: () => void;
}

function getAppIcon(packageName: string, className = 'w-5 h-5') {
  switch (packageName) {
    case SELF_IMPROVEMENT_PACKAGE:
      return <Flame className={className} />;
    case KIOSK_BROWSER_PACKAGE:
    case 'org.mozilla.firefox':
    case 'com.duckduckgo.mobile.android':
      return <Globe className={className} />;
    case 'com.enterprise.pos':
      return <Store className={className} />;
    case 'com.enterprise.checkin':
      return <ClipboardCheck className={className} />;
    case 'com.enterprise.scanner':
      return <PackageSearch className={className} />;
    case 'com.enterprise.catalog':
      return <ShoppingBag className={className} />;
    case 'com.android.calculator2':
      return <Calculator className={className} />;
    case 'com.android.camera2':
      return <Camera className={className} />;
    case 'com.android.settings':
      return <Settings className={className} />;
    default:
      return <PackageSearch className={className} />;
  }
}

const ADMIN_RESTRICTION_TOGGLE_ITEMS: { key: RestrictionKey; label: string; apiHint: string }[] = [
  { key: 'DISALLOW_SAFE_BOOT', label: 'Disable Safe Mode', apiHint: 'UserManager.DISALLOW_SAFE_BOOT' },
  { key: 'DISALLOW_FACTORY_RESET', label: 'Disable Factory Reset', apiHint: 'UserManager.DISALLOW_FACTORY_RESET' },
  { key: 'DISALLOW_ADD_USER', label: 'Disable Add User / Guest Profiles', apiHint: 'UserManager.DISALLOW_ADD_USER' },
  { key: 'DISALLOW_APPS_CONTROL', label: 'Disable App Control & Uninstall', apiHint: 'UserManager.DISALLOW_APPS_CONTROL' },
];

const HARDWARE_TOGGLE_ITEMS: { key: HardwareLockPolicyKey; label: string; apiHint: string }[] = [
  { key: 'statusBarDisabled', label: 'Block Status Bar Shade', apiHint: 'setStatusBarDisabled' },
  { key: 'usbTransferBlocked', label: 'Block USB & External Media', apiHint: 'DISALLOW_USB_FILE_TRANSFER' },
  { key: 'dateTimeLocked', label: 'Lock Date & Time (Anti-Tamper)', apiHint: 'DISALLOW_CONFIG_DATE_TIME' },
  { key: 'cameraDisabled', label: 'Disable Device Camera', apiHint: 'setCameraDisabled' },
  { key: 'keyguardDisabled', label: 'Skip Lockscreen Keyguard', apiHint: 'setKeyguardDisabled' },
  { key: 'screenCaptureDisabled', label: 'Block Screenshots', apiHint: 'setScreenCaptureDisabled' },
  { key: 'keepScreenAwake', label: 'Keep Kiosk Screen Awake', apiHint: 'FLAG_KEEP_SCREEN_ON' },
];

const BLOCKER_SHIELD_ITEMS: { key: BlockerShieldToggleKey; label: string; hint: string }[] = [
  {
    key: 'disablePornOnBrowsers',
    label: 'Disable Porn on Browsers',
    hint: 'Chrome SafeSearch + Strict YouTube + No Incognito',
  },
  {
    key: 'blockInAppBrowsers',
    label: 'Block All In-App Browsers Except Whitelist',
    hint: 'Intercepts WebView / CustomTabs inside apps',
  },
  {
    key: 'blockUnsupportedBrowsers',
    label: 'Block Unsupported Browsers',
    hint: 'Suspends Firefox, Brave, Opera, DuckDuckGo, Tor',
  },
  {
    key: 'blockShortFormFeeds',
    label: 'Block Short-Form Video Feeds',
    hint: 'Blocks YouTube Shorts, Reels & TikTok feeds',
  },
];

export const AndroidDeviceSimulator: React.FC<AndroidDeviceSimulatorProps> = ({
  state,
  selfImprovement,
  onLaunchApp,
  onAttemptUninstall,
  onOpenPinGate,
  onSubmitPin,
  onCancelPinGate,
  onToggleAllowedApp,
  onToggleAppPasswordProtection,
  onVerifyAppAccessPin,
  onAddCustomApp,
  onUpdatePin,
  onSetAdminUnlock,
  onSetKioskMode,
  onUpdateKioskTitle,
  onToggleAdminRestriction,
  onToggleHardwarePolicy,
  onToggleBlockerShield,
  onSetFamilyDnsMode,
  onUpdateAllowedDomains,
  onUpdateInAppWhitelist,
  onUpdateBlockedKeywords,
  onActivateStrictLock,
  onTestInAppBrowser,
  onNavigateBrowser,
  onSetAppTimeLimit,
  onResetAppUsage,
  onUpdateDowntimeSchedule,
  onSetFocusBlockSession,
  onAdvanceAppUsage,
  onTriggerPanic,
  onReturnHome,
  onDismissNotice,
  onToggleHabitToday,
  onToggleTask,
  onLogCleanDay,
  onRecordFocusSession,
  onQuickSaveDiaryNote,
  onOpenFullSelfImprovement,
}) => {
  const { tr } = useI18n();
  const [pinEntry, setPinEntry] = useState('');
  const [showPinEntry, setShowPinEntry] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [navBlockedMessage, setNavBlockedMessage] = useState<string | null>(null);
  const [pendingProtectedAppPkg, setPendingProtectedAppPkg] = useState<string | null>(null);
  const [lockoutNowMs, setLockoutNowMs] = useState<number>(() => Date.now());

  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [showChangePinText, setShowChangePinText] = useState(false);
  const [pinChangeFeedback, setPinChangeFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const [kioskTitleDraft, setKioskTitleDraft] = useState(state.kioskTitle);
  const [titleSavedNotice, setTitleSavedNotice] = useState(false);
  const [kioskTitleError, setKioskTitleError] = useState<string | null>(null);

  const shields = state.blockerShields ?? DEFAULT_BLOCKER_SHIELDS;
  const downtime = state.downtimeSchedule ?? DEFAULT_DOWNTIME_SCHEDULE;
  const [domainsDraft, setDomainsDraft] = useState(state.allowedDomains.join(', '));
  const [inAppWhitelistDraft, setInAppWhitelistDraft] = useState(shields.inAppBrowserWhitelist.join(', '));
  const [keywordsDraft, setKeywordsDraft] = useState(shields.blockedKeywords.join(', '));
  const [shieldFeedback, setShieldFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const [downtimeStartDraft, setDowntimeStartDraft] = useState(String(downtime.startHour));
  const [downtimeEndDraft, setDowntimeEndDraft] = useState(String(downtime.endHour));
  const [limitFeedback, setLimitFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const [browserUrlInput, setBrowserUrlInput] = useState(state.browserCurrentUrl);
  const [browserBlockReason, setBrowserBlockReason] = useState<string | null>(null);
  const [inAppTestResult, setInAppTestResult] = useState<{ allowed: boolean; reason: string } | null>(null);

  const [customAppLabel, setCustomAppLabel] = useState('');
  const [customAppPkg, setCustomAppPkg] = useState('');
  const [customAppFeedback, setCustomAppFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [adminAppFilter, setAdminAppFilter] = useState('');
  const [adminAppsPage, setAdminAppsPage] = useState(1);

  const [uninstallTarget, setUninstallTarget] = useState('com.enterprise.pos');

  // Mobile Self-Improvement screen local state
  const [kioskSiTab, setKioskSiTab] = useState<'today' | 'timer' | 'diary'>('today');
  const [simTimerMins, setSimTimerMins] = useState(25);
  const [simSecondsLeft, setSimSecondsLeft] = useState(25 * 60);
  const [simTimerRunning, setSimTimerRunning] = useState(false);
  const [simTimerLogged, setSimTimerLogged] = useState(false);
  const [quickNoteTitle, setQuickNoteTitle] = useState('');
  const [quickNoteBody, setQuickNoteBody] = useState('');
  const [quickNoteSaved, setQuickNoteSaved] = useState(false);
  const [quickNoteError, setQuickNoteError] = useState<string | null>(null);

  // Interactive auto-updating battery state
  const [batteryLevel, setBatteryLevel] = useState<number>(84);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  const [batteryAutoUpdate, setBatteryAutoUpdate] = useState<boolean>(true);
  const [batteryPanelOpen, setBatteryPanelOpen] = useState<boolean>(false);
  const [hostBatteryAvailable, setHostBatteryAvailable] = useState<boolean>(false);
  const [hostBatterySynced, setHostBatterySynced] = useState<boolean>(false);
  const [simIconError, setSimIconError] = useState<boolean>(false);

  const quickNoteTimerRef = useRef<number | null>(null);
  const titleTimerRef = useRef<number | null>(null);
  const submitCooldownRef = useRef<Record<string, number>>({});

  const canRunSubmit = (key: string, cooldownMs = 350): boolean => {
    const now = Date.now();
    const last = submitCooldownRef.current[key] ?? 0;
    if (now - last < cooldownMs) return false;
    submitCooldownRef.current[key] = now;
    return true;
  };

  const allInstalledApps = getAllInstalledApps(state);
  const visibleApps = getVisibleHomeApps(state);
  const activeApp = allInstalledApps.find((a) => a.packageName === state.activeAppPackage);
  const pendingProtectedApp = useMemo(
    () =>
      pendingProtectedAppPkg
        ? allInstalledApps.find((a) => a.packageName === pendingProtectedAppPkg) ?? null
        : null,
    [allInstalledApps, pendingProtectedAppPkg]
  );

  const handleAppLaunchRequest = (packageName: string) => {
    setNavBlockedMessage(null);
    const targetApp = allInstalledApps.find((item) => item.packageName === packageName);
    const blockedByUnsupportedBrowser =
      Boolean(targetApp?.isUnsupportedBrowser || UNSUPPORTED_BROWSER_PACKAGES.has(packageName)) &&
      state.isDeviceOwner &&
      shields.blockUnsupportedBrowsers &&
      !state.adminUnlocked;
    const blockedByScheduleOrLimit =
      !state.adminUnlocked && getAppScheduleOrLimitBlockReason(state, packageName) !== null;
    const blockedByCameraLock =
      packageName === 'com.android.camera2' &&
      state.isDeviceOwner &&
      Boolean(state.hardwareLocks?.cameraDisabled);
    const blockedByAllowlist =
      !state.allowedPackages.includes(packageName) && !state.adminUnlocked;

    if (
      blockedByUnsupportedBrowser ||
      blockedByScheduleOrLimit ||
      blockedByCameraLock ||
      blockedByAllowlist
    ) {
      onLaunchApp(packageName);
      return;
    }

    if (isAppPasswordProtected(state, packageName)) {
      setPendingProtectedAppPkg(packageName);
      return;
    }
    onLaunchApp(packageName);
  };
  const isLandscape = state.orientation === 'landscape';
  const textScaleClass = state.fontScale === '1.15x' ? 'text-[15px]' : 'text-[13px]';
  const today = formatIsoDate();
  const simFocusSummary = getTodayFocusSummary(selfImprovement, today);
  const lockoutRemaining = getPinLockoutRemainingSeconds(state, lockoutNowMs);
  const strictLockMinutes = getStrictShieldRemainingMinutes(state);
  const focusBlockMinutes = getFocusBlockRemainingMinutes(state);
  const panicLockMinutes = getPanicLockRemainingMinutes(state);
  const downtimeActive = isDowntimeActive(state);
  const activeAppLimitMins =
    state.activeAppPackage ? (state.appTimeLimits ?? {})[state.activeAppPackage] ?? 0 : 0;
  const activeAppRemainingSec =
    state.activeAppPackage ? getAppRemainingSeconds(state, state.activeAppPackage) : null;

  useEffect(() => {
    if ((state.pinLockedUntilMs ?? 0) <= Date.now()) return;
    setLockoutNowMs(Date.now());
    const timer = window.setInterval(() => {
      const now = Date.now();
      setLockoutNowMs(now);
      if ((state.pinLockedUntilMs ?? 0) <= now) {
        window.clearInterval(timer);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state.pinLockedUntilMs]);

  useEffect(() => {
    if (!pendingProtectedAppPkg) return;
    if (
      state.activeScreen === 'rebooting' ||
      !isAppPasswordProtected(state, pendingProtectedAppPkg)
    ) {
      setPendingProtectedAppPkg(null);
    }
  }, [pendingProtectedAppPkg, state.activeScreen, state.allowedPackages, state.allowedApps]);

  useEffect(() => {
    setKioskTitleDraft(state.kioskTitle);
  }, [state.kioskTitle]);

  useEffect(() => {
    setDomainsDraft(state.allowedDomains.join(', '));
  }, [state.allowedDomains]);

  useEffect(() => {
    setInAppWhitelistDraft((state.blockerShields ?? DEFAULT_BLOCKER_SHIELDS).inAppBrowserWhitelist.join(', '));
  }, [state.blockerShields]);

  useEffect(() => {
    setKeywordsDraft((state.blockerShields ?? DEFAULT_BLOCKER_SHIELDS).blockedKeywords.join(', '));
  }, [state.blockerShields]);

  useEffect(() => {
    const sched = state.downtimeSchedule ?? DEFAULT_DOWNTIME_SCHEDULE;
    setDowntimeStartDraft(String(sched.startHour));
    setDowntimeEndDraft(String(sched.endHour));
  }, [state.downtimeSchedule]);

  useEffect(() => {
    setBrowserUrlInput(state.browserCurrentUrl);
  }, [state.browserCurrentUrl]);

  useEffect(() => {
    if (!simTimerRunning) return;
    const timer = window.setInterval(() => {
      setSimSecondsLeft((prev) => {
        if (prev <= 1) {
          setSimTimerRunning(false);
          onRecordFocusSession(simTimerMins, 'Kiosk LockTask Focus Sprint');
          setSimTimerLogged(true);
          return simTimerMins * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [simTimerRunning, simTimerMins, onRecordFocusSession]);

  useEffect(() => {
    const activePkg =
      state.activeScreen === 'kiosk_browser'
        ? KIOSK_BROWSER_PACKAGE
        : state.activeScreen === 'app_lock_task'
        ? state.activeAppPackage
        : null;
    if (!activePkg || state.adminUnlocked) return;
    if (((state.appTimeLimits ?? {})[activePkg] ?? 0) <= 0) return;

    const usageTimer = window.setInterval(() => {
      onAdvanceAppUsage(activePkg, 1);
    }, 1000);
    return () => window.clearInterval(usageTimer);
  }, [state.activeScreen, state.activeAppPackage, state.adminUnlocked, state.appTimeLimits, onAdvanceAppUsage]);

  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener: (type: string, listener: () => void) => void;
        removeEventListener: (type: string, listener: () => void) => void;
      }>;
    };
    if (typeof nav.getBattery !== 'function') return;
    setHostBatteryAvailable(true);
    if (!hostBatterySynced) return;

    let cancelled = false;
    let batteryObj: {
      level: number;
      charging: boolean;
      addEventListener: (type: string, listener: () => void) => void;
      removeEventListener: (type: string, listener: () => void) => void;
    } | null = null;

    const syncFromHost = () => {
      if (!batteryObj || cancelled) return;
      setBatteryLevel(Math.max(1, Math.min(100, Math.round(batteryObj.level * 100))));
      setIsCharging(batteryObj.charging);
    };

    nav
      .getBattery()
      .then((bat) => {
        if (cancelled) return;
        batteryObj = bat;
        syncFromHost();
        bat.addEventListener('levelchange', syncFromHost);
        bat.addEventListener('chargingchange', syncFromHost);
      })
      .catch(() => {
        setHostBatteryAvailable(false);
        setHostBatterySynced(false);
      });

    return () => {
      cancelled = true;
      if (batteryObj) {
        batteryObj.removeEventListener('levelchange', syncFromHost);
        batteryObj.removeEventListener('chargingchange', syncFromHost);
      }
    };
  }, [hostBatterySynced]);

  useEffect(() => {
    return () => {
      if (quickNoteTimerRef.current !== null) {
        window.clearTimeout(quickNoteTimerRef.current);
      }
      if (titleTimerRef.current !== null) {
        window.clearTimeout(titleTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!batteryAutoUpdate || hostBatterySynced || state.activeScreen === 'rebooting') return;
    const batteryTimer = window.setInterval(() => {
      setBatteryLevel((prev) => {
        if (isCharging) {
          return prev >= 100 ? 100 : prev + 1;
        }
        return prev <= 1 ? 1 : prev - 1;
      });
    }, 2500);
    return () => window.clearInterval(batteryTimer);
  }, [batteryAutoUpdate, hostBatterySynced, isCharging, state.activeScreen]);

  const filteredAdminApps = useMemo(
    () =>
      allInstalledApps
        .filter((a) => !a.isSystemRestricted)
        .filter((a) => {
          const q = adminAppFilter.trim().toLowerCase();
          if (!q) return true;
          return a.label.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q);
        }),
    [allInstalledApps, adminAppFilter]
  );
  const adminAppsPagination = useMemo(
    () => paginateItems(filteredAdminApps, adminAppsPage, DEFAULT_PAGE_SIZE),
    [filteredAdminApps, adminAppsPage]
  );

  const handlePinSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canRunSubmit('pin_submit')) return;
    const res = onSubmitPin(pinEntry);
    if (res.verified) {
      setPinEntry('');
      setPinError(null);
      setShowPinEntry(false);
    } else if (res.lockedOutSeconds && res.lockedOutSeconds > 0) {
      setPinError(tr('Too many failed attempts. Locked for {s}s.', { s: res.lockedOutSeconds }));
      setPinEntry('');
    } else {
      setPinError(tr('Incorrect passcode. Default passcode is 1234 unless changed.'));
      setPinEntry('');
    }
  };

  const handlePinDigit = (digit: string) => {
    if (pinEntry.length < MAX_ADMIN_PIN_LENGTH) {
      setPinError(null);
      setPinEntry((prev) => prev + digit);
    }
  };

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRunSubmit('save_pin')) return;
    const parsedPin = adminPinValueSchema.safeParse(newPinInput);
    if (!parsedPin.success) {
      setPinChangeFeedback({
        type: 'error',
        text: tr(parsedPin.error.issues[0]?.message ?? 'Invalid passcode.'),
      });
      return;
    }
    const res = onUpdatePin(currentPinInput, parsedPin.data, confirmPinInput);
    if (res.ok) {
      setCurrentPinInput('');
      setNewPinInput('');
      setConfirmPinInput('');
      setPinChangeFeedback({ type: 'ok', text: tr('Admin passcode updated (4–50 chars) and persisted.') });
    } else {
      setPinChangeFeedback({ type: 'error', text: res.error ?? tr("Failed to update passcode.") });
    }
  };

  const handleAddCustomAppSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRunSubmit('add_custom_app')) return;
    const parsed = customAppFormSchema.safeParse({
      label: customAppLabel,
      packageName: customAppPkg,
    });
    if (!parsed.success) {
      setCustomAppFeedback({
        type: 'error',
        text: tr(parsed.error.issues[0]?.message ?? 'Could not add app.'),
      });
      return;
    }
    const res = onAddCustomApp(parsed.data.label, parsed.data.packageName);
    if (res.ok) {
      setCustomAppFeedback({
        type: 'ok',
        text: tr('Added {label} ({pkg}) to Kiosk allowlist.', {
          label: parsed.data.label,
          pkg: parsed.data.packageName,
        }),
      });
      setCustomAppLabel('');
      setCustomAppPkg('');
    } else {
      setCustomAppFeedback({ type: 'error', text: res.error ?? tr("Could not add app.") });
    }
  };

  const handleBrowserGo = (urlToVisit: string) => {
    setInAppTestResult(null);
    const parsed = browserUrlSchema.safeParse(urlToVisit);
    if (!parsed.success) {
      setBrowserBlockReason(tr(parsed.error.issues[0]?.message ?? 'Blocked by Kiosk Browser policy.'));
      return;
    }
    const res = onNavigateBrowser(parsed.data);
    if (res.ok) {
      setBrowserBlockReason(null);
      setBrowserUrlInput(parsed.data.includes('://') ? parsed.data : `https://${parsed.data}`);
    } else {
      setBrowserBlockReason(res.reason ?? tr("Blocked by Kiosk Browser policy."));
    }
  };

  const triggerEmergencyPanicUi = () => {
    setBrowserBlockReason(null);
    setInAppTestResult(null);
    setBrowserUrlInput('about:blank');
    setNavBlockedMessage(null);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText('').catch(() => {});
    }
    onTriggerPanic();
  };

  const handleSystemNavButton = (buttonName: 'Back' | 'Home' | 'Recents') => {
    if (
      (state.activeScreen === 'app_lock_task' ||
        state.activeScreen === 'self_improvement' ||
        state.activeScreen === 'kiosk_browser') &&
      state.lockTaskActive
    ) {
      setNavBlockedMessage(
        tr('{button} button disabled in startLockTask() mode. Use Exit LockTask with Admin Passcode.', {
          button: tr(buttonName),
        })
      );
      return;
    }
    if (state.activeScreen === 'home') {
      setNavBlockedMessage(tr('KioskLauncherActivity is pinned as HOME launcher.'));
      return;
    }
    if (buttonName === 'Home' && state.activeScreen === 'android_settings') {
      onReturnHome();
    }
  };

  const activeLockTags: string[] = [];
  if (state.isDeviceOwner && state.hardwareLocks?.statusBarDisabled) activeLockTags.push('StatusBarOff');
  if (state.isDeviceOwner && shields.familyDnsMode !== 'off') activeLockTags.push('DNSFilter');
  if (state.isDeviceOwner && shields.blockInAppBrowsers) activeLockTags.push('NoInAppWeb');

  return (
    <div className="flex flex-col items-center">
      <div
        className={`w-full transition-all duration-200 rounded-[28px] bg-slate-900 p-3 border border-slate-800 dark:border-slate-700 ${
          isLandscape ? 'max-w-[660px]' : 'max-w-[400px]'
        }`}
        data-testid="android-device-frame"
      >
        <div
          className={`bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-[20px] overflow-hidden flex flex-col border border-slate-700/40 dark:border-slate-800 ${
            isLandscape ? 'h-[470px]' : 'h-[640px]'
          } ${textScaleClass}`}
        >
          {/* Android System Status Bar */}
          <div className="bg-slate-900 text-slate-100 px-3.5 py-1.5 flex items-center justify-between text-xs font-mono shrink-0 gap-2 border-b border-slate-800">
            <span className="tabular-nums shrink-0">08:31</span>
            <div className="flex items-center gap-1.5 min-w-0">
              {state.hardwareLocks?.cameraDisabled && state.isDeviceOwner && (
                <span className="text-[10px] text-amber-300 shrink-0">CamOff</span>
              )}
              {state.lockTaskActive && (
                <span className="inline-flex items-center gap-1 text-sky-300 shrink-0">
                  <Lock className="w-3 h-3" aria-hidden="true" />
                  <span>LockTask</span>
                </span>
              )}
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="truncate">{state.isDeviceOwner ? tr("DO Active") : tr("Standard")}</span>
              <button
                type="button"
                data-testid="battery-indicator-button"
                aria-expanded={batteryPanelOpen}
                aria-label={tr('Battery {level} percent{charging}. Open battery controls', {
                  level: batteryLevel,
                  charging: isCharging ? tr(', charging') : '',
                })}
                onClick={() => setBatteryPanelOpen((prev) => !prev)}
                className={`ms-0.5 px-1.5 py-0.5 rounded inline-flex items-center gap-1.5 shrink-0 transition-colors ${
                  batteryPanelOpen
                    ? 'bg-slate-800 text-white'
                    : 'hover:bg-slate-800/80 text-slate-100'
                }`}
              >
                <span dir="ltr" className="relative inline-flex items-center" aria-hidden="true">
                  <span className="w-[18px] h-[10px] rounded-[2px] border border-slate-400 p-[1.5px] flex items-center">
                    <span
                      className={`h-full rounded-[1px] transition-all duration-300 ${
                        isCharging
                          ? 'bg-sky-400'
                          : batteryLevel <= 15
                          ? 'bg-red-400'
                          : batteryLevel <= 30
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                      }`}
                      style={{ width: `${Math.max(8, batteryLevel)}%` }}
                    />
                  </span>
                  <span className="w-[2px] h-[5px] bg-slate-400 rounded-r-[1px] ml-[1px]" />
                </span>
                {isCharging && <Zap className="w-2.5 h-2.5 text-sky-400 -ms-0.5" aria-hidden="true" />}
                <span
                  dir="ltr"
                  data-testid="battery-percentage"
                  className={`tabular-nums text-[11px] font-semibold ${
                    isCharging
                      ? 'text-sky-300'
                      : batteryLevel <= 15
                      ? 'text-red-300'
                      : batteryLevel <= 30
                      ? 'text-amber-300'
                      : 'text-slate-100'
                  }`}
                >
                  {batteryLevel}%
                </span>
              </button>
            </div>
          </div>

          {/* Interactive Battery Quick-Settings Drawer */}
          {batteryPanelOpen && (
            <div
              data-testid="battery-control-panel"
              className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3.5 py-3 space-y-2.5 text-xs shrink-0"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <BatteryCharging
                    className={`w-4 h-4 shrink-0 ${
                      isCharging
                        ? 'text-sky-600 dark:text-sky-400'
                        : batteryLevel <= 15
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {tr("Battery ·")} <span dir="ltr">{batteryLevel}%</span>{' '}
                      <span className="font-normal text-slate-500 dark:text-slate-400">
                        {isCharging
                          ? batteryLevel >= 100
                            ? tr("(Fully Charged)")
                            : tr("(Charging)")
                          : batteryLevel <= 15
                          ? tr("(Low Battery)")
                          : tr("(Discharging)")}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums truncate">
                      {isCharging
                        ? batteryLevel >= 100
                          ? tr("Connected to AC power")
                          : tr('~{m}m to full', { m: Math.max(1, Math.round((100 - batteryLevel) * 1.1)) })
                        : tr('~{h}h {m}m screen-on remaining', {
                            h: Math.floor((batteryLevel * 5.2) / 60),
                            m: Math.round((batteryLevel * 5.2) % 60),
                          })}
                      {' · '}
                      {hostBatterySynced
                        ? tr("Host telemetry")
                        : batteryAutoUpdate
                        ? tr("Auto-updating")
                        : tr("Auto-tick paused")}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBatteryPanelOpen(false)}
                  aria-label={tr("Close battery panel")}
                  className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 font-medium px-1.5 py-0.5 shrink-0"
                >
                  {tr("Done")}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="sim-battery-slider" className="text-[11px] text-slate-600 dark:text-slate-400 shrink-0">{"\n                  "}{tr("Level")}{"\n                "}</label>
                <input
                  id="sim-battery-slider"
                  data-testid="battery-level-slider"
                  type="range"
                  min={1}
                  max={100}
                  value={batteryLevel}
                  onChange={(e) => {
                    setHostBatterySynced(false);
                    setBatteryLevel(Number(e.target.value));
                  }}
                  className="flex-1 accent-sky-600 cursor-pointer"
                />
                <div className="flex items-center gap-1 shrink-0">
                  {[15, 50, 100].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setHostBatterySynced(false);
                        setBatteryLevel(preset);
                      }}
                      className={`px-1.5 py-0.5 rounded border text-[10px] font-mono tabular-nums ${
                        batteryLevel === preset
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {preset}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-testid="battery-charging-toggle"
                  onClick={() => {
                    setHostBatterySynced(false);
                    setIsCharging((prev) => !prev);
                  }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium inline-flex items-center gap-1 border transition-colors ${
                    isCharging
                      ? 'bg-sky-600 border-sky-600 text-white hover:bg-sky-700'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <PlugZap className="w-3 h-3" aria-hidden="true" />
                  <span>{isCharging ? tr("Unplug Charger") : tr("Plug in Charger")}</span>
                </button>
                <button
                  type="button"
                  data-testid="battery-auto-toggle"
                  onClick={() => {
                    setHostBatterySynced(false);
                    setBatteryAutoUpdate((prev) => !prev);
                  }}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  {batteryAutoUpdate && !hostBatterySynced ? tr("Pause Auto-Tick") : tr("Resume Auto-Tick")}
                </button>
                {hostBatteryAvailable && (
                  <button
                    type="button"
                    onClick={() => setHostBatterySynced((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                      hostBatterySynced
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {hostBatterySynced ? tr("Host Synced") : tr("Sync Host")}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Policy Blocked Banner inside Device */}
          {state.blockedNotice && (
            <div
              role="alert"
              className="bg-red-50 dark:bg-red-950/60 border-b border-red-200 dark:border-red-800 px-3.5 py-2.5 flex items-start justify-between gap-2 text-xs text-red-900 dark:text-red-200 shrink-0"
            >
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{state.blockedNotice}</span>
              </div>
              <button
                type="button"
                onClick={onDismissNotice}
                aria-label={tr("Dismiss policy alert")}
                className="text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 font-medium px-1.5 py-0.5 shrink-0"
              >{"\n                "}{tr("Dismiss")}{"\n              "}</button>
            </div>
          )}

          {navBlockedMessage && (
            <div
              role="status"
              className="bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-800 px-3.5 py-2 flex items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200 shrink-0"
            >
              <span className="min-w-0 break-words">{navBlockedMessage}</span>
              <button
                type="button"
                onClick={() => setNavBlockedMessage(null)}
                aria-label={tr("Dismiss navigation notice")}
                className="text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 font-medium px-1 shrink-0"
              >
                {tr("Close")}
              </button>
            </div>
          )}

          {/* Device Screen Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {state.activeScreen === 'rebooting' && (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <RefreshCw className="w-8 h-8 text-sky-600 dark:text-sky-400 animate-spin mb-3" aria-hidden="true" />
                <p className="font-semibold text-slate-900 dark:text-slate-100 text-base">{tr("Rebooting Android Device")}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 max-w-xs">
                  {tr('Executing LOCKED_BOOT_COMPLETED, re-enforcing Device Owner restrictions, and restoring KioskLauncherActivity ({mode}) as HOME.', { mode: state.kioskMode })}
                </p>
              </div>
            )}

            {state.activeScreen === 'home' && (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {simIconError ? (
                      <div
                        className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-sky-600 text-white flex items-center justify-center shrink-0"
                        aria-hidden="true"
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                    ) : (
                      <img
                        src="/app-icon.svg"
                        alt={tr("Ironclad OS app icon")}
                        width={32}
                        height={32}
                        onError={() => setSimIconError(true)}
                        className="w-8 h-8 rounded-lg shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <h2
                        dir="auto"
                        className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate"
                      >
                        {state.kioskTitle}
                      </h2>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                        {state.isDeviceOwner
                          ? `${tr('DO Lock')} · ${
                              state.kioskMode === 'single_app'
                                ? tr("Single-App")
                                : state.kioskMode === 'kiosk_browser'
                                ? tr("Locked Browser")
                                : tr("Multi-App HOME")
                            }`
                          : tr("Standard Launcher · Non-Owner")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      data-testid="home-panic-button"
                      onClick={triggerEmergencyPanicUi}
                      title={tr("Emergency Panic: Kill active apps, wipe clipboard, and lock to Kiosk Dashboard")}
                      className="min-h-[38px] px-2 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                    >
                      <OctagonAlert className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{tr("Panic")}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={tr("Admin Settings")}
                      onClick={() => {
                        setPinEntry('');
                        setPinError(null);
                        onOpenPinGate('admin_settings');
                      }}
                      className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1"
                    >
                      <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{"\n                        "}{tr("Admin")}<span className="hidden sm:inline">{" "}{tr("Settings")}</span>
                      </span>
                    </button>
                  </div>
                </div>

                {/* Single-App / Kiosk Browser Quick Launch Callout */}
                {state.kioskMode !== 'multi_app' && (
                  <div className="mt-3 p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 flex items-center justify-between gap-2">
                    <div className="min-w-0 text-xs">
                      <div className="font-semibold text-sky-900 dark:text-sky-200">
                        {state.kioskMode === 'kiosk_browser'
                          ? tr("Dedicated Kiosk Browser Configured")
                          : tr("Single-App Dedicated Lock Configured")}
                      </div>
                      <div className="text-[11px] text-sky-800 dark:text-sky-300 font-mono truncate">
                        {state.kioskMode === 'kiosk_browser'
                          ? KIOSK_BROWSER_PACKAGE
                          : state.singleAppPackage ?? tr("Not selected")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleAppLaunchRequest(
                          state.kioskMode === 'kiosk_browser'
                            ? KIOSK_BROWSER_PACKAGE
                            : state.singleAppPackage ?? SELF_IMPROVEMENT_PACKAGE
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-semibold whitespace-nowrap shrink-0"
                    >{"\n                      "}{tr("Enter Lock")}{"\n                    "}</button>
                  </div>
                )}

                {/* Active Emergency Panic Lock Banner */}
                {panicLockMinutes > 0 && (
                  <div
                    role="status"
                    data-testid="panic-lock-banner"
                    className="mt-3 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold inline-flex items-center gap-1.5 tabular-nums">
                        <OctagonAlert className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" aria-hidden="true" />
                        <span>{tr("Emergency Panic Lock ·")} {tr('{m}m left', { m: panicLockMinutes })}</span>
                      </div>
                      <div className="text-[11px] text-red-800 dark:text-red-300 truncate">
                        {tr("Apps killed · Clipboard wiped")}{state.lastClipboardWipedAt ? ` (${state.lastClipboardWipedAt})` : ''} {tr("· Locked to Dashboard")}
                      </div>
                    </div>
                  </div>
                )}

                {/* Active Focus Lock or Quiet Hours Banner */}
                {(focusBlockMinutes > 0 || downtimeActive) && (
                  <div className="mt-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-semibold">
                        {focusBlockMinutes > 0
                          ? tr('Freedom Focus Lock · {m}m left', { m: focusBlockMinutes })
                          : tr('Quiet Hours ({start}:00–{end}:00) Active', {
                              start: String(downtime.startHour).padStart(2, '0'),
                              end: String(downtime.endHour).padStart(2, '0'),
                            })}
                      </span>
                      <div className="text-[11px] text-amber-800 dark:text-amber-300 truncate">
                        {tr("Focus & Growth remains open; other apps paused.")}
                      </div>
                    </div>
                  </div>
                )}

                {/* Accountability Dashboard: Current Streak & Daily Habits */}
                <KioskAccountabilityDashboard
                  selfImprovement={selfImprovement}
                  isLandscape={isLandscape}
                  onLogCleanDay={onLogCleanDay}
                  onToggleHabitToday={onToggleHabitToday}
                  onOpenFocusGrowth={() => {
                    if (state.allowedPackages.includes(SELF_IMPROVEMENT_PACKAGE)) {
                      handleAppLaunchRequest(SELF_IMPROVEMENT_PACKAGE);
                    } else {
                      onOpenFullSelfImprovement();
                    }
                  }}
                />

                {/* Allowed Apps Grid */}
                <div className="mt-3.5 flex-1">
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400 shrink-0">{"\n                      "}{tr("Allowed Kiosk Apps (")}{visibleApps.length})
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                      {activeLockTags.join(' · ') || 'startLockTask()'}
                    </span>
                  </div>

                  {visibleApps.length === 0 ? (
                    <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 text-center bg-white dark:bg-slate-900">
                      <p className="text-xs text-slate-600 dark:text-slate-400">{"\n                        "}{tr("No applications are currently allowed on the Kiosk Home screen. Open Admin Settings (default PIN 1234) to enable apps.")}{"\n                      "}</p>
                    </div>
                  ) : (
                    <div
                      className={`grid gap-2.5 ${
                        isLandscape ? 'grid-cols-3' : 'grid-cols-2'
                      }`}
                    >
                      {visibleApps.map((app) => {
                        const limitMins = (state.appTimeLimits ?? {})[app.packageName] ?? 0;
                        const remSec = getAppRemainingSeconds(state, app.packageName);
                        const blockReason = getAppScheduleOrLimitBlockReason(state, app.packageName);
                        const passwordProtected = isAppPasswordProtected(state, app.packageName);
                        const remDisplay =
                          remSec !== null
                            ? remSec <= 0
                              ? tr("0m left · Blocked")
                              : tr('{r}m / {l}m left', { r: Math.ceil(remSec / 60), l: limitMins })
                            : null;
                        return (
                          <button
                            key={app.packageName}
                            type="button"
                            data-testid={`kiosk-home-app-${app.packageName}`}
                            onClick={() => handleAppLaunchRequest(app.packageName)}
                            className={`min-h-[82px] p-3 rounded-xl border transition-colors flex flex-col items-start justify-between text-start focus-visible:outline-2 focus-visible:outline-sky-600 ${
                              blockReason
                                ? 'border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800/80'
                                : app.packageName === SELF_IMPROVEMENT_PACKAGE ||
                                  app.packageName === KIOSK_BROWSER_PACKAGE
                                ? 'border-sky-300 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/40 hover:bg-sky-100/60 dark:hover:bg-sky-900/50'
                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-sky-400 dark:hover:border-sky-600 hover:bg-sky-50/40 dark:hover:bg-slate-800/80'
                            }`}
                          >
                            <div className="w-full flex items-center justify-between gap-2">
                              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-sky-700 dark:text-sky-400 flex items-center justify-center">
                                {getAppIcon(app.packageName, 'w-4 h-4')}
                              </div>
                              {passwordProtected && (
                                <span
                                  title={tr('App Access PIN required')}
                                  className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 shrink-0"
                                >
                                  <Lock className="w-3 h-3" aria-label={tr('Password required')} />
                                </span>
                              )}
                            </div>
                            <div className="w-full mt-2">
                              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {app.label}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                                {app.packageName}
                              </div>
                              {(remDisplay || blockReason) && (
                                <div
                                  className={`text-[10px] font-mono mt-1 truncate tabular-nums ${
                                    blockReason
                                      ? 'text-red-700 dark:text-red-400 font-semibold'
                                      : 'text-sky-700 dark:text-sky-400'
                                  }`}
                                >
                                  {remSec !== null && remSec <= 0
                                    ? tr('Limit reached ({m}m/d)', { m: limitMins })
                                    : blockReason
                                    ? blockReason.includes('Panic')
                                      ? tr("Locked (Panic Mode)")
                                      : focusBlockMinutes > 0
                                      ? tr("Paused (Focus Lock)")
                                      : tr("Paused (Quiet Hours)")
                                    : remDisplay}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Blocked Actions Verification Bar */}
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">{"\n                    "}{tr("Restricted System Actions (Passcode Required)")}{"\n                  "}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onLaunchApp('com.android.settings')}
                      className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <Settings className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                      <span>{tr("Android Settings")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onAttemptUninstall('com.enterprise.pos')}
                      className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                      <span>{tr("Uninstall App")}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Locked Kiosk Browser & BlockP Filter Screen */}
            {state.activeScreen === 'kiosk_browser' && (
              <div className="h-full flex flex-col justify-between space-y-2.5">
                <div className="space-y-2.5">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" aria-hidden="true" />
                        <span>{tr("Locked Kiosk Browser")}</span>
                      </div>
                      <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium truncate">{"\n                        "}{tr("SafeSearch · No Incognito · Keywords ·")}{" "}{shields.familyDnsMode === 'off' ? tr("Standard DNS") : `DNS: ${shields.familyDnsMode}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {activeAppRemainingSec !== null && (
                        <button
                          type="button"
                          onClick={() => onAdvanceAppUsage(KIOSK_BROWSER_PACKAGE, 300)}
                          className="px-2 py-1 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-[10px] font-mono font-semibold text-amber-900 dark:text-amber-200 whitespace-nowrap shrink-0 tabular-nums"
                        >
                          {formatCountdown(activeAppRemainingSec)} · +5m
                        </button>
                      )}
                      <button
                        type="button"
                        data-testid="browser-panic-button"
                        onClick={triggerEmergencyPanicUi}
                        title={tr("Emergency Panic: Kill browser & apps, wipe clipboard, and lock to Kiosk Dashboard")}
                        className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                      >
                        <OctagonAlert className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{tr("Panic")}</span>
                      </button>
                    </div>
                  </div>

                  {/* URL Bar */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleBrowserGo(browserUrlInput);
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      type="text"
                      aria-label={tr("Kiosk browser URL")}
                      value={browserUrlInput}
                      onChange={(e) => setBrowserUrlInput(e.target.value)}
                      placeholder="https://wikipedia.org"
                      className="min-w-0 flex-1 h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono text-xs focus:outline-2 focus:outline-sky-600"
                    />
                    <button
                      type="submit"
                      className="h-9 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                    >{"\n                      "}{tr("Go")}{"\n                    "}</button>
                  </form>

                  {/* Allowed & Blocked Quick Test Links */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{"\n                      "}{tr("Domain, Keyword & Feed Filter Verification")}{"\n                    "}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {state.allowedDomains.slice(0, 2).map((domain) => (
                        <button
                          key={domain}
                          type="button"
                          onClick={() => handleBrowserGo(`https://${domain}`)}
                          className="px-2 py-1 rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-mono text-[11px] hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
                        >
                          {domain}
                        </button>
                      ))}
                      {[
                        { label: tr('Test instagram.com'), url: 'https://instagram.com' },
                        { label: tr('Test pornhub.com'), url: 'https://pornhub.com' },
                        { label: tr('Test ?q=nsfw'), url: 'https://wikipedia.org?q=nsfw' },
                        { label: tr('Test /shorts'), url: 'https://wikipedia.org/shorts' },
                      ].map((t) => (
                        <button
                          key={t.label}
                          type="button"
                          onClick={() => handleBrowserGo(t.url)}
                          className="px-2 py-1 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-300 font-mono text-[11px] hover:bg-red-100 dark:hover:bg-red-900/60 inline-flex items-center gap-1"
                        >
                          <ShieldBan className="w-3 h-3" aria-hidden="true" />
                          <span>{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* In-App Browser Whitelist Simulator (BlockP Feature) */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 space-y-1.5">
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">{"\n                      "}{tr("Test In-App Browser Guard (")}{shields.blockInAppBrowsers ? tr("Whitelist Only") : tr("Shield Off")})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setBrowserBlockReason(null);
                          setInAppTestResult(onTestInAppBrowser('com.Slack'));
                        }}
                        className="px-2 py-1 rounded border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-300 font-mono text-[11px] hover:bg-sky-100 dark:hover:bg-sky-900/50"
                      >{"\n                        "}{tr("In-App: com.Slack")}{"\n                      "}</button>
                      <button
                        type="button"
                        onClick={() => {
                          setBrowserBlockReason(null);
                          setInAppTestResult(onTestInAppBrowser('com.reddit.frontpage'));
                        }}
                        className="px-2 py-1 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-300 font-mono text-[11px] hover:bg-amber-100 dark:hover:bg-amber-900/50"
                      >{"\n                        "}{tr("In-App: com.reddit.frontpage")}{"\n                      "}</button>
                    </div>
                    {inAppTestResult && (
                      <div
                        role="status"
                        className={`text-[11px] font-medium p-2 rounded border ${
                          inAppTestResult.allowed
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                            : 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                        }`}
                      >
                        {inAppTestResult.reason}
                      </div>
                    )}
                  </div>

                  {/* Block Alert if Distraction or Keyword/Shorts Attempted */}
                  {browserBlockReason && (
                    <div
                      role="alert"
                      className="bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-start gap-2 text-xs text-red-900 dark:text-red-200"
                    >
                      <ShieldBan className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
                      <div>
                        <div className="font-bold">{tr("Blocked by Kiosk Browser Domain Guard")}</div>
                        <p className="text-[11px] mt-0.5">{browserBlockReason}</p>
                      </div>
                    </div>
                  )}

                  {/* Active Safe Viewport */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono font-semibold text-sky-800 dark:text-sky-400 truncate">
                        {state.browserCurrentUrl}
                      </span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold shrink-0">{tr("Verified")}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">{"\n                      "}{tr("Pinned WebView active inside")}{" "}<code className="font-mono">startLockTask()</code>{tr(". Downloads disabled; incognito blocked via Chrome managed policy.")}{"\n                    "}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPinEntry('');
                    setPinError(null);
                    onOpenPinGate('exit_lock_task');
                  }}
                  className="w-full min-h-[40px] px-4 py-2 rounded-lg bg-slate-900 dark:bg-sky-600 text-white text-xs font-semibold hover:bg-slate-800 dark:hover:bg-sky-500 inline-flex items-center justify-center gap-2"
                >
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{tr("Exit LockTask (Admin Passcode)")}</span>
                </button>
              </div>
            )}

            {/* Integrated Self-Improvement App running inside LockTask */}
            {state.activeScreen === 'self_improvement' && (
              <div className="space-y-3">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">{tr("Focus & Growth")}</div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium tabular-nums">{"\n                      "}{tr("LockTask Pinned ·")}{" "}{selfImprovement.cleanStreakDays}{" "}{tr("Clean Days")}{"\n                    "}</div>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenFullSelfImprovement}
                    className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-semibold whitespace-nowrap"
                  >{"\n                    "}{tr("Open Full Editor")}{"\n                  "}</button>
                </div>

                <div
                  role="tablist"
                  aria-label={tr("Focus and growth sections")}
                  className="grid grid-cols-3 gap-1 bg-slate-200/70 dark:bg-slate-900 border border-transparent dark:border-slate-800 p-1 rounded-lg"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={kioskSiTab === 'today'}
                    onClick={() => setKioskSiTab('today')}
                    className={`py-1.5 rounded text-[11px] font-semibold ${
                      kioskSiTab === 'today'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {tr("Today")}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={kioskSiTab === 'timer'}
                    onClick={() => setKioskSiTab('timer')}
                    className={`py-1.5 rounded text-[11px] font-semibold ${
                      kioskSiTab === 'timer'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {tr("Focus Timer")}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={kioskSiTab === 'diary'}
                    onClick={() => setKioskSiTab('diary')}
                    className={`py-1.5 rounded text-[11px] font-semibold ${
                      kioskSiTab === 'diary'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {tr("Quick Diary")}
                  </button>
                </div>

                {kioskSiTab === 'today' ? (
                  <div className="space-y-2.5">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{tr("Clean Day Check-In")}</div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400">
                          {tr("No porn · No social media")}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={onLogCleanDay}
                        disabled={selfImprovement.lastCleanCheckInDate === today}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-sky-600 disabled:bg-emerald-700 dark:disabled:bg-emerald-700 text-white text-[11px] font-semibold"
                      >
                        {selfImprovement.lastCleanCheckInDate === today ? tr("Logged") : tr("+1 Day")}
                      </button>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-1.5">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{tr("Today's Habits")}</div>
                      {selfImprovement.habits.map((h) => {
                        const done = h.completedDates.includes(today);
                        return (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => onToggleHabitToday(h.id)}
                            className="w-full py-1.5 flex items-center justify-between text-start border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                          >
                            <span className="text-xs text-slate-800 dark:text-slate-200 truncate pe-2">{tr(h.title)}</span>
                            <span
                              className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                                done
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950'
                              }`}
                            >
                              {done && <Check className="w-3 h-3" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-1.5">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{tr("Active Tasks")}</div>
                      {selfImprovement.tasks.slice(0, 3).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onToggleTask(t.id)}
                          className="w-full py-1.5 flex items-center justify-between text-start border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                        >
                          <span
                            className={`text-xs truncate pe-2 ${
                              t.completed ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {tr(t.title)}
                          </span>
                          <span
                            className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                              t.completed
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950'
                            }`}
                          >
                            {t.completed && <Check className="w-3 h-3" />}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : kioskSiTab === 'timer' ? (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 text-center">
                    <div className="text-[11px] font-semibold text-sky-700 dark:text-sky-400 tabular-nums">
                      {tr("LockTask Focus Sprint ·")} {tr('{m}m today', { m: simFocusSummary.minutes })}
                    </div>
                    <div className="text-4xl font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                      {formatCountdown(simSecondsLeft)}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[15, 25, 45].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          aria-pressed={simTimerMins === mins}
                          onClick={() => {
                            setSimTimerRunning(false);
                            setSimTimerMins(mins);
                            setSimSecondsLeft(mins * 60);
                            setSimTimerLogged(false);
                          }}
                          className={`py-1.5 rounded border text-xs font-mono font-semibold ${
                            simTimerMins === mins
                              ? 'bg-slate-900 dark:bg-sky-600 border-slate-900 dark:border-sky-500 text-white'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {tr('{m}m', { m: mins })}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSimTimerLogged(false);
                          setSimTimerRunning((prev) => !prev);
                        }}
                        className="h-9 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold"
                      >
                        {simTimerRunning ? tr("Pause") : tr("Start Focus")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSimTimerRunning(false);
                          onRecordFocusSession(simTimerMins, 'Kiosk LockTask Focus Sprint');
                          setSimSecondsLeft(simTimerMins * 60);
                          setSimTimerLogged(true);
                        }}
                        className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                      >{"\n                        "}{tr("Complete")}{"\n                      "}</button>
                    </div>
                    {simTimerLogged && (
                      <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">{"\n                        "}{tr("Focus session logged.")}{"\n                      "}</p>
                    )}
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!canRunSubmit('quick_diary')) return;
                      const parsed = quickDiaryFormSchema.safeParse({
                        title: quickNoteTitle,
                        body: quickNoteBody,
                      });
                      if (!parsed.success) {
                        setQuickNoteError(tr(parsed.error.issues[0]?.message ?? 'Write a reflection before saving.'));
                        return;
                      }
                      setQuickNoteError(null);
                      onQuickSaveDiaryNote(
                        parsed.data.title || `Kiosk Diary — ${today}`,
                        `<p>${escapeHtml(parsed.data.body)}</p>`
                      );
                      setQuickNoteTitle('');
                      setQuickNoteBody('');
                      setQuickNoteSaved(true);
                      if (quickNoteTimerRef.current !== null) {
                        window.clearTimeout(quickNoteTimerRef.current);
                      }
                      quickNoteTimerRef.current = window.setTimeout(() => setQuickNoteSaved(false), 2000);
                    }}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2"
                  >
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{tr("Quick Diary / Trigger Entry")}</div>
                    <input
                      type="text"
                      aria-label={tr("Diary entry title")}
                      maxLength={120}
                      value={quickNoteTitle}
                      onChange={(e) => {
                        setQuickNoteError(null);
                        setQuickNoteTitle(e.target.value);
                      }}
                      placeholder={tr("Entry title...")}
                      className="w-full h-8 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs"
                    />
                    <textarea
                      rows={4}
                      aria-label={tr("Diary reflection")}
                      maxLength={5000}
                      value={quickNoteBody}
                      onChange={(e) => {
                        setQuickNoteError(null);
                        setQuickNoteBody(e.target.value);
                      }}
                      placeholder={tr("Log a reflection, goal progress, or urge trigger...")}
                      className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs"
                    />
                    {quickNoteError && (
                      <p role="alert" className="text-[11px] font-medium text-red-600 dark:text-red-400">
                        {quickNoteError}
                      </p>
                    )}
                    {quickNoteSaved && (
                      <p role="status" className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                        {tr("Saved to Notebooks & Diary.")}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={!quickNoteBody.trim()}
                      className="w-full h-8 rounded-lg bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-45 text-white text-xs font-semibold"
                    >
                      {tr("Save Diary Entry")}
                    </button>
                  </form>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setPinEntry('');
                    setPinError(null);
                    onOpenPinGate('exit_lock_task');
                  }}
                  className="w-full min-h-[40px] px-4 py-2 rounded-lg bg-slate-900 dark:bg-sky-600 text-white text-xs font-semibold hover:bg-slate-800 dark:hover:bg-sky-500 inline-flex items-center justify-center gap-2"
                >
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{tr("Exit LockTask (Admin Passcode)")}</span>
                </button>
              </div>
            )}

            {state.activeScreen === 'app_lock_task' && !activeApp && (
              <div className="h-full flex flex-col items-center justify-center text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                <ShieldAlert className="w-8 h-8 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {tr("Application Unavailable")}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    {tr("The selected LockTask package is no longer available on this device.")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onReturnHome}
                  className="min-h-[38px] px-4 py-2 rounded-lg bg-slate-900 dark:bg-sky-600 text-white text-xs font-semibold hover:bg-slate-800 dark:hover:bg-sky-500"
                >
                  {tr("Return to Kiosk Home")}
                </button>
              </div>
            )}

            {state.activeScreen === 'app_lock_task' && activeApp && (
              <div className="h-full flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <div>
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0">
                        {getAppIcon(activeApp.packageName, 'w-5 h-5')}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                          {activeApp.label}
                        </h3>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          {activeApp.packageName}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
                      {state.lockTaskActive ? tr("LockTask Pinned") : tr("Standard Task")}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">
                    {activeApp.description}
                  </p>

                  <div className="mt-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{tr("Active Kiosk Isolation")}</div>
                    <div>
                      {tr("Launched via")}{' '}
                      <code className="font-mono text-sky-700 dark:text-sky-400">startLockTask()</code>{tr(". Status bar expansion, task switching, and Home navigation are locked.")}
                    </div>
                  </div>

                  {activeAppRemainingSec !== null && (
                    <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2">
                      <div className="text-xs text-amber-950 dark:text-amber-200">
                        <div className="font-semibold">{tr("AppBlock Daily Timer")}</div>
                        <div className="text-[11px] font-mono tabular-nums">
                          {formatCountdown(activeAppRemainingSec)}{" "}{tr("left of")}{" "}{activeAppLimitMins}m/day
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onAdvanceAppUsage(activeApp.packageName, 300)}
                        className="px-2.5 py-1.5 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-[11px] font-semibold text-amber-900 dark:text-amber-200 whitespace-nowrap"
                      >
                        {tr("Simulate +5m Usage")}
                      </button>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPinEntry('');
                      setPinError(null);
                      onOpenPinGate('exit_lock_task');
                    }}
                    className="w-full min-h-[42px] px-4 py-2 rounded-lg bg-slate-900 dark:bg-sky-600 text-white text-xs font-semibold hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{tr("Exit LockTask (Admin Passcode)")}</span>
                  </button>
                </div>
              </div>
            )}

            {state.activeScreen === 'pin_gate' && (
              <div className="h-full flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{tr("Administrator Passcode")}</h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        {state.pinGateTarget === 'exit_lock_task'
                          ? tr("Verify passcode to stop LockTask and return Home.")
                          : tr("Enter Admin passcode (default 1234, up to 50 chars).")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPinEntry('');
                        setPinError(null);
                        onCancelPinGate();
                      }}
                      className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 px-2 py-1"
                    >{"\n                      "}{tr("Cancel")}{"\n                    "}</button>
                  </div>

                  <form onSubmit={handlePinSubmit} className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="kiosk-pin-input" className="text-xs font-medium text-slate-700 dark:text-slate-300">{"\n                        "}{tr("Passcode (letters, digits, symbols · 4–50 chars)")}{"\n                      "}</label>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {pinEntry.length}/{MAX_ADMIN_PIN_LENGTH}
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        id="kiosk-pin-input"
                        type={showPinEntry ? 'text' : 'password'}
                        maxLength={MAX_ADMIN_PIN_LENGTH}
                        value={pinEntry}
                        disabled={lockoutRemaining > 0}
                        onChange={(e) => {
                          setPinError(null);
                          setPinEntry(e.target.value);
                        }}
                        placeholder={tr("Enter passcode...")}
                        className="w-full h-10 ps-3 pe-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono text-sm focus:outline-2 focus:outline-sky-600 disabled:bg-slate-100 dark:disabled:bg-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPinEntry((prev) => !prev)}
                        aria-label={showPinEntry ? tr("Hide passcode") : tr("Show passcode")}
                        className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                      >
                        {showPinEntry ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {(pinError || lockoutRemaining > 0) && (
                      <p role="alert" className="text-xs text-red-600 dark:text-red-400 mt-1.5 font-medium">
                        {lockoutRemaining > 0
                          ? tr('Security cooldown active ({s}s remaining).', { s: lockoutRemaining })
                          : pinError}
                      </p>
                    )}

                    {/* Quick Numeric Keypad (helpful for default 1234; keyboard supports full 50-char strings) */}
                    <div
                      role="group"
                      aria-label={tr("Numeric passcode keypad")}
                      className="grid grid-cols-3 gap-2 mt-3"
                    >
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                        <button
                          key={digit}
                          type="button"
                          disabled={lockoutRemaining > 0}
                          onClick={() => handlePinDigit(digit)}
                          className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 disabled:opacity-40"
                        >
                          {digit}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setPinEntry('');
                          setPinError(null);
                        }}
                        className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200"
                      >{"\n                        "}{tr("Clear")}{"\n                      "}</button>
                      <button
                        type="button"
                        disabled={lockoutRemaining > 0}
                        onClick={() => handlePinDigit('0')}
                        className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 disabled:opacity-40"
                      >
                        0
                      </button>
                      <button
                        type="submit"
                        disabled={lockoutRemaining > 0}
                        className="h-9 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold disabled:opacity-40"
                      >{"\n                        "}{tr("Unlock")}{"\n                      "}</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {state.activeScreen === 'admin_settings' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{tr("Admin Settings")}</h3>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">{"\n                      "}{tr("Modes, BlockP/BlockerX shields, hardware locks & 50-char passcode")}{"\n                    "}</p>
                  </div>
                  <button
                    type="button"
                    onClick={onReturnHome}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-sky-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-sky-500 whitespace-nowrap shrink-0"
                  >{"\n                    "}{tr("Lock & Home")}{"\n                  "}</button>
                </div>

                {/* System Settings & Uninstall Unlock Section */}
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{"\n                        "}{tr("Settings & Uninstall Unlock")}{"\n                      "}</div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400">{"\n                        "}{tr("Auto re-locks when returning Home or rebooting.")}{"\n                      "}</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={state.adminUnlocked}
                      aria-label={tr("Unlock Android Settings and Uninstall")}
                      onClick={() => onSetAdminUnlock(!state.adminUnlocked)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                        state.adminUnlocked
                          ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                          : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {state.adminUnlocked ? (
                        <>
                          <Unlock className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{tr("Unlocked")}</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{tr("Locked")}</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onLaunchApp('com.android.settings')}
                      className="flex-1 min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap"
                    >{"\n                      "}{tr("Open Settings")}{"\n                    "}</button>
                    <button
                      type="button"
                      onClick={() => onAttemptUninstall('com.enterprise.pos')}
                      className="flex-1 min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap"
                    >{"\n                      "}{tr("Test Uninstall")}{"\n                    "}</button>
                  </div>
                </div>

                {/* Kiosk Mode & Custom Branding */}
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{"\n                    "}{tr("Kiosk Operation Mode & Branding")}{"\n                  "}</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { id: 'multi_app', label: 'Multi-App' },
                        { id: 'single_app', label: 'Single-App' },
                        { id: 'kiosk_browser', label: 'Browser Only' },
                      ] as const
                    ).map((modeOpt) => (
                      <button
                        key={modeOpt.id}
                        type="button"
                        aria-pressed={state.kioskMode === modeOpt.id}
                        onClick={() => onSetKioskMode(modeOpt.id, state.singleAppPackage)}
                        className={`py-1.5 px-2 rounded-lg border text-[11px] font-semibold whitespace-nowrap ${
                          state.kioskMode === modeOpt.id
                            ? 'bg-sky-600 border-sky-600 text-white'
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {tr(modeOpt.label)}
                      </button>
                    ))}
                  </div>

                  {state.kioskMode === 'single_app' && (
                    <div>
                      <label htmlFor="single-app-select" className="block text-[11px] text-slate-600 dark:text-slate-400 mb-0.5">
                        {tr("Dedicated Single App")}
                      </label>
                      <select
                        id="single-app-select"
                        value={state.singleAppPackage ?? SELF_IMPROVEMENT_PACKAGE}
                        onChange={(e) => onSetKioskMode('single_app', e.target.value)}
                        className="w-full h-8 px-2 rounded border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      >
                        {allInstalledApps
                          .filter((a) => !a.isSystemRestricted)
                          .map((a) => (
                            <option key={a.packageName} value={a.packageName}>
                              {a.label} ({a.packageName})
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex flex-wrap sm:flex-nowrap items-end gap-2">
                      <div className="flex-1 min-w-0">
                        <label htmlFor="kiosk-title-input" className="block text-[11px] text-slate-600 dark:text-slate-400 mb-0.5">
                          {tr("Custom Launcher Title")}
                        </label>
                        <input
                          id="kiosk-title-input"
                          type="text"
                          maxLength={80}
                          value={kioskTitleDraft}
                          onChange={(e) => {
                            setKioskTitleError(null);
                            setKioskTitleDraft(e.target.value);
                          }}
                          className="w-full h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!canRunSubmit('save_title')) return;
                          const parsed = kioskTitleSchema.safeParse({ title: kioskTitleDraft });
                          if (!parsed.success) {
                            setKioskTitleError(tr(parsed.error.issues[0]?.message ?? 'Title cannot be empty.'));
                            return;
                          }
                          setKioskTitleError(null);
                          setKioskTitleDraft(parsed.data.title);
                          onUpdateKioskTitle(parsed.data.title);
                          setTitleSavedNotice(true);
                          if (titleTimerRef.current !== null) {
                            window.clearTimeout(titleTimerRef.current);
                          }
                          titleTimerRef.current = window.setTimeout(() => setTitleSavedNotice(false), 1800);
                        }}
                        className="h-8 px-3 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0"
                      >
                        {titleSavedNotice ? tr("Saved") : tr("Save Title")}
                      </button>
                    </div>
                    {kioskTitleError && (
                      <p role="alert" className="text-[11px] font-medium text-red-600 dark:text-red-400">
                        {kioskTitleError}
                      </p>
                    )}
                  </div>
                </div>

                {/* Unified Web, In-App Browser & Porn Blocker (BlockP / BlockerX) */}
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {tr("Web, In-App & Porn Shields (BlockP)")}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAppLaunchRequest(KIOSK_BROWSER_PACKAGE)}
                      className="text-[11px] font-semibold text-sky-700 dark:text-sky-400 hover:text-sky-900 dark:hover:text-sky-300 whitespace-nowrap"
                    >
                      {tr("Open Browser")}
                    </button>
                  </div>

                  {/* Strict Anti-Relapse Shield Time-Lock */}
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {strictLockMinutes > 0
                          ? tr('Strict Shield Lock: {m}m left', { m: strictLockMinutes })
                          : tr("Strict Anti-Relapse Time-Lock")}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {tr("Prevents turning off filters during urges")}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (!canRunSubmit('strict_lock')) return;
                          onActivateStrictLock(60);
                          setShieldFeedback({ type: 'ok', text: tr('Shields time-locked for 60 minutes.') });
                        }}
                        className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-[10px] font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap"
                      >
                        {tr("Lock 1h")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!canRunSubmit('strict_lock')) return;
                          onActivateStrictLock(1440);
                          setShieldFeedback({ type: 'ok', text: tr('Shields time-locked for 24 hours.') });
                        }}
                        className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-[10px] font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap"
                      >
                        {tr("Lock 24h")}
                      </button>
                    </div>
                  </div>

                  {/* 4 Blocker Switches */}
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {BLOCKER_SHIELD_ITEMS.map((item) => {
                      const active = shields[item.key];
                      return (
                        <div key={item.key} className="py-1.5 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                              {tr(item.label)}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{tr(item.hint)}</div>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={active}
                            aria-label={tr(item.label)}
                            onClick={() => {
                              const res = onToggleBlockerShield(item.key);
                              if (!res.ok && res.error) {
                                setShieldFeedback({ type: 'error', text: res.error });
                              } else {
                                setShieldFeedback(null);
                              }
                            }}
                            className={`min-w-[48px] px-2 py-1 rounded text-[11px] font-semibold border transition-colors shrink-0 ${
                              active
                                ? 'bg-slate-900 dark:bg-sky-600 border-slate-900 dark:border-sky-500 text-white'
                                : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {active ? tr("On") : tr("Off")}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Family Private DNS + VPN Block */}
                  <div>
                    <div className="text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {tr("Family Private DNS & VPN Lock")}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'cloudflare', label: 'Cloudflare' },
                          { id: 'cleanbrowsing', label: 'CleanBrowsing' },
                          { id: 'off', label: 'Off' },
                        ] as const
                      ).map((dnsOpt) => (
                        <button
                          key={dnsOpt.id}
                          type="button"
                          aria-pressed={shields.familyDnsMode === dnsOpt.id}
                          onClick={() => {
                            const res = onSetFamilyDnsMode(dnsOpt.id);
                            if (!res.ok && res.error) {
                              setShieldFeedback({ type: 'error', text: res.error });
                            } else {
                              setShieldFeedback(null);
                            }
                          }}
                          className={`py-1 px-2 rounded border text-[11px] font-semibold whitespace-nowrap ${
                            shields.familyDnsMode === dnsOpt.id
                              ? 'bg-sky-600 border-sky-600 text-white'
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {tr(dnsOpt.label)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* In-App Whitelist, Allowed Domains & Blocked Keywords */}
                  <div className="space-y-1.5 pt-1">
                    <div>
                      <label htmlFor="inapp-whitelist-input" className="block text-[10px] text-slate-600 dark:text-slate-400 mb-0.5">
                        {tr("In-App Browser Whitelist (comma-separated packages)")}
                      </label>
                      <input
                        id="inapp-whitelist-input"
                        type="text"
                        value={inAppWhitelistDraft}
                        onChange={(e) => setInAppWhitelistDraft(e.target.value)}
                        className="w-full h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-mono text-[11px]"
                      />
                    </div>
                    <div>
                      <label htmlFor="allowed-domains-input" className="block text-[10px] text-slate-600 dark:text-slate-400 mb-0.5">
                        {tr("Kiosk Browser Allowed Domains")}
                      </label>
                      <input
                        id="allowed-domains-input"
                        type="text"
                        value={domainsDraft}
                        onChange={(e) => setDomainsDraft(e.target.value)}
                        className="w-full h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-mono text-[11px]"
                      />
                    </div>
                    <div>
                      <label htmlFor="blocked-keywords-input" className="block text-[10px] text-slate-600 dark:text-slate-400 mb-0.5">
                        {tr("Blocked Search / URL Keywords")}
                      </label>
                      <input
                        id="blocked-keywords-input"
                        type="text"
                        value={keywordsDraft}
                        onChange={(e) => setKeywordsDraft(e.target.value)}
                        className="w-full h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-mono text-[11px]"
                      />
                    </div>
                  </div>

                  {shieldFeedback && (
                    <p
                      role="status"
                      className={`text-[11px] font-medium ${
                        shieldFeedback.type === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {shieldFeedback.text}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (!canRunSubmit('save_blockers')) return;
                      onUpdateInAppWhitelist(inAppWhitelistDraft.split(','));
                      onUpdateAllowedDomains(domainsDraft.split(','));
                      onUpdateBlockedKeywords(keywordsDraft.split(','));
                      setShieldFeedback({ type: 'ok', text: tr('Saved whitelist, domains & keywords.') });
                    }}
                    className="w-full min-h-[34px] rounded-lg bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 text-white text-xs font-semibold"
                  >
                    {tr("Save Blocker Lists")}
                  </button>
                </div>

                {/* Strong Admin Restrictions (UserManager) */}
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {tr("Strong Admin Restrictions (UserManager)")}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {ADMIN_RESTRICTION_TOGGLE_ITEMS.map((item) => {
                      const active = (state.adminRestrictions ?? DEFAULT_ADMIN_RESTRICTIONS)[item.key];
                      return (
                        <div
                          key={item.key}
                          className="py-1.5 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                              {tr(item.label)}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                              {item.apiHint}
                            </div>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={active}
                            aria-label={tr(item.label)}
                            onClick={() => onToggleAdminRestriction(item.key)}
                            className={`min-w-[48px] px-2 py-1 rounded text-[11px] font-semibold border transition-colors shrink-0 ${
                              active
                                ? 'bg-slate-900 dark:bg-sky-600 border-slate-900 dark:border-sky-500 text-white'
                                : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {active ? tr("On") : tr("Off")}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Hardware & Anti-Tamper Lockdown */}
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {tr("Hardware & Anti-Tamper Lockdown")}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {HARDWARE_TOGGLE_ITEMS.map((item) => {
                      const active = state.hardwareLocks?.[item.key] ?? false;
                      return (
                        <div
                          key={item.key}
                          className="py-1.5 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                              {tr(item.label)}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                              {item.apiHint}
                            </div>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={active}
                            aria-label={tr(item.label)}
                            onClick={() => onToggleHardwarePolicy(item.key)}
                            className={`min-w-[48px] px-2 py-1 rounded text-[11px] font-semibold border transition-colors shrink-0 ${
                              active
                                ? 'bg-slate-900 dark:bg-sky-600 border-slate-900 dark:border-sky-500 text-white'
                                : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {active ? tr("On") : tr("Off")}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Add Any Custom App to Device & Allowlist */}
                <form
                  onSubmit={handleAddCustomAppSubmit}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2"
                >
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{"\n                    "}{tr("Add Any App to Kiosk")}{"\n                  "}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="min-w-0">
                      <label htmlFor="custom-app-label" className="block text-[11px] text-slate-600 dark:text-slate-400 mb-0.5">
                        {tr("App Name")}
                      </label>
                      <input
                        id="custom-app-label"
                        type="text"
                        value={customAppLabel}
                        onChange={(e) => setCustomAppLabel(e.target.value)}
                        placeholder={tr("e.g., Kindle Reader")}
                        className="w-full h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs"
                      />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor="custom-app-pkg" className="block text-[11px] text-slate-600 dark:text-slate-400 mb-0.5">
                        {tr("Package ID")}
                      </label>
                      <input
                        id="custom-app-pkg"
                        type="text"
                        value={customAppPkg}
                        onChange={(e) => setCustomAppPkg(e.target.value)}
                        placeholder="com.amazon.kindle"
                        className="w-full h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono text-xs"
                      />
                    </div>
                  </div>
                  {customAppFeedback && (
                    <p
                      role="status"
                      className={`text-[11px] font-medium ${
                        customAppFeedback.type === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {customAppFeedback.text}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={!customAppLabel.trim() || !customAppPkg.trim()}
                    className="w-full min-h-[34px] rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-45 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{tr("Add App & Allow LockTask")}</span>
                  </button>
                </form>

                {/* AppBlock & Freedom: App Limits, Quiet Hours & Focus Lock */}
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{"\n                      "}{tr("App Limits, Downtime & Focus Lock")}{"\n                    "}</span>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">{"\n                      "}{tr("Blocked today:")}{" "}{state.blockedAttemptsToday ?? 0}
                    </span>
                  </div>

                  {/* Freedom One-Tap Focus Lock */}
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                        {focusBlockMinutes > 0
                          ? tr('Freedom Focus Lock active ({m}m left)', { m: focusBlockMinutes })
                          : tr("Freedom Focus Lock (Blocks non-Focus apps)")}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const res = onSetFocusBlockSession(25);
                          setLimitFeedback(
                            res.ok
                              ? { type: 'ok', text: tr('Started 25m Freedom Focus Lock.') }
                              : { type: 'error', text: res.error ?? tr("Blocked.") }
                          );
                        }}
                        className="py-1 px-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap"
                      >
                        {tr("Focus 25m")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const res = onSetFocusBlockSession(60);
                          setLimitFeedback(
                            res.ok
                              ? { type: 'ok', text: tr('Started 60m Freedom Focus Lock.') }
                              : { type: 'error', text: res.error ?? tr("Blocked.") }
                          );
                        }}
                        className="py-1 px-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap"
                      >
                        {tr("Focus 60m")}
                      </button>
                      <button
                        type="button"
                        disabled={focusBlockMinutes <= 0}
                        onClick={() => {
                          const res = onSetFocusBlockSession(0);
                          setLimitFeedback(
                            res.ok
                              ? { type: 'ok', text: tr('Ended Freedom Focus Lock.') }
                              : { type: 'error', text: res.error ?? tr("Blocked by Strict Lock.") }
                          );
                        }}
                        className="py-1 px-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap disabled:opacity-40"
                      >
                        {tr("End Block")}
                      </button>
                    </div>
                  </div>

                  {/* Scheduled Quiet Hours (Downtime) */}
                  <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                          {tr("Scheduled Quiet Hours (Downtime)")}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {tr("Blocks non-essential apps daily (")}<span dir="ltr">{String(downtime.startHour).padStart(2, '0')}:00–{String(downtime.endHour).padStart(2, '0')}:00</span>)
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={downtime.enabled}
                        aria-label={tr("Enable Scheduled Quiet Hours")}
                        onClick={() => {
                          const res = onUpdateDowntimeSchedule({ enabled: !downtime.enabled });
                          if (!res.ok && res.error) {
                            setLimitFeedback({ type: 'error', text: res.error });
                          } else {
                            setLimitFeedback(null);
                          }
                        }}
                        className={`min-w-[48px] px-2 py-1 rounded text-[11px] font-semibold border transition-colors shrink-0 ${
                          downtime.enabled
                            ? 'bg-slate-900 dark:bg-sky-600 border-slate-900 dark:border-sky-500 text-white'
                            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {downtime.enabled ? tr("On") : tr("Off")}
                      </button>
                    </div>

                    <div className="flex flex-wrap sm:flex-nowrap items-end gap-1.5">
                      <div className="flex-1 min-w-[90px]">
                        <label htmlFor="downtime-start-hour" className="block text-[10px] text-slate-600 dark:text-slate-400 mb-0.5">
                          {tr("Start Hour (0–23)")}
                        </label>
                        <input
                          id="downtime-start-hour"
                          type="number"
                          min={0}
                          max={23}
                          value={downtimeStartDraft}
                          onChange={(e) => setDowntimeStartDraft(e.target.value)}
                          className="w-full h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-mono text-xs"
                        />
                      </div>
                      <div className="flex-1 min-w-[90px]">
                        <label htmlFor="downtime-end-hour" className="block text-[10px] text-slate-600 dark:text-slate-400 mb-0.5">
                          {tr("End Hour (0–23)")}
                        </label>
                        <input
                          id="downtime-end-hour"
                          type="number"
                          min={0}
                          max={23}
                          value={downtimeEndDraft}
                          onChange={(e) => setDowntimeEndDraft(e.target.value)}
                          className="w-full h-8 px-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-mono text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!canRunSubmit('save_downtime')) return;
                          const parsed = downtimeHoursSchema.safeParse({
                            startHour: downtimeStartDraft,
                            endHour: downtimeEndDraft,
                          });
                          if (!parsed.success) {
                            setLimitFeedback({
                              type: 'error',
                              text: tr(parsed.error.issues[0]?.message ?? 'Enter valid hours (0–23).'),
                            });
                            return;
                          }
                          const res = onUpdateDowntimeSchedule({
                            startHour: parsed.data.startHour,
                            endHour: parsed.data.endHour,
                          });
                          setLimitFeedback(
                            res.ok
                              ? { type: 'ok', text: tr('Saved Quiet Hours window.') }
                              : { type: 'error', text: res.error ?? tr("Failed to save schedule.") }
                          );
                        }}
                        className="h-8 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap shrink-0"
                      >
                        {tr("Save")}
                      </button>
                    </div>

                    <label className="flex items-center justify-between gap-2 text-[11px] text-slate-700 dark:text-slate-300 pt-0.5 cursor-pointer">
                      <span>{tr("Simulate Quiet Hours active right now (test mode)")}</span>
                      <input
                        type="checkbox"
                        checked={downtime.simulateActiveNow}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const res = onUpdateDowntimeSchedule({
                            enabled: checked ? true : downtime.enabled,
                            simulateActiveNow: checked,
                          });
                          if (!res.ok && res.error) {
                            setLimitFeedback({ type: 'error', text: res.error });
                          }
                        }}
                        className="rounded border-slate-300 dark:border-slate-700 accent-sky-600"
                      />
                    </label>
                  </div>

                  {limitFeedback && (
                    <p
                      role="status"
                      className={`text-[11px] font-medium ${
                        limitFeedback.type === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {limitFeedback.text}
                    </p>
                  )}
                </div>

                {/* Allowed Kiosk Apps & Per-App Daily Time Limits Manager */}
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {tr("Allowed Kiosk Apps & Daily Time Limits")}
                  </div>
                  <input
                    type="search"
                    aria-label={tr("Filter installed apps")}
                    value={adminAppFilter}
                    onChange={(e) => {
                      setAdminAppFilter(e.target.value);
                      setAdminAppsPage(1);
                    }}
                    placeholder={tr("Search installed apps...")}
                    className="w-full h-8 px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-xs"
                  />
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {adminAppsPagination.totalItems === 0 ? (
                      <div className="py-5 text-center space-y-2">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {tr("No matching apps found.")}
                        </p>
                        {adminAppFilter.trim().length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setAdminAppFilter('');
                              setAdminAppsPage(1);
                            }}
                            className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200"
                          >
                            {tr("Clear filter")}
                          </button>
                        )}
                      </div>
                    ) : (
                    adminAppsPagination.items.map((app) => {
                      const allowed = state.allowedPackages.includes(app.packageName);
                      const passwordProtected = isAppPasswordProtected(state, app.packageName);
                      const limitMins = (state.appTimeLimits ?? {})[app.packageName] ?? 0;
                      const usedMins = Math.floor(
                        ((state.appUsageSeconds ?? {})[app.packageName] ?? 0) / 60
                      );
                      return (
                        <div
                          key={app.packageName}
                          className="py-2 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                                {app.label}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                                {app.packageName} ·{' '}
                                <span className={limitMins > 0 ? 'text-sky-700 dark:text-sky-400 font-semibold' : ''}>
                                  {limitMins > 0
                                    ? tr('{u}m / {l}m daily', { u: usedMins, l: limitMins })
                                    : tr("Unlimited")}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleAppLaunchRequest(app.packageName)}
                                disabled={!allowed}
                                aria-label={tr('Launch {label} in LockTask', { label: app.label })}
                                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/50 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                LockTask
                              </button>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={allowed}
                                aria-label={tr('Allow {label} on kiosk home', { label: app.label })}
                                onClick={() => onToggleAllowedApp(app.packageName)}
                                className={`min-w-[64px] px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
                                  allowed
                                    ? 'bg-sky-600 border-sky-600 text-white'
                                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                                }`}
                              >
                                {allowed ? tr("Allowed") : tr("Hidden")}
                              </button>
                            </div>
                          </div>

                          {/* Per-App Password Requirement Toggle */}
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 inline-flex items-center gap-1">
                              <Lock className="w-3 h-3 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                              <span>{tr("Require Password")}</span>
                            </span>
                            <button
                              type="button"
                              role="switch"
                              disabled={!allowed}
                              aria-checked={passwordProtected}
                              aria-label={tr('Require Password for {label}', { label: app.label })}
                              data-testid={`require-password-toggle-${app.packageName}`}
                              onClick={() => onToggleAppPasswordProtection(app.packageName)}
                              className={`min-w-[48px] px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                                passwordProtected
                                  ? 'bg-amber-600 border-amber-600 text-white'
                                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                              }`}
                            >
                              {passwordProtected ? tr("On") : tr("Off")}
                            </button>
                          </div>

                          {/* Per-App Daily Time Limit Controls */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <label
                                htmlFor={`limit-${app.packageName}`}
                                className="text-[10px] text-slate-600 dark:text-slate-400"
                              >
                                {tr("Daily Cap:")}
                              </label>
                              <select
                                id={`limit-${app.packageName}`}
                                aria-label={tr('Daily time limit for {label}', { label: app.label })}
                                value={limitMins}
                                onChange={(e) => {
                                  const nextLimit = Number.parseInt(e.target.value, 10);
                                  const res = onSetAppTimeLimit(app.packageName, nextLimit);
                                  if (!res.ok && res.error) {
                                    setLimitFeedback({ type: 'error', text: res.error });
                                  } else {
                                    setLimitFeedback({
                                      type: 'ok',
                                      text:
                                        nextLimit > 0
                                          ? tr('Set {label} daily cap to {m}m.', {
                                              label: app.label,
                                              m: nextLimit,
                                            })
                                          : tr('Removed daily limit for {label}.', { label: app.label }),
                                    });
                                  }
                                }}
                                className="h-7 px-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] font-mono text-slate-800 dark:text-slate-200"
                              >
                                <option value={0}>{tr("Unlimited")}</option>
                                <option value={5}>{tr('{m}m / day', { m: 5 })}</option>
                                <option value={15}>{tr('{m}m / day', { m: 15 })}</option>
                                <option value={30}>{tr('{m}m / day', { m: 30 })}</option>
                                <option value={60}>{tr('{m}m / day', { m: 60 })}</option>
                                <option value={120}>{tr('{m}m / day', { m: 120 })}</option>
                              </select>
                            </div>
                            {((state.appUsageSeconds ?? {})[app.packageName] ?? 0) > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const res = onResetAppUsage(app.packageName);
                                  setLimitFeedback(
                                    res.ok
                                      ? { type: 'ok', text: tr("Reset today's usage for {label}.", { label: app.label }) }
                                      : { type: 'error', text: res.error ?? tr("Blocked by Strict Lock.") }
                                  );
                                }}
                                className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[10px] font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap"
                              >
                                {tr("Reset Usage")}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                    )}
                  </div>
                  {adminAppsPagination.totalPages > 1 && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px]">
                      <button
                        type="button"
                        disabled={!adminAppsPagination.hasPrev}
                        onClick={() => setAdminAppsPage(adminAppsPagination.page - 1)}
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-40"
                      >
                        {tr("Previous")}
                      </button>
                      <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {tr('Page {p} of {total}', { p: adminAppsPagination.page, total: adminAppsPagination.totalPages })}
                      </span>
                      <button
                        type="button"
                        disabled={!adminAppsPagination.hasNext}
                        onClick={() => setAdminAppsPage(adminAppsPagination.page + 1)}
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-40"
                      >
                        {tr("Next")}
                      </button>
                    </div>
                  )}
                </div>

                {/* Change Admin Passcode (4–50 chars, letters/digits/symbols) */}
                <form
                  onSubmit={handleSavePin}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{"\n                      "}{tr("Change Admin Passcode (4–50 chars)")}{"\n                    "}</span>
                    <button
                      type="button"
                      onClick={() => setShowChangePinText((prev) => !prev)}
                      className="text-[11px] font-medium text-sky-700 dark:text-sky-400 hover:text-sky-900 dark:hover:text-sky-300 inline-flex items-center gap-1"
                    >
                      {showChangePinText ? (
                        <>
                          <EyeOff className="w-3 h-3" />
                          <span>{tr("Hide")}</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3" />
                          <span>{tr("Show")}</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label htmlFor="admin-current-pin" className="block text-[11px] text-slate-600 dark:text-slate-400 mb-0.5">{"\n                        "}{tr("Current Passcode")}{"\n                      "}</label>
                      <input
                        id="admin-current-pin"
                        type={showChangePinText ? 'text' : 'password'}
                        maxLength={MAX_ADMIN_PIN_LENGTH}
                        value={currentPinInput}
                        onChange={(e) => setCurrentPinInput(e.target.value)}
                        placeholder={tr("Default: 1234")}
                        className="w-full h-8 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label htmlFor="admin-new-pin" className="text-[11px] text-slate-600 dark:text-slate-400">{"\n                          "}{tr("New Passcode (letters, digits, symbols)")}{"\n                        "}</label>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                          {newPinInput.length}/{MAX_ADMIN_PIN_LENGTH}
                        </span>
                      </div>
                      <input
                        id="admin-new-pin"
                        type={showChangePinText ? 'text' : 'password'}
                        maxLength={MAX_ADMIN_PIN_LENGTH}
                        value={newPinInput}
                        onChange={(e) => setNewPinInput(e.target.value)}
                        placeholder={tr("4 to 50 characters...")}
                        className="w-full h-8 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label htmlFor="admin-confirm-pin" className="block text-[11px] text-slate-600 dark:text-slate-400 mb-0.5">{"\n                        "}{tr("Confirm New Passcode")}{"\n                      "}</label>
                      <input
                        id="admin-confirm-pin"
                        type={showChangePinText ? 'text' : 'password'}
                        maxLength={MAX_ADMIN_PIN_LENGTH}
                        value={confirmPinInput}
                        onChange={(e) => setConfirmPinInput(e.target.value)}
                        placeholder={tr("Re-enter passcode...")}
                        className="w-full h-8 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-mono text-xs"
                      />
                    </div>
                  </div>
                  {pinChangeFeedback && (
                    <p
                      role="status"
                      className={`text-xs font-medium ${
                        pinChangeFeedback.type === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {pinChangeFeedback.text}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="w-full min-h-[36px] rounded-lg bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 text-white text-xs font-semibold"
                  >{"\n                    "}{tr("Save Admin Passcode")}{"\n                  "}</button>
                </form>
              </div>
            )}

            {state.activeScreen === 'android_settings' && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{tr("Android System Settings")}</h3>
                    <p className="text-xs text-amber-800 dark:text-amber-300">{"\n                      "}{tr("Temporary Admin Unlock Active (re-locks on Home return)")}{"\n                    "}</p>
                  </div>
                  <button
                    type="button"
                    onClick={onReturnHome}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-sky-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-sky-500"
                  >{"\n                    "}{tr("Return to Kiosk")}{"\n                  "}</button>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{tr("Default Home App")}</span>
                    <span className="font-mono text-slate-600 dark:text-slate-400">com.kiosk.launcher</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{tr("Device Admin App")}</span>
                    <span className="font-mono text-slate-600 dark:text-slate-400">KioskDeviceAdminReceiver</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <label htmlFor="uninstall-pkg-select" className="block text-xs font-medium text-slate-700 dark:text-slate-300">{"\n                    "}{tr("Manage / Uninstall Package")}{"\n                  "}</label>
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                    <select
                      id="uninstall-pkg-select"
                      value={uninstallTarget}
                      onChange={(e) => setUninstallTarget(e.target.value)}
                      className="min-w-0 flex-1 h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    >
                      {allInstalledApps
                        .filter((a) => !a.isSystemRestricted)
                        .map((app) => (
                          <option key={app.packageName} value={app.packageName}>
                            {app.label} ({app.packageName})
                          </option>
                        ))}
                      <option value="com.kiosk.launcher">{tr("Ironclad OS Launcher (Device Owner)")}</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => onAttemptUninstall(uninstallTarget)}
                      className="h-9 px-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-300 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/60 whitespace-nowrap shrink-0"
                    >
                      {tr("Uninstall")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Android Navigation Bar */}
          <div className="bg-slate-900 text-slate-300 px-8 py-2.5 flex items-center justify-between shrink-0 border-t border-slate-800">
            <button
              type="button"
              aria-label={tr("Android Back button")}
              onClick={() => handleSystemNavButton('Back')}
              className="p-1.5 rounded hover:bg-slate-800 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
            </button>
            <button
              type="button"
              aria-label={tr("Android Home button")}
              onClick={() => handleSystemNavButton('Home')}
              className="p-1.5 rounded hover:bg-slate-800 hover:text-white transition-colors"
            >
              <Home className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label={tr("Android Recents button")}
              onClick={() => handleSystemNavButton('Recents')}
              className="p-1.5 rounded hover:bg-slate-800 hover:text-white transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Quick Simulation Context Footer */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-600 dark:text-slate-400 max-w-full px-2">
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <ShieldCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          <span>{tr("Default:")}{" "}<code className="font-mono font-semibold text-slate-900 dark:text-slate-100">1234</code></span>
        </span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1 min-w-0">
          <span>{tr("Active Passcode:")}</span>
          <code
            title={state.adminPin}
            className="font-mono font-semibold text-slate-900 dark:text-slate-100 max-w-[150px] truncate inline-block align-bottom"
          >
            {state.adminPin}
          </code>
          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
            ({state.adminPin.length}/50)
          </span>
        </span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums shrink-0">{tr("Reboots survived:")}{" "}{state.rebootCount}</span>
      </div>

      <AppAccessPinModal
        app={pendingProtectedApp}
        isOpen={pendingProtectedApp !== null}
        lockoutSeconds={lockoutRemaining}
        onVerifyPin={onVerifyAppAccessPin}
        onSuccess={(packageName) => {
          setPendingProtectedAppPkg(null);
          onLaunchApp(packageName);
        }}
        onClose={() => setPendingProtectedAppPkg(null)}
      />
    </div>
  );
};
