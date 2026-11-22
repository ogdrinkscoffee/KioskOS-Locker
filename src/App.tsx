/**
 * Copyright (c) 2026 [Your Name / Studio Name]. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, reverse-engineering,
 * modification, or redistribution of this file is strictly prohibited.
 */
import { LegalFooter } from './components/LegalFooter';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Cloud,
  Languages,
  MonitorSmartphone,
  Moon,
  ShieldCheck,
  Smartphone,
  Sun,
  Terminal,
  TrendingUp,
} from 'lucide-react';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { AndroidDeviceSimulator } from './components/AndroidDeviceSimulator';
import { PolicyInspectorPanel } from './components/PolicyInspectorPanel';
import { SelfImprovementWorkspace } from './components/SelfImprovementWorkspace';
import { AdbProvisioningView } from './components/AdbProvisioningView';
import { PolicySummary } from './components/PolicySummary';
import { PcRemoteWorkspace } from './components/PcRemoteWorkspace';
import { useI18n } from './i18n/LocaleProvider';
import {
  OperationType,
  User,
  auth,
  db,
  handleFirestoreError,
  onAuthStateChanged,
  signInWithGoogleAccount,
  signOutAccount,
  testConnection,
} from './firebase';
import {
  CloudDeviceSnapshot,
  CloudGrowthSnapshot,
  SyncSourceTag,
  applyRemoteDeviceToKioskState,
  applyRemoteGrowthToLocalState,
  buildDeviceSyncPayload,
  buildGrowthSyncPayload,
  generatePinSalt,
  hashPinWithSalt,
} from './utils/cloudSyncEngine';
import {
  BlockerShieldToggleKey,
  DEFAULT_ADMIN_RESTRICTIONS,
  DEFAULT_BLOCKER_SHIELDS,
  DEFAULT_DOWNTIME_SCHEDULE,
  DEFAULT_HARDWARE_LOCKS,
  DowntimeSchedule,
  FamilyDnsMode,
  HardwareLockPolicyKey,
  KIOSK_BROWSER_PACKAGE,
  KioskOperationMode,
  KioskState,
  PinGateTarget,
  RestrictionKey,
  SELF_IMPROVEMENT_PACKAGE,
  activateStrictShieldLock,
  addCustomApp,
  advanceAppUsage,
  attemptUninstallApp,
  clearPanicLockdown,
  createInitialKioskState,
  ensureUsageDateCurrent,
  getLocalDateIso,
  launchApp,
  navigateKioskBrowser,
  openPinGate,
  resetAppUsage,
  resetTamperDiagnostics,
  returnToKioskHome,
  setAdminSystemUnlock,
  setAppTimeLimit,
  setFamilyDnsMode,
  setFocusBlockSession,
  setKioskOperationMode,
  simulateDeviceReboot,
  submitPin,
  testInAppBrowserAccess,
  toggleAdminRestriction,
  toggleAllowedApp,
  toggleBlockerShield,
  toggleDeviceOwnerMode,
  toggleHardwarePolicy,
  triggerPanicLockdown,
  updateAdminPin,
  updateAllowedDomains,
  updateBlockedKeywords,
  updateDowntimeSchedule,
  updateInAppBrowserWhitelist,
  updateKioskTitle,
} from './utils/kioskEngine';
import {
  SelfImprovementState,
  addGoal,
  addGoalMilestone,
  addHabit,
  addTask,
  createInitialSelfImprovementState,
  createNote,
  deleteGoal,
  deleteHabit,
  deleteNote,
  deleteTask,
  formatIsoDate,
  logCleanDay,
  logUrgeVictory,
  recordFocusSession,
  resetCleanStreak,
  toggleGoalMilestone,
  toggleHabitDate,
  toggleTask,
  updateNote,
  updateWhyIStarted,
} from './utils/selfImprovementEngine';

type WorkspaceTab = 'simulator' | 'growth' | 'policy' | 'pc' | 'adb';
type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'kioskos_simulator_state_v1';
const SI_STORAGE_KEY = 'kioskos_self_improvement_v1';
const PIN_SALT_STORAGE_KEY = 'kioskos_pin_salt_v1';
const THEME_STORAGE_KEY = 'kioskos_theme_v1';
const DEFAULT_DEVICE_ID = 'primary-kiosk';
const DEFAULT_PROFILE_ID = 'main';

function loadInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // Ignore storage access issues
  }
  return 'light';
}

function getOrCreatePinSalt(): string {
  if (typeof window === 'undefined') return generatePinSalt();
  try {
    const existing = window.localStorage.getItem(PIN_SALT_STORAGE_KEY);
    if (existing && existing.length >= 16) return existing;
    const created = generatePinSalt();
    window.localStorage.setItem(PIN_SALT_STORAGE_KEY, created);
    return created;
  } catch {
    return generatePinSalt();
  }
}

function isNetworkUnavailableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes('unavailable') ||
    msg.includes('offline') ||
    msg.includes('failed to get document') ||
    msg.includes('network')
  );
}

function formatClockNow(): string {
  const now = new Date();
  return now.toTimeString().slice(0, 8);
}

function loadInitialState(): KioskState {
  if (typeof window === 'undefined') {
    return createInitialKioskState();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialKioskState();
    const parsed = JSON.parse(raw) as Partial<KioskState>;
    const base = createInitialKioskState();
    const migratedAllowed = Array.isArray(parsed.allowedPackages)
      ? parsed.allowedPackages
      : base.allowedPackages;
    const migratedState: KioskState = {
      ...base,
      ...parsed,
      adminRestrictions: {
        ...DEFAULT_ADMIN_RESTRICTIONS,
        ...(parsed.adminRestrictions ?? {}),
      },
      hardwareLocks: {
        ...DEFAULT_HARDWARE_LOCKS,
        ...(parsed.hardwareLocks ?? {}),
      },
      blockerShields: {
        ...DEFAULT_BLOCKER_SHIELDS,
        ...(parsed.blockerShields ?? {}),
        inAppBrowserWhitelist: Array.isArray(parsed.blockerShields?.inAppBrowserWhitelist)
          ? parsed.blockerShields.inAppBrowserWhitelist
          : DEFAULT_BLOCKER_SHIELDS.inAppBrowserWhitelist,
        blockedKeywords: Array.isArray(parsed.blockerShields?.blockedKeywords)
          ? parsed.blockerShields.blockedKeywords
          : DEFAULT_BLOCKER_SHIELDS.blockedKeywords,
      },
      appTimeLimits:
        parsed.appTimeLimits && typeof parsed.appTimeLimits === 'object'
          ? parsed.appTimeLimits
          : {},
      appUsageSeconds:
        parsed.appUsageSeconds && typeof parsed.appUsageSeconds === 'object'
          ? parsed.appUsageSeconds
          : {},
      usageDateIso:
        typeof parsed.usageDateIso === 'string' && parsed.usageDateIso.length === 10
          ? parsed.usageDateIso
          : base.usageDateIso,
      downtimeSchedule: {
        ...DEFAULT_DOWNTIME_SCHEDULE,
        ...(parsed.downtimeSchedule ?? {}),
      },
      focusBlockUntilMs:
        typeof parsed.focusBlockUntilMs === 'number' ? parsed.focusBlockUntilMs : 0,
      panicLockUntilMs:
        typeof parsed.panicLockUntilMs === 'number' ? parsed.panicLockUntilMs : 0,
      panicCount: typeof parsed.panicCount === 'number' ? parsed.panicCount : 0,
      lastClipboardWipedAt:
        typeof parsed.lastClipboardWipedAt === 'string' || parsed.lastClipboardWipedAt === null
          ? parsed.lastClipboardWipedAt
          : null,
      blockedAttemptsToday:
        typeof parsed.blockedAttemptsToday === 'number' ? parsed.blockedAttemptsToday : 0,
      allowedDomains:
        Array.isArray(parsed.allowedDomains) && parsed.allowedDomains.length > 0
          ? parsed.allowedDomains
          : base.allowedDomains,
      kioskMode: parsed.kioskMode ?? base.kioskMode,
      singleAppPackage:
        parsed.singleAppPackage !== undefined ? parsed.singleAppPackage : base.singleAppPackage,
      kioskTitle: parsed.kioskTitle ?? base.kioskTitle,
      failedPinAttempts: typeof parsed.failedPinAttempts === 'number' ? parsed.failedPinAttempts : 0,
      pinLockedUntilMs: typeof parsed.pinLockedUntilMs === 'number' ? parsed.pinLockedUntilMs : 0,
      distrustScore: typeof parsed.distrustScore === 'number' ? parsed.distrustScore : 0,
      tamperEscalationTier:
        parsed.tamperEscalationTier === 1 || parsed.tamperEscalationTier === 2
          ? parsed.tamperEscalationTier
          : 0,
      adminToggleTimestampsMs: Array.isArray(parsed.adminToggleTimestampsMs)
        ? parsed.adminToggleTimestampsMs
        : [],
      bypassAttemptTimestampsMs: Array.isArray(parsed.bypassAttemptTimestampsMs)
        ? parsed.bypassAttemptTimestampsMs
        : [],
      tamperWarningsCount:
        typeof parsed.tamperWarningsCount === 'number' ? parsed.tamperWarningsCount : 0,
      allowedPackages: migratedAllowed,
      customApps: Array.isArray(parsed.customApps) ? parsed.customApps : [],
      activeScreen: parsed.activeScreen === 'rebooting' ? 'home' : parsed.activeScreen ?? 'home',
      events: Array.isArray(parsed.events) && parsed.events.length > 0 ? parsed.events : base.events,
    };
    return ensureUsageDateCurrent(migratedState, getLocalDateIso());
  } catch {
    return createInitialKioskState();
  }
}

function loadInitialSelfImprovement(): SelfImprovementState {
  if (typeof window === 'undefined') {
    return createInitialSelfImprovementState();
  }
  try {
    const raw = window.localStorage.getItem(SI_STORAGE_KEY);
    if (!raw) return createInitialSelfImprovementState();
    const parsed = JSON.parse(raw) as Partial<SelfImprovementState> & Record<string, unknown>;
    const {
      affirmations: _a,
      activeAffirmationIndex: _ai,
      lastAffirmationCommittedDate: _ac,
      ...restParsed
    } = parsed;
    const base = createInitialSelfImprovementState();
    return {
      ...base,
      ...(restParsed as Partial<SelfImprovementState>),
      cleanCheckInDates:
        Array.isArray(parsed.cleanCheckInDates) && parsed.cleanCheckInDates.length > 0
          ? parsed.cleanCheckInDates
          : base.cleanCheckInDates,
      focusSessions: Array.isArray(parsed.focusSessions) ? parsed.focusSessions : base.focusSessions,
      habits: Array.isArray(parsed.habits) ? parsed.habits : base.habits,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : base.tasks,
      goals: Array.isArray(parsed.goals) ? parsed.goals : base.goals,
      notes: Array.isArray(parsed.notes) ? parsed.notes : base.notes,
    };
  } catch {
    return createInitialSelfImprovementState();
  }
}

export default function App() {
  const { t, locale, setLocale, tr } = useI18n();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('simulator');
  const [themeMode, setThemeMode] = useState<ThemeMode>(loadInitialTheme);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement | null>(null);
  const isDark = themeMode === 'dark';
  const [state, setState] = useState<KioskState>(loadInitialState);
  const [selfImprovement, setSelfImprovement] = useState<SelfImprovementState>(
    loadInitialSelfImprovement
  );

  // Optional Cross-Device Firebase Auth & Cloud Sync State
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [cloudConnected, setCloudConnected] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [pendingOfflineSync, setPendingOfflineSync] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncedDevices, setSyncedDevices] = useState<CloudDeviceSnapshot[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(DEFAULT_DEVICE_ID);
  const [pinSalt, setPinSalt] = useState<string>(getOrCreatePinSalt);

  const applyingRemoteDeviceRef = useRef(false);
  const applyingRemoteGrowthRef = useRef(false);
  const hasEnsuredCloudProfileRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  const selfImprovementRef = useRef(selfImprovement);
  const syncedDevicesRef = useRef(syncedDevices);
  stateRef.current = state;
  selfImprovementRef.current = selfImprovement;
  syncedDevicesRef.current = syncedDevices;

  const lastDeviceDigestRef = useRef<string | null>(null);
  const lastGrowthDigestRef = useRef<string | null>(null);

  const computeDeviceDigest = useCallback((payload: Omit<CloudDeviceSnapshot, 'createdAt' | 'updatedAt'>) => {
    const { lastModifiedBy: _lmb, ...rest } = payload;
    return JSON.stringify(rest);
  }, []);

  const computeGrowthDigest = useCallback((payload: Omit<CloudGrowthSnapshot, 'createdAt' | 'updatedAt'>) => {
    const { lastUpdatedSource: _lus, ...rest } = payload;
    return JSON.stringify(rest);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch {
      // Ignore storage quota errors
    }
  }, [isDark, themeMode]);

  useEffect(() => {
    if (!langMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!langMenuRef.current?.contains(event.target as Node)) setLangMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLangMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [langMenuOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }, [state]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SI_STORAGE_KEY, JSON.stringify(selfImprovement));
    } catch {
      // Ignore storage quota errors
    }
  }, [selfImprovement]);

  // Network listeners + startup Firestore check (non-blocking for offline mode)
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    void testConnection().then((ok) => setCloudConnected(ok));
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auth listener (optional account; mobile works 100% signed out)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      if (!nextUser) {
        setSyncedDevices([]);
        hasEnsuredCloudProfileRef.current = null;
        lastDeviceDigestRef.current = null;
        lastGrowthDigestRef.current = null;
      }
    });
    return () => unsub();
  }, []);

  const pushLocalToCloud = useCallback(
    async (
      targetUser: User,
      kioskSnapshot: KioskState,
      growthSnapshot: SelfImprovementState,
      source: SyncSourceTag,
      overrideSalt?: string,
      forcePush = false
    ) => {
      if (!navigator.onLine) {
        setPendingOfflineSync(true);
        return;
      }

      const activeSalt = overrideSalt ?? pinSalt;
      const pinHash = await hashPinWithSalt(kioskSnapshot.adminPin, activeSalt);
      const userPath = `users/${targetUser.uid}`;
      const devicePath = `users/${targetUser.uid}/devices/${selectedDeviceId}`;
      const growthPath = `users/${targetUser.uid}/growth/${DEFAULT_PROFILE_ID}`;

      const knownDevice = syncedDevicesRef.current.find((d) => d.deviceId === selectedDeviceId);
      const devicePayload = buildDeviceSyncPayload({
        state: kioskSnapshot,
        ownerId: targetUser.uid,
        deviceId: selectedDeviceId,
        deviceLabel: knownDevice?.deviceLabel ?? 'Pixel Kiosk Mobile',
        platform: knownDevice?.platform ?? 'web_simulator',
        isOnline: navigator.onLine,
        adminPinSalt: activeSalt,
        adminPinHash: pinHash,
        source,
      });

      const growthPayload = buildGrowthSyncPayload({
        growth: growthSnapshot,
        ownerId: targetUser.uid,
        profileId: DEFAULT_PROFILE_ID,
        source,
      });

      const nextDeviceDigest = computeDeviceDigest(devicePayload);
      const nextGrowthDigest = computeGrowthDigest(growthPayload);
      const deviceChanged = forcePush || nextDeviceDigest !== lastDeviceDigestRef.current;
      const growthChanged = forcePush || nextGrowthDigest !== lastGrowthDigestRef.current;

      if (!deviceChanged && !growthChanged && hasEnsuredCloudProfileRef.current === targetUser.uid) {
        setPendingOfflineSync(false);
        return;
      }

      setSyncBusy(true);
      setSyncError(null);
      try {
        const userRef = doc(db, 'users', targetUser.uid);
        if (hasEnsuredCloudProfileRef.current !== targetUser.uid) {
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              uid: targetUser.uid,
              email: (targetUser.email ?? '').slice(0, 254),
              displayName: (targetUser.displayName ?? 'Kiosk Owner').slice(0, 100),
              lastActiveDeviceId: selectedDeviceId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            await updateDoc(userRef, {
              email: (targetUser.email ?? '').slice(0, 254),
              displayName: (targetUser.displayName ?? 'Kiosk Owner').slice(0, 100),
              lastActiveDeviceId: selectedDeviceId,
              updatedAt: serverTimestamp(),
            });
          }
          hasEnsuredCloudProfileRef.current = targetUser.uid;
        }

        if (deviceChanged) {
          const deviceRef = doc(db, 'users', targetUser.uid, 'devices', selectedDeviceId);
          const devSnap = await getDoc(deviceRef);
          if (!devSnap.exists()) {
            await setDoc(deviceRef, {
              ...devicePayload,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            const { ownerId: _o, deviceId: _d, ...updatable } = devicePayload;
            await updateDoc(deviceRef, {
              ...updatable,
              updatedAt: serverTimestamp(),
            });
          }
          lastDeviceDigestRef.current = nextDeviceDigest;
        }

        if (growthChanged) {
          const growthRef = doc(db, 'users', targetUser.uid, 'growth', DEFAULT_PROFILE_ID);
          const growthSnap = await getDoc(growthRef);
          if (!growthSnap.exists()) {
            await setDoc(growthRef, {
              ...growthPayload,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            const { ownerId: _go, profileId: _gp, ...updatableGrowth } = growthPayload;
            await updateDoc(growthRef, {
              ...updatableGrowth,
              updatedAt: serverTimestamp(),
            });
          }
          lastGrowthDigestRef.current = nextGrowthDigest;
        }

        setPendingOfflineSync(false);
        setCloudConnected(true);
        setLastSyncedAt(formatClockNow());
      } catch (err) {
        if (isNetworkUnavailableError(err)) {
          setPendingOfflineSync(true);
          setSyncError(tr('Offline or Firestore unreachable — changes remain saved locally and will sync later.'));
        } else {
          setSyncError(err instanceof Error ? err.message : tr('Sync failed.'));
          handleFirestoreError(err, OperationType.WRITE, `${userPath} / ${devicePath} / ${growthPath}`);
        }
      } finally {
        setSyncBusy(false);
      }
    },
    [pinSalt, selectedDeviceId, computeDeviceDigest, computeGrowthDigest, tr]
  );

  // Attach real-time Firestore listeners ONLY when authenticated
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    lastDeviceDigestRef.current = null;
    lastGrowthDigestRef.current = null;

    const initAndSubscribe = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: user.uid,
            email: (user.email ?? '').slice(0, 254),
            displayName: (user.displayName ?? 'Kiosk Owner').slice(0, 100),
            lastActiveDeviceId: selectedDeviceId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        hasEnsuredCloudProfileRef.current = user.uid;

        const devRef = doc(db, 'users', user.uid, 'devices', selectedDeviceId);
        const devSnap = await getDoc(devRef);
        if (!devSnap.exists()) {
          const currentState = stateRef.current;
          const pinHash = await hashPinWithSalt(currentState.adminPin, pinSalt);
          const payload = buildDeviceSyncPayload({
            state: currentState,
            ownerId: user.uid,
            deviceId: selectedDeviceId,
            adminPinSalt: pinSalt,
            adminPinHash: pinHash,
            source: 'web_simulator',
          });
          await setDoc(devRef, {
            ...payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          lastDeviceDigestRef.current = computeDeviceDigest(payload);
        }

        const growthRef = doc(db, 'users', user.uid, 'growth', DEFAULT_PROFILE_ID);
        const gSnap = await getDoc(growthRef);
        if (!gSnap.exists()) {
          const payload = buildGrowthSyncPayload({
            growth: selfImprovementRef.current,
            ownerId: user.uid,
            profileId: DEFAULT_PROFILE_ID,
            source: 'web_simulator',
          });
          await setDoc(growthRef, {
            ...payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          lastGrowthDigestRef.current = computeGrowthDigest(payload);
        }
        if (!cancelled) {
          setCloudConnected(true);
          setLastSyncedAt(formatClockNow());
        }
      } catch (err) {
        if (isNetworkUnavailableError(err)) {
          setPendingOfflineSync(true);
        } else {
          handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        }
      }
    };

    void initAndSubscribe();

    const devicesQuery = query(
      collection(db, 'users', user.uid, 'devices'),
      where('ownerId', '==', user.uid)
    );

    const unsubDevices = onSnapshot(
      devicesQuery,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => {
          const raw = d.data() as CloudDeviceSnapshot;
          return {
            ...raw,
            createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt.toMillis() : raw.createdAt,
            updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt.toMillis() : raw.updatedAt,
          };
        });
        setSyncedDevices(docs);

        const matched = docs.find((d) => d.deviceId === selectedDeviceId) ?? docs[0];
        if (matched && matched.lastModifiedBy === 'pc_web') {
          applyingRemoteDeviceRef.current = true;
          const nextState = applyRemoteDeviceToKioskState(stateRef.current, matched);
          const expectedPayload = buildDeviceSyncPayload({
            state: nextState,
            ownerId: user.uid,
            deviceId: selectedDeviceId,
            deviceLabel: matched.deviceLabel ?? 'Pixel Kiosk Mobile',
            platform: matched.platform ?? 'web_simulator',
            isOnline: navigator.onLine,
            adminPinSalt: matched.adminPinSalt ?? pinSalt,
            adminPinHash: matched.adminPinHash ?? '',
            source: 'web_simulator',
          });
          lastDeviceDigestRef.current = computeDeviceDigest(expectedPayload);
          setState(nextState);
          queueMicrotask(() => {
            applyingRemoteDeviceRef.current = false;
          });
        }
        setLastSyncedAt(formatClockNow());
      },
      (error) => {
        if (!isNetworkUnavailableError(error)) {
          handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/devices`);
        }
      }
    );

    const unsubGrowth = onSnapshot(
      doc(db, 'users', user.uid, 'growth', DEFAULT_PROFILE_ID),
      (snapshot) => {
        if (!snapshot.exists()) return;
        const remote = snapshot.data() as CloudGrowthSnapshot;
        if (remote.lastUpdatedSource && remote.lastUpdatedSource !== 'web_simulator') {
          applyingRemoteGrowthRef.current = true;
          const nextGrowth = applyRemoteGrowthToLocalState(selfImprovementRef.current, remote);
          const expectedGrowthPayload = buildGrowthSyncPayload({
            growth: nextGrowth,
            ownerId: user.uid,
            profileId: DEFAULT_PROFILE_ID,
            source: 'web_simulator',
          });
          lastGrowthDigestRef.current = computeGrowthDigest(expectedGrowthPayload);
          setSelfImprovement(nextGrowth);
          queueMicrotask(() => {
            applyingRemoteGrowthRef.current = false;
          });
        }
      },
      (error) => {
        if (!isNetworkUnavailableError(error)) {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}/growth/${DEFAULT_PROFILE_ID}`);
        }
      }
    );

    return () => {
      cancelled = true;
      unsubDevices();
      unsubGrowth();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedDeviceId]);

  // Debounced auto-sync when local Kiosk or Growth state changes while signed in
  useEffect(() => {
    if (!user || applyingRemoteDeviceRef.current || applyingRemoteGrowthRef.current) return;
    if (!isOnline) {
      setPendingOfflineSync(true);
      return;
    }
    const timer = window.setTimeout(() => {
      void pushLocalToCloud(user, stateRef.current, selfImprovementRef.current, 'web_simulator');
    }, 650);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, selfImprovement, user, isOnline]);

  // Auto-flush queued offline changes when coming back online
  useEffect(() => {
    if (user && isOnline && pendingOfflineSync) {
      void pushLocalToCloud(user, stateRef.current, selfImprovementRef.current, 'web_simulator');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, user, pendingOfflineSync]);

  const handleSignInGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithGoogleAccount();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : tr("Google Sign-In cancelled or blocked."));
    }
  };

  const handleSignOutGoogle = async () => {
    setAuthError(null);
    await signOutAccount();
  };

  const handleRemoteUpdateSettings = async (
    updater: (current: KioskState) => KioskState,
    options?: { clearPinLockout?: boolean; newPlainPin?: string }
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!user) return { ok: false, error: tr('Sign in first.') };
    if (!isOnline) {
      return { ok: false, error: tr('PC is offline — connect to push remote updates to your phone.') };
    }

    const remoteSnap = syncedDevicesRef.current.find((d) => d.deviceId === selectedDeviceId);
    const baseState: KioskState = remoteSnap
      ? applyRemoteDeviceToKioskState(stateRef.current, remoteSnap)
      : stateRef.current;
    const updatedState = updater(baseState);

    let nextSalt = pinSalt;
    let nextHash = remoteSnap?.adminPinHash ?? (await hashPinWithSalt(updatedState.adminPin, pinSalt));
    if (options?.newPlainPin) {
      nextSalt = generatePinSalt();
      setPinSalt(nextSalt);
      try {
        window.localStorage.setItem(PIN_SALT_STORAGE_KEY, nextSalt);
      } catch {
        // Ignore storage error
      }
      nextHash = await hashPinWithSalt(options.newPlainPin, nextSalt);
    }

    const payload = buildDeviceSyncPayload({
      state: updatedState,
      ownerId: user.uid,
      deviceId: selectedDeviceId,
      deviceLabel: remoteSnap?.deviceLabel ?? 'Pixel Kiosk Mobile',
      platform: remoteSnap?.platform ?? 'web_simulator',
      isOnline: remoteSnap?.isOnline ?? true,
      adminPinSalt: nextSalt,
      adminPinHash: nextHash,
      source: 'pc_web',
    });

    const {
      ownerId: _o,
      deviceId: _d,
      deviceLabel: _dl,
      platform: _pl,
      isOnline: _io,
      isDeviceOwner: _ido,
      activeScreen: _as,
      lockTaskActive: _lt,
      panicCount: _pc,
      ...pcAllowedFields
    } = payload;

    try {
      applyingRemoteDeviceRef.current = true;
      lastDeviceDigestRef.current = computeDeviceDigest(payload);
      setState(updatedState);
      await updateDoc(doc(db, 'users', user.uid, 'devices', selectedDeviceId), {
        ...pcAllowedFields,
        updatedAt: serverTimestamp(),
      });
      setLastSyncedAt(formatClockNow());
      queueMicrotask(() => {
        applyingRemoteDeviceRef.current = false;
      });
      return { ok: true };
    } catch (err) {
      applyingRemoteDeviceRef.current = false;
      const msg = err instanceof Error ? err.message : tr('Failed to push remote update.');
      if (!isNetworkUnavailableError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/devices/${selectedDeviceId}`);
      }
      return { ok: false, error: msg };
    }
  };

  const handleLaunchApp = useCallback((packageName: string) => {
    setState((prev) => launchApp(prev, packageName, formatClockNow()));
  }, []);

  const handleAttemptUninstall = useCallback((packageName: string) => {
    setState((prev) => attemptUninstallApp(prev, packageName, formatClockNow()));
  }, []);

  const handleOpenPinGate = useCallback((target: PinGateTarget) => {
    setState((prev) => openPinGate(prev, target));
  }, []);

  const handleSubmitPin = useCallback((pin: string): { verified: boolean; lockedOutSeconds?: number } => {
    const { nextState, verified, lockedOutSeconds } = submitPin(
      stateRef.current,
      pin,
      formatClockNow(),
      Date.now()
    );
    setState(nextState);
    return { verified, lockedOutSeconds };
  }, []);

  const handleCancelPinGate = useCallback(() => {
    setState((prev) => ({
      ...prev,
      activeScreen:
        prev.pinGateTarget === 'exit_lock_task'
          ? prev.activeAppPackage === SELF_IMPROVEMENT_PACKAGE
            ? 'self_improvement'
            : prev.activeAppPackage === KIOSK_BROWSER_PACKAGE
            ? 'kiosk_browser'
            : 'app_lock_task'
          : 'home',
      pinGateTarget: null,
    }));
  }, []);

  const handleToggleAllowedApp = useCallback((packageName: string) => {
    setState((prev) => toggleAllowedApp(prev, packageName, formatClockNow()));
  }, []);

  const handleAddCustomApp = useCallback(
    (label: string, packageName: string): { ok: boolean; error?: string } => {
      const res = addCustomApp(stateRef.current, label, packageName, formatClockNow());
      if (res.ok) {
        setState(res.nextState);
      }
      return { ok: res.ok, error: res.error };
    },
    []
  );

  const handleUpdatePin = useCallback(
    (currentPin: string, newPin: string, confirmPin: string): { ok: boolean; error?: string } => {
      const res = updateAdminPin(stateRef.current, currentPin, newPin, confirmPin, formatClockNow());
      if (res.ok) {
        setState(res.nextState);
      }
      return { ok: res.ok, error: res.error };
    },
    []
  );

  const handleSetAdminUnlock = useCallback((unlocked: boolean) => {
    setState((prev) => setAdminSystemUnlock(prev, unlocked, formatClockNow()));
  }, []);

  const handleSetKioskMode = useCallback((mode: KioskOperationMode, singleAppPackage?: string | null) => {
    setState((prev) => setKioskOperationMode(prev, mode, singleAppPackage, formatClockNow()));
  }, []);

  const handleUpdateKioskTitle = useCallback((title: string) => {
    setState((prev) => updateKioskTitle(prev, title, formatClockNow()));
  }, []);

  const handleToggleAdminRestriction = useCallback((key: RestrictionKey) => {
    setState((prev) => toggleAdminRestriction(prev, key, undefined, formatClockNow()));
  }, []);

  const handleToggleHardwarePolicy = useCallback((key: HardwareLockPolicyKey) => {
    setState((prev) => toggleHardwarePolicy(prev, key, undefined, formatClockNow()));
  }, []);

  const handleToggleBlockerShield = useCallback(
    (key: BlockerShieldToggleKey): { ok: boolean; error?: string } => {
      const res = toggleBlockerShield(stateRef.current, key, undefined, formatClockNow(), Date.now());
      setState(res.nextState);
      return { ok: res.ok, error: res.error };
    },
    []
  );

  const handleSetFamilyDnsMode = useCallback((mode: FamilyDnsMode): { ok: boolean; error?: string } => {
    const res = setFamilyDnsMode(stateRef.current, mode, formatClockNow(), Date.now());
    setState(res.nextState);
    return { ok: res.ok, error: res.error };
  }, []);

  const handleUpdateInAppWhitelist = useCallback((packages: string[]) => {
    setState((prev) => updateInAppBrowserWhitelist(prev, packages, formatClockNow()));
  }, []);

  const handleUpdateBlockedKeywords = useCallback((keywords: string[]) => {
    setState((prev) => updateBlockedKeywords(prev, keywords, formatClockNow()));
  }, []);

  const handleActivateStrictLock = useCallback((minutes: number) => {
    setState((prev) => activateStrictShieldLock(prev, minutes, formatClockNow(), Date.now()));
  }, []);

  const handleTestInAppBrowser = useCallback((packageName: string): { allowed: boolean; reason: string } => {
    const res = testInAppBrowserAccess(stateRef.current, packageName, formatClockNow());
    setState(res.nextState);
    return { allowed: res.allowed, reason: res.reason };
  }, []);

  const handleUpdateAllowedDomains = useCallback((domains: string[]) => {
    setState((prev) => updateAllowedDomains(prev, domains, formatClockNow()));
  }, []);

  const handleNavigateBrowser = useCallback((url: string): { ok: boolean; reason?: string } => {
    const res = navigateKioskBrowser(stateRef.current, url, formatClockNow());
    setState(res.nextState);
    return { ok: res.ok, reason: res.reason };
  }, []);

  const handleSetAppTimeLimit = useCallback(
    (packageName: string, minutes: number): { ok: boolean; error?: string } => {
      const res = setAppTimeLimit(stateRef.current, packageName, minutes, formatClockNow(), Date.now());
      setState(res.nextState);
      return { ok: res.ok, error: res.error };
    },
    []
  );

  const handleResetAppUsage = useCallback((packageName: string): { ok: boolean; error?: string } => {
    const res = resetAppUsage(stateRef.current, packageName, formatClockNow(), Date.now());
    setState(res.nextState);
    return { ok: res.ok, error: res.error };
  }, []);

  const handleUpdateDowntimeSchedule = useCallback(
    (patch: Partial<DowntimeSchedule>): { ok: boolean; error?: string } => {
      const res = updateDowntimeSchedule(stateRef.current, patch, formatClockNow(), Date.now());
      setState(res.nextState);
      return { ok: res.ok, error: res.error };
    },
    []
  );

  const handleSetFocusBlockSession = useCallback((minutes: number): { ok: boolean; error?: string } => {
    const res = setFocusBlockSession(stateRef.current, minutes, formatClockNow(), Date.now());
    setState(res.nextState);
    return { ok: res.ok, error: res.error };
  }, []);

  const handleAdvanceAppUsage = useCallback((packageName: string, deltaSeconds: number) => {
    setState((prev) =>
      advanceAppUsage(prev, packageName, deltaSeconds, formatClockNow(), Date.now())
    );
  }, []);

  const handleTriggerPanic = useCallback(() => {
    setState((prev) => triggerPanicLockdown(prev, undefined, formatClockNow(), Date.now()));
  }, []);

  const handleClearPanicLockdown = useCallback(() => {
    setState((prev) => clearPanicLockdown(prev, formatClockNow()));
  }, []);

  const handleResetTamperDiagnostics = useCallback(() => {
    setState((prev) => resetTamperDiagnostics(prev, formatClockNow()));
  }, []);

  const handleSimulateRapidAdminToggles = useCallback(() => {
    const ts = formatClockNow();
    const baseMs = Date.now();
    setState((prev) => {
      let next = prev;
      for (let i = 0; i < 4; i += 1) {
        next = toggleHardwarePolicy(next, 'statusBarDisabled', undefined, ts, baseMs + i * 250);
      }
      return next;
    });
  }, []);

  const handleReturnHome = useCallback(() => {
    setState((prev) => returnToKioskHome(prev, formatClockNow()));
  }, []);

  const handleToggleDeviceOwner = useCallback(() => {
    setState((prev) => toggleDeviceOwnerMode(prev, !prev.isDeviceOwner, formatClockNow()));
  }, []);

  const handleSimulateReboot = useCallback(() => {
    setState((prev) => ({ ...prev, activeScreen: 'rebooting', blockedNotice: null }));
    window.setTimeout(() => {
      setState((prev) => simulateDeviceReboot(prev, formatClockNow()));
    }, 450);
  }, []);

  const handleToggleOrientation = useCallback(() => {
    setState((prev) => ({
      ...prev,
      orientation: prev.orientation === 'portrait' ? 'landscape' : 'portrait',
    }));
  }, []);

  const handleToggleFontScale = useCallback(() => {
    setState((prev) => ({
      ...prev,
      fontScale: prev.fontScale === '1.0x' ? '1.15x' : '1.0x',
    }));
  }, []);

  const handleResetAll = useCallback(() => {
    setState(createInitialKioskState());
  }, []);

  const handleRecordFocusSession = useCallback((minutes: number, label: string) => {
    setSelfImprovement((prev) => recordFocusSession(prev, minutes, label));
  }, []);

  const handleCreateNote = useCallback(
    (notebook: Parameters<typeof createNote>[1], title?: string, htmlContent?: string): string => {
      const { nextState, createdNoteId } = createNote(
        selfImprovementRef.current,
        notebook,
        title,
        htmlContent
      );
      setSelfImprovement(nextState);
      return createdNoteId;
    },
    []
  );

  return (
    <div className="flex min-h-screen flex-col text-slate-900 antialiased dark:text-slate-100">
      {/* 3-Zone Single-Line Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-white/10 dark:bg-[#070b11]/85">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:h-16 sm:flex-nowrap sm:px-6 sm:py-0">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('simulator');
            }}
            className="inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap text-base font-semibold tracking-tight text-slate-900 dark:text-white"
          >
            <img
              src="/app-icon.svg"
              alt=""
              width={28}
              height={28}
              className="w-7 h-7 rounded-lg shrink-0"
            />
            <span>KioskOS</span>
          </a>

          <nav
            aria-label={t('nav.sectionsLabel')}
            className="order-last -mx-1 w-full overflow-x-auto px-1 sm:order-none sm:mx-0 sm:ms-auto sm:w-auto sm:px-0"
          >
            <div className="flex w-max items-center gap-0.5 rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 dark:border-white/10 dark:bg-white/[0.04]">
              {(
                [
                  { id: 'simulator', label: t('nav.simulator'), shortLabel: t('nav.simulatorShort'), Icon: Smartphone },
                  { id: 'growth', label: t('nav.growth'), shortLabel: t('nav.growthShort'), Icon: TrendingUp },
                  { id: 'policy', label: t('nav.policy'), shortLabel: t('nav.policyShort'), Icon: ShieldCheck },
                  { id: 'pc', label: t('nav.pc'), shortLabel: t('nav.pcShort'), Icon: MonitorSmartphone },
                  { id: 'adb', label: t('nav.adb'), shortLabel: t('nav.adbShort'), Icon: Terminal },
                ] as const
              ).map((tab) => {
                const active = activeTab === tab.id;
                const Icon = tab.Icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                      active
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="ms-auto flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('pc')}
              className={`hidden min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors sm:inline-flex ${
                user
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]'
              }`}
            >
              <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{user ? t('sync.synced') : t('sync.action')}</span>
            </button>
            <div className="relative" ref={langMenuRef}>
              <button
                type="button"
                data-testid="locale-toggle-button"
                aria-label={t('lang.label')}
                aria-haspopup="menu"
                aria-expanded={langMenuOpen}
                title={t('lang.label')}
                onClick={() => setLangMenuOpen((open) => !open)}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                  langMenuOpen
                    ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]'
                }`}
              >
                <Languages className="h-4 w-4" aria-hidden="true" />
              </button>
              {langMenuOpen && (
                <div
                  role="menu"
                  aria-label={t('lang.label')}
                  data-testid="locale-menu"
                  className="absolute end-0 top-full z-40 mt-1.5 min-w-36 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-[#0d131b]"
                >
                  {(
                    [
                      { code: 'en', label: t('lang.toEnglish') },
                      { code: 'ar', label: t('lang.toArabic') },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.code}
                      type="button"
                      role="menuitemradio"
                      aria-checked={locale === option.code}
                      lang={option.code}
                      onClick={() => {
                        setLocale(option.code);
                        setLangMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-start text-[13px] font-medium transition-colors ${
                        locale === option.code
                          ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                          : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      <span>{option.label}</span>
                      {locale === option.code && (
                        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              data-testid="theme-toggle-button"
              aria-pressed={isDark}
              aria-label={isDark ? t('theme.toLight') : t('theme.toDark')}
              title={isDark ? t('theme.lightMode') : t('theme.darkMode')}
              onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]"
            >
              {isDark ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <a
              href="/downloads/KioskOS.apk"
              download="KioskOS.apk"
              aria-label={t('download.apkAria')}
              title={t('download.apkTitle')}
              className="btn-primary whitespace-nowrap"
            >
              <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{t('download.apk')}</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="top" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-7 max-w-2xl">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-400">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden="true" />
            {t('hero.eyebrow')}
          </div>
          <h1 className="mt-2.5 text-[27px] font-semibold leading-[1.15] tracking-tight text-slate-900 dark:text-white sm:text-[33px]">
            {t('hero.title')}
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {t('hero.lead')}
          </p>
          <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
            <li>{t('hero.bullet.allowlist')}</li>
            <li>{t('hero.bullet.locktask')}</li>
            <li>{t('hero.bullet.blockers')}</li>
            <li>{t('hero.bullet.sync')}</li>
          </ul>
        </div>

        {activeTab === 'simulator' && (
          <div
            className={`grid grid-cols-1 gap-6 items-start ${
              state.orientation === 'landscape'
                ? 'xl:grid-cols-[640px_minmax(0,1fr)]'
                : 'lg:grid-cols-[400px_minmax(0,1fr)]'
            }`}
          >
            <AndroidDeviceSimulator
              state={state}
              selfImprovement={selfImprovement}
              onLaunchApp={handleLaunchApp}
              onAttemptUninstall={handleAttemptUninstall}
              onOpenPinGate={handleOpenPinGate}
              onSubmitPin={handleSubmitPin}
              onCancelPinGate={handleCancelPinGate}
              onToggleAllowedApp={handleToggleAllowedApp}
              onAddCustomApp={handleAddCustomApp}
              onUpdatePin={handleUpdatePin}
              onSetAdminUnlock={handleSetAdminUnlock}
              onSetKioskMode={handleSetKioskMode}
              onUpdateKioskTitle={handleUpdateKioskTitle}
              onToggleAdminRestriction={handleToggleAdminRestriction}
              onToggleHardwarePolicy={handleToggleHardwarePolicy}
              onToggleBlockerShield={handleToggleBlockerShield}
              onSetFamilyDnsMode={handleSetFamilyDnsMode}
              onUpdateAllowedDomains={handleUpdateAllowedDomains}
              onUpdateInAppWhitelist={handleUpdateInAppWhitelist}
              onUpdateBlockedKeywords={handleUpdateBlockedKeywords}
              onActivateStrictLock={handleActivateStrictLock}
              onTestInAppBrowser={handleTestInAppBrowser}
              onNavigateBrowser={handleNavigateBrowser}
              onSetAppTimeLimit={handleSetAppTimeLimit}
              onResetAppUsage={handleResetAppUsage}
              onUpdateDowntimeSchedule={handleUpdateDowntimeSchedule}
              onSetFocusBlockSession={handleSetFocusBlockSession}
              onAdvanceAppUsage={handleAdvanceAppUsage}
              onTriggerPanic={handleTriggerPanic}
              onReturnHome={handleReturnHome}
              onDismissNotice={() => setState((prev) => ({ ...prev, blockedNotice: null }))}
              onToggleHabitToday={(habitId) =>
                setSelfImprovement((prev) => toggleHabitDate(prev, habitId, formatIsoDate()))
              }
              onToggleTask={(taskId) => setSelfImprovement((prev) => toggleTask(prev, taskId))}
              onLogCleanDay={() => setSelfImprovement((prev) => logCleanDay(prev))}
              onRecordFocusSession={handleRecordFocusSession}
              onQuickSaveDiaryNote={(title, body) => {
                handleCreateNote('Diary', title, body);
              }}
              onOpenFullSelfImprovement={() => setActiveTab('growth')}
            />
            <PolicySummary state={state} onOpenPolicyInspector={() => setActiveTab('policy')} />
          </div>
        )}

        {activeTab === 'growth' && (
          <SelfImprovementWorkspace
            state={selfImprovement}
            isDark={isDark}
            onLogCleanDay={() => setSelfImprovement((prev) => logCleanDay(prev))}
            onResetCleanStreak={() => setSelfImprovement((prev) => resetCleanStreak(prev))}
            onLogUrgeVictory={() => setSelfImprovement((prev) => logUrgeVictory(prev))}
            onUpdateWhyIStarted={(text) =>
              setSelfImprovement((prev) => updateWhyIStarted(prev, text))
            }
            onRecordFocusSession={handleRecordFocusSession}
            onAddHabit={(title, cat) => setSelfImprovement((prev) => addHabit(prev, title, cat))}
            onToggleHabitDate={(id, d) =>
              setSelfImprovement((prev) => toggleHabitDate(prev, id, d))
            }
            onDeleteHabit={(id) => setSelfImprovement((prev) => deleteHabit(prev, id))}
            onAddTask={(title, priority, cat, time) =>
              setSelfImprovement((prev) => addTask(prev, title, priority, cat, time))
            }
            onToggleTask={(id) => setSelfImprovement((prev) => toggleTask(prev, id))}
            onDeleteTask={(id) => setSelfImprovement((prev) => deleteTask(prev, id))}
            onAddGoal={(title, cat, targetDate, why, milestones) =>
              setSelfImprovement((prev) =>
                addGoal(prev, title, cat, targetDate, why, milestones)
              )
            }
            onToggleGoalMilestone={(gId, mId) =>
              setSelfImprovement((prev) => toggleGoalMilestone(prev, gId, mId))
            }
            onAddGoalMilestone={(gId, title) =>
              setSelfImprovement((prev) => addGoalMilestone(prev, gId, title))
            }
            onDeleteGoal={(gId) => setSelfImprovement((prev) => deleteGoal(prev, gId))}
            onCreateNote={handleCreateNote}
            onUpdateNote={(noteId, patch) =>
              setSelfImprovement((prev) => updateNote(prev, noteId, patch))
            }
            onDeleteNote={(noteId) => setSelfImprovement((prev) => deleteNote(prev, noteId))}
          />
        )}

        {activeTab === 'policy' && (
          <PolicyInspectorPanel
            state={state}
            onToggleDeviceOwner={handleToggleDeviceOwner}
            onSimulateReboot={handleSimulateReboot}
            onToggleOrientation={handleToggleOrientation}
            onToggleFontScale={handleToggleFontScale}
            onToggleAdminRestriction={handleToggleAdminRestriction}
            onToggleHardwarePolicy={handleToggleHardwarePolicy}
            onToggleBlockerShield={handleToggleBlockerShield}
            onSetFamilyDnsMode={handleSetFamilyDnsMode}
            onTestInAppBrowser={handleTestInAppBrowser}
            onSetAppTimeLimit={handleSetAppTimeLimit}
            onResetAppUsage={handleResetAppUsage}
            onUpdateDowntimeSchedule={handleUpdateDowntimeSchedule}
            onSetFocusBlockSession={handleSetFocusBlockSession}
            onAdvanceAppUsage={handleAdvanceAppUsage}
            onTriggerPanic={handleTriggerPanic}
            onClearPanicLockdown={handleClearPanicLockdown}
            onResetTamperDiagnostics={handleResetTamperDiagnostics}
            onSimulateRapidAdminToggles={handleSimulateRapidAdminToggles}
            onSetKioskMode={(mode) => handleSetKioskMode(mode)}
            onResetAll={handleResetAll}
          />
        )}

        {activeTab === 'pc' && (
          <PcRemoteWorkspace
            user={user}
            authLoading={authLoading}
            authError={authError}
            isOnline={isOnline}
            cloudConnected={cloudConnected}
            syncBusy={syncBusy}
            lastSyncedAt={lastSyncedAt}
            pendingOfflineSync={pendingOfflineSync}
            syncError={syncError}
            syncedDevices={syncedDevices}
            selectedDeviceId={selectedDeviceId}
            remoteDevice={syncedDevices.find((d) => d.deviceId === selectedDeviceId) ?? null}
            localKioskState={state}
            selfImprovement={selfImprovement}
            onSelectDeviceId={setSelectedDeviceId}
            onSignInGoogle={handleSignInGoogle}
            onSignOutGoogle={handleSignOutGoogle}
            onSyncNow={async () => {
              if (user) await pushLocalToCloud(user, state, selfImprovement, 'web_simulator', undefined, true);
            }}
            onRemoteUpdateSettings={handleRemoteUpdateSettings}
            onToggleHabitToday={(habitId) =>
              setSelfImprovement((prev) => toggleHabitDate(prev, habitId, formatIsoDate()))
            }
            onLogCleanDay={() => setSelfImprovement((prev) => logCleanDay(prev))}
            onLogUrgeVictory={() => setSelfImprovement((prev) => logUrgeVictory(prev))}
            onOpenSelfImprovementTab={() => setActiveTab('growth')}
          />
        )}

        {activeTab === 'adb' && <AdbProvisioningView />}
      </main>
      <LegalFooter/>
    </div>
  );
}
