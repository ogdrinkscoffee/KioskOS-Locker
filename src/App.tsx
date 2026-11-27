/**
 * Copyright (c) 2026 [Your Name / Studio Name]. All Rights Reserved.
 * Proprietary and confidential. Unauthorized copying, reverse-engineering,
 * modification, or redistribution of this file is strictly prohibited.
 */
import { LegalFooter } from './components/LegalFooter';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Check,
  Cloud,
  Download,
  Languages,
  MonitorSmartphone,
  Moon,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Terminal,
  TrendingUp,
} from 'lucide-react';
import {
  EASE_SETTLE,
  HeroSecurityCanvas,
  MotionWorkspacePanel,
  SPRING_SNAPPY,
} from './components/MotionPrimitives';
import {
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { AndroidDeviceSimulator } from './components/AndroidDeviceSimulator';
import { FeaturesView } from './components/FeaturesView';
import { PolicyInspectorPanel } from './components/PolicyInspectorPanel';
import { SelfImprovementWorkspace } from './components/SelfImprovementWorkspace';
import { AdbProvisioningView } from './components/AdbProvisioningView';
import { PolicySummary } from './components/PolicySummary';
import { PcRemoteWorkspace } from './components/PcRemoteWorkspace';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useI18n } from './i18n/LocaleProvider';
import { APK_META_VARS } from './generated/apkMeta';
import {
  User,
  auth,
  db,
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
  toggleAppPasswordProtection,
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
  verifyAppAccessPin,
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
import { parseSelfImprovementPayload, parseStoredKioskPayload } from './utils/validation';

type WorkspaceTab = 'features' | 'simulator' | 'growth' | 'policy' | 'pc' | 'adb';
type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'kioskos_simulator_state_v1';
const SI_STORAGE_KEY = 'kioskos_self_improvement_v1';
const PIN_SALT_STORAGE_KEY = 'kioskos_pin_salt_v1';
const THEME_STORAGE_KEY = 'kioskos_theme_v1';
const DEFAULT_DEVICE_ID = 'primary-kiosk';
const DEFAULT_PROFILE_ID = 'main';
const DEVICE_PAGE_SIZE = 20;
const LOCAL_SAVE_DEBOUNCE_MS = 300;

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
    const parsed: unknown = JSON.parse(raw);
    const validatedState = parseStoredKioskPayload(parsed, createInitialKioskState());
    return ensureUsageDateCurrent(validatedState, getLocalDateIso());
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
    const parsed: unknown = JSON.parse(raw);
    return parseSelfImprovementPayload(parsed, createInitialSelfImprovementState());
  } catch {
    return createInitialSelfImprovementState();
  }
}

export default function App() {
  const { t, locale, setLocale, tr } = useI18n();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('features');
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
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [hasMoreDevices, setHasMoreDevices] = useState(false);
  const [loadingMoreDevices, setLoadingMoreDevices] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(DEFAULT_DEVICE_ID);
  const [pinSalt, setPinSalt] = useState<string>(getOrCreatePinSalt);
  const [syncRetryNonce, setSyncRetryNonce] = useState(0);
  const [heroImageError, setHeroImageError] = useState(false);
  const [appIconError, setAppIconError] = useState(false);
  const [heroPointer, setHeroPointer] = useState({ x: 0.5, y: 0.5 });

  const applyingRemoteDeviceRef = useRef(false);
  const applyingRemoteGrowthRef = useRef(false);
  const hasEnsuredCloudProfileRef = useRef<string | null>(null);
  const ensuredCloudDocsRef = useRef<Set<string>>(new Set());
  const devicesCursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const syncInFlightRef = useRef(false);
  const syncRetryAttemptRef = useRef(0);
  const syncBackoffUntilRef = useRef(0);
  const authActionBusyRef = useRef(false);
  const authFailuresRef = useRef(0);
  const authCooldownUntilRef = useRef(0);
  const rebootTimerRef = useRef<number | null>(null);
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
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Ignore storage quota errors
      }
    }, LOCAL_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(SI_STORAGE_KEY, JSON.stringify(selfImprovement));
      } catch {
        // Ignore storage quota errors
      }
    }, LOCAL_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [selfImprovement]);

  useEffect(() => {
    const flushLocalStorage = () => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stateRef.current));
        window.localStorage.setItem(SI_STORAGE_KEY, JSON.stringify(selfImprovementRef.current));
      } catch {
        // Ignore storage quota errors
      }
    };
    window.addEventListener('pagehide', flushLocalStorage);
    return () => {
      window.removeEventListener('pagehide', flushLocalStorage);
      flushLocalStorage();
    };
  }, []);

  // Network listeners + startup Firestore check (non-blocking for offline mode)
  useEffect(() => {
    let mounted = true;
    const handleOnline = () => {
      syncBackoffUntilRef.current = 0;
      syncRetryAttemptRef.current = 0;
      setIsOnline(true);
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    void testConnection()
      .then((ok) => {
        if (mounted) setCloudConnected(ok);
      })
      .catch(() => {
        if (mounted) setCloudConnected(false);
      });
    return () => {
      mounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (rebootTimerRef.current !== null) {
        window.clearTimeout(rebootTimerRef.current);
      }
    };
  }, []);

  // Auth listener (optional account; mobile works 100% signed out)
  useEffect(() => {
    const unsub = onAuthStateChanged(
      auth,
      (nextUser) => {
        setUser(nextUser);
        setAuthLoading(false);
        if (!nextUser) {
          setSyncedDevices([]);
          setDevicesLoading(false);
          setHasMoreDevices(false);
          setSyncError(null);
          devicesCursorRef.current = null;
          hasEnsuredCloudProfileRef.current = null;
          ensuredCloudDocsRef.current.clear();
          lastDeviceDigestRef.current = null;
          lastGrowthDigestRef.current = null;
          syncRetryAttemptRef.current = 0;
          syncBackoffUntilRef.current = 0;
        }
      },
      (err) => {
        setAuthLoading(false);
        setAuthError(err instanceof Error ? err.message : tr('Authentication listener failed.'));
      }
    );
    return () => unsub();
  }, [tr]);

  const pushLocalToCloud = useCallback(
    async (
      targetUser: User,
      kioskSnapshot: KioskState,
      growthSnapshot: SelfImprovementState,
      source: SyncSourceTag,
      overrideSalt?: string,
      forcePush = false
    ) => {
      if (!targetUser.emailVerified) {
        setSyncError(tr('Verify your account email to enable cloud sync. Local mode stays active.'));
        return;
      }
      if (!navigator.onLine) {
        setPendingOfflineSync(true);
        return;
      }
      if (syncInFlightRef.current) {
        return;
      }
      if (!forcePush && Date.now() < syncBackoffUntilRef.current) {
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

      syncInFlightRef.current = true;
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
          ensuredCloudDocsRef.current.add(userPath);
        }

        const deviceRef = doc(db, 'users', targetUser.uid, 'devices', selectedDeviceId);
        const growthRef = doc(db, 'users', targetUser.uid, 'growth', DEFAULT_PROFILE_ID);

        // Fetch existence metadata in parallel only for docs not yet known to exist in this session
        const [devExists, growthExists] = await Promise.all([
          !deviceChanged
            ? Promise.resolve(false)
            : ensuredCloudDocsRef.current.has(devicePath)
            ? Promise.resolve(true)
            : getDoc(deviceRef).then((snap) => snap.exists()),
          !growthChanged
            ? Promise.resolve(false)
            : ensuredCloudDocsRef.current.has(growthPath)
            ? Promise.resolve(true)
            : getDoc(growthRef).then((snap) => snap.exists()),
        ]);

        if (deviceChanged || growthChanged) {
          const batch = writeBatch(db);
          if (deviceChanged) {
            if (!devExists) {
              batch.set(deviceRef, {
                ...devicePayload,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } else {
              const { ownerId: _o, deviceId: _d, ...updatable } = devicePayload;
              batch.update(deviceRef, {
                ...updatable,
                updatedAt: serverTimestamp(),
              });
            }
          }
          if (growthChanged) {
            if (!growthExists) {
              batch.set(growthRef, {
                ...growthPayload,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } else {
              const { ownerId: _go, profileId: _gp, ...updatableGrowth } = growthPayload;
              batch.update(growthRef, {
                ...updatableGrowth,
                updatedAt: serverTimestamp(),
              });
            }
          }
          await batch.commit();
          if (deviceChanged) {
            ensuredCloudDocsRef.current.add(devicePath);
            lastDeviceDigestRef.current = nextDeviceDigest;
          }
          if (growthChanged) {
            ensuredCloudDocsRef.current.add(growthPath);
            lastGrowthDigestRef.current = nextGrowthDigest;
          }
        }

        syncRetryAttemptRef.current = 0;
        syncBackoffUntilRef.current = 0;
        setPendingOfflineSync(false);
        setCloudConnected(true);
        setLastSyncedAt(formatClockNow());
      } catch (err) {
        if (isNetworkUnavailableError(err)) {
          const attempt = Math.min(5, syncRetryAttemptRef.current);
          syncRetryAttemptRef.current = attempt + 1;
          syncBackoffUntilRef.current = Date.now() + Math.min(60_000, 2_000 * 2 ** attempt);
          setPendingOfflineSync(true);
          setSyncError(tr('Offline or Firestore unreachable — changes remain saved locally and will sync later.'));
        } else {
          setSyncError(
            err instanceof Error
              ? err.message
              : tr('Cloud sync failed. Local data remains saved safely.')
          );
        }
      } finally {
        syncInFlightRef.current = false;
        setSyncBusy(false);
      }
    },
    [pinSalt, selectedDeviceId, computeDeviceDigest, computeGrowthDigest, tr]
  );

  // Attach bounded single-doc Firestore listeners + cursor-paginated device list (20/page)
  useEffect(() => {
    if (!user) return;
    if (!user.emailVerified) {
      setSyncError(tr('Verify your account email to enable cloud sync. Local mode stays active.'));
      return;
    }
    let cancelled = false;
    lastDeviceDigestRef.current = null;
    lastGrowthDigestRef.current = null;
    devicesCursorRef.current = null;
    setDevicesLoading(true);
    setSyncError(null);

    const toDeviceSnapshot = (raw: CloudDeviceSnapshot): CloudDeviceSnapshot => ({
      ...raw,
      createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt.toMillis() : raw.createdAt,
      updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt.toMillis() : raw.updatedAt,
    });

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
        ensuredCloudDocsRef.current.add(`users/${user.uid}`);

        const devRef = doc(db, 'users', user.uid, 'devices', selectedDeviceId);
        const growthRef = doc(db, 'users', user.uid, 'growth', DEFAULT_PROFILE_ID);
        const devicesPageQuery = query(
          collection(db, 'users', user.uid, 'devices'),
          where('ownerId', '==', user.uid),
          limit(DEVICE_PAGE_SIZE)
        );

        const [devSnap, gSnap, devicesPageSnap] = await Promise.all([
          getDoc(devRef),
          getDoc(growthRef),
          getDocs(devicesPageQuery),
        ]);

        const batch = writeBatch(db);
        let batchHasWrites = false;
        let seededDevicePayload: Omit<CloudDeviceSnapshot, 'createdAt' | 'updatedAt'> | null = null;
        let seededGrowthPayload: Omit<CloudGrowthSnapshot, 'createdAt' | 'updatedAt'> | null = null;

        if (!devSnap.exists()) {
          const currentState = stateRef.current;
          const pinHash = await hashPinWithSalt(currentState.adminPin, pinSalt);
          seededDevicePayload = buildDeviceSyncPayload({
            state: currentState,
            ownerId: user.uid,
            deviceId: selectedDeviceId,
            adminPinSalt: pinSalt,
            adminPinHash: pinHash,
            source: 'web_simulator',
          });
          batch.set(devRef, {
            ...seededDevicePayload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batchHasWrites = true;
        }

        if (!gSnap.exists()) {
          seededGrowthPayload = buildGrowthSyncPayload({
            growth: selfImprovementRef.current,
            ownerId: user.uid,
            profileId: DEFAULT_PROFILE_ID,
            source: 'web_simulator',
          });
          batch.set(growthRef, {
            ...seededGrowthPayload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batchHasWrites = true;
        }

        if (batchHasWrites) {
          await batch.commit();
        }
        ensuredCloudDocsRef.current.add(`users/${user.uid}/devices/${selectedDeviceId}`);
        ensuredCloudDocsRef.current.add(`users/${user.uid}/growth/${DEFAULT_PROFILE_ID}`);
        if (seededDevicePayload) {
          lastDeviceDigestRef.current = computeDeviceDigest(seededDevicePayload);
        }
        if (seededGrowthPayload) {
          lastGrowthDigestRef.current = computeGrowthDigest(seededGrowthPayload);
        }

        if (!cancelled) {
          const initialDocs = devicesPageSnap.docs.map((d) =>
            toDeviceSnapshot(d.data() as CloudDeviceSnapshot)
          );
          devicesCursorRef.current =
            devicesPageSnap.docs[devicesPageSnap.docs.length - 1] ?? null;
          setHasMoreDevices(devicesPageSnap.docs.length === DEVICE_PAGE_SIZE);
          setSyncedDevices(initialDocs);
          setCloudConnected(true);
          setSyncError(null);
          setLastSyncedAt(formatClockNow());
        }
      } catch (err) {
        if (!cancelled) {
          if (isNetworkUnavailableError(err)) {
            setPendingOfflineSync(true);
            setSyncError(
              tr('Offline or Firestore unreachable — local mode remains active and will sync when online.')
            );
          } else {
            setCloudConnected(false);
            setSyncError(
              err instanceof Error
                ? err.message
                : tr('Could not load cloud device sync. Local mode stays active.')
            );
          }
        }
      } finally {
        if (!cancelled) {
          setDevicesLoading(false);
        }
      }
    };

    void initAndSubscribe();

    // Listen ONLY to the active selected device document instead of subscribing to the whole collection
    const unsubSelectedDevice = onSnapshot(
      doc(db, 'users', user.uid, 'devices', selectedDeviceId),
      (snapshot) => {
        if (!snapshot.exists()) return;
        const matched = toDeviceSnapshot(snapshot.data() as CloudDeviceSnapshot);
        ensuredCloudDocsRef.current.add(`users/${user.uid}/devices/${selectedDeviceId}`);

        setSyncedDevices((prev) => {
          const exists = prev.some((d) => d.deviceId === matched.deviceId);
          return exists
            ? prev.map((d) => (d.deviceId === matched.deviceId ? matched : d))
            : [matched, ...prev];
        });

        if (matched.lastModifiedBy === 'pc_web') {
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
          window.setTimeout(() => {
            applyingRemoteDeviceRef.current = false;
          }, 0);
        }
        setLastSyncedAt(formatClockNow());
      },
      (error) => {
        if (isNetworkUnavailableError(error)) {
          setPendingOfflineSync(true);
        } else {
          setSyncError(
            error instanceof Error
              ? error.message
              : tr('Cloud listener paused. Local data remains saved safely.')
          );
        }
      }
    );

    const unsubGrowth = onSnapshot(
      doc(db, 'users', user.uid, 'growth', DEFAULT_PROFILE_ID),
      (snapshot) => {
        if (!snapshot.exists()) return;
        ensuredCloudDocsRef.current.add(`users/${user.uid}/growth/${DEFAULT_PROFILE_ID}`);
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
          window.setTimeout(() => {
            applyingRemoteGrowthRef.current = false;
          }, 0);
        }
      },
      (error) => {
        if (isNetworkUnavailableError(error)) {
          setPendingOfflineSync(true);
        } else {
          setSyncError(
            error instanceof Error
              ? error.message
              : tr('Growth sync listener paused. Local data remains saved safely.')
          );
        }
      }
    );

    return () => {
      cancelled = true;
      unsubSelectedDevice();
      unsubGrowth();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedDeviceId, syncRetryNonce]);

  const handleLoadMoreDevices = useCallback(async () => {
    if (!user || !user.emailVerified || loadingMoreDevices || !hasMoreDevices || !devicesCursorRef.current) {
      return;
    }
    setLoadingMoreDevices(true);
    try {
      const nextPageQuery = query(
        collection(db, 'users', user.uid, 'devices'),
        where('ownerId', '==', user.uid),
        startAfter(devicesCursorRef.current),
        limit(DEVICE_PAGE_SIZE)
      );
      const snap = await getDocs(nextPageQuery);
      const moreDocs = snap.docs.map((d) => {
        const raw = d.data() as CloudDeviceSnapshot;
        return {
          ...raw,
          createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt.toMillis() : raw.createdAt,
          updatedAt: raw.updatedAt instanceof Timestamp ? raw.updatedAt.toMillis() : raw.updatedAt,
        };
      });
      devicesCursorRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setHasMoreDevices(snap.docs.length === DEVICE_PAGE_SIZE);
      if (moreDocs.length > 0) {
        setSyncedDevices((prev) => {
          const seen = new Set(prev.map((d) => d.deviceId));
          return [...prev, ...moreDocs.filter((d) => !seen.has(d.deviceId))];
        });
      }
    } catch (err) {
      if (isNetworkUnavailableError(err)) {
        setPendingOfflineSync(true);
      } else {
        setSyncError(
          err instanceof Error ? err.message : tr('Failed to load additional synced devices.')
        );
      }
    } finally {
      setLoadingMoreDevices(false);
    }
  }, [user, loadingMoreDevices, hasMoreDevices, tr]);

  // Debounced auto-sync when local Kiosk or Growth state changes while signed in & verified
  useEffect(() => {
    if (!user || !user.emailVerified) return;
    if (applyingRemoteDeviceRef.current || applyingRemoteGrowthRef.current) return;
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

  // Flush queued offline changes only when transitioning online (not on failed retry loops)
  useEffect(() => {
    if (user && user.emailVerified && isOnline && pendingOfflineSync) {
      void pushLocalToCloud(user, stateRef.current, selfImprovementRef.current, 'web_simulator');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, user]);

  const handleSignInGoogle = async (challenge: {
    captchaToken: string;
    website: string;
  }): Promise<boolean> => {
    if (authActionBusyRef.current) return false;
    if (challenge.website.trim().length > 0) {
      setAuthError(tr('Automated submission rejected.'));
      return false;
    }
    if (!challenge.captchaToken) {
      setAuthError(tr('Please complete the Turnstile verification challenge first.'));
      return false;
    }
    const now = Date.now();
    if (now < authCooldownUntilRef.current) {
      const waitSecs = Math.max(1, Math.ceil((authCooldownUntilRef.current - now) / 1000));
      setAuthError(tr('Too many sign-in attempts. Wait {s}s and try again.', { s: waitSecs }));
      return false;
    }
    authActionBusyRef.current = true;
    setAuthError(null);
    try {
      const verifyResponse = await fetch('/api/auth/verify-turnstile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          captchaToken: challenge.captchaToken,
          website: challenge.website,
        }),
      });
      const rawText = await verifyResponse.text();
      let verifyData: { ok?: boolean; error?: string } = {};
      if (rawText) {
        try {
          verifyData = JSON.parse(rawText) as { ok?: boolean; error?: string };
        } catch {
          verifyData = {};
        }
      }
      if (!verifyResponse.ok || !verifyData.ok) {
        setAuthError(
          verifyData.error ??
            tr('Bot verification failed ({status}). Please try again.', {
              status: verifyResponse.status,
            })
        );
        return false;
      }

      await signInWithGoogleAccount();
      authFailuresRef.current = 0;
      authCooldownUntilRef.current = 0;
      return true;
    } catch (err) {
      const nextFails = authFailuresRef.current + 1;
      authFailuresRef.current = nextFails;
      if (nextFails >= 3) {
        authCooldownUntilRef.current = Date.now() + Math.min(60_000, 5_000 * 2 ** (nextFails - 3));
      }
      setAuthError(err instanceof Error ? err.message : tr("Google Sign-In cancelled or blocked."));
      return false;
    } finally {
      authActionBusyRef.current = false;
    }
  };

  const handleSignOutGoogle = async () => {
    if (authActionBusyRef.current) return;
    authActionBusyRef.current = true;
    setAuthError(null);
    try {
      await signOutAccount();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : tr('Failed to sign out.'));
    } finally {
      authActionBusyRef.current = false;
    }
  };

  const handleRemoteUpdateSettings = async (
    updater: (current: KioskState) => KioskState,
    options?: { clearPinLockout?: boolean; newPlainPin?: string }
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!user) return { ok: false, error: tr('Sign in first.') };
    if (!user.emailVerified) {
      return { ok: false, error: tr('Verify your account email before remote updates.') };
    }
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
      window.setTimeout(() => {
        applyingRemoteDeviceRef.current = false;
      }, 0);
      return { ok: true };
    } catch (err) {
      applyingRemoteDeviceRef.current = false;
      const msg = isNetworkUnavailableError(err)
        ? tr('Network unavailable — remote update could not reach your phone.')
        : err instanceof Error
        ? err.message
        : tr('Failed to push remote update.');
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

  const handleToggleAppPasswordProtection = useCallback((packageName: string) => {
    setState((prev) => toggleAppPasswordProtection(prev, packageName, undefined, formatClockNow()));
  }, []);

  const handleVerifyAppAccessPin = useCallback(
    (packageName: string, pin: string): { verified: boolean; lockedOutSeconds?: number } => {
      const { nextState, verified, lockedOutSeconds } = verifyAppAccessPin(
        stateRef.current,
        packageName,
        pin,
        formatClockNow(),
        Date.now()
      );
      setState(nextState);
      return { verified, lockedOutSeconds };
    },
    []
  );

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
    if (rebootTimerRef.current !== null) {
      window.clearTimeout(rebootTimerRef.current);
    }
    setState((prev) => ({ ...prev, activeScreen: 'rebooting', blockedNotice: null }));
    rebootTimerRef.current = window.setTimeout(() => {
      rebootTimerRef.current = null;
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
    <div className="flex min-h-screen flex-col overflow-x-hidden text-slate-900 antialiased dark:text-slate-100">
      <a
        href="#top"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-sky-600 focus:px-3.5 focus:py-2 focus:text-xs focus:font-semibold focus:text-white focus:shadow-lg"
      >
        {tr('Skip to main content')}
      </a>
      {/* 3-Zone Single-Line Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-white/10 dark:bg-[#070b11]/85">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:h-16 sm:flex-nowrap sm:px-6 sm:py-0">
          <motion.a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('features');
            }}
            whileHover={{ y: -0.5 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.14, ease: EASE_SETTLE }}
            className="group inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap text-base font-semibold tracking-tight text-slate-900 dark:text-white"
          >
            {!appIconError ? (
              <img
                src="/app-icon.svg"
                alt=""
                width={28}
                height={28}
                onError={() => setAppIconError(true)}
                className="w-7 h-7 rounded-lg shrink-0 transition-transform duration-150 group-hover:scale-105 group-hover:-rotate-3"
              />
            ) : (
              <ShieldCheck
                className="w-6 h-6 text-sky-600 dark:text-sky-400 shrink-0 transition-transform duration-150 group-hover:scale-105"
                aria-hidden="true"
              />
            )}
            <span>Ironclad OS</span>
          </motion.a>

          <nav
            aria-label={t('nav.sectionsLabel')}
            className="order-last -mx-1 w-full overflow-x-auto px-1 sm:order-none sm:mx-0 sm:ms-auto sm:w-auto sm:px-0"
          >
            <div className="relative flex w-max items-center gap-0.5 rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 dark:border-white/10 dark:bg-white/[0.04]">
              {(
                [
                  { id: 'features', label: t('nav.features'), shortLabel: t('nav.featuresShort'), Icon: Sparkles },
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
                  <motion.button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    aria-current={active ? 'page' : undefined}
                    whileTap={{ scale: 0.96 }}
                    transition={{ duration: 0.12, ease: EASE_SETTLE }}
                    className={`relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                      active
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="top-nav-active-pill"
                        transition={SPRING_SNAPPY}
                        className="absolute inset-0 rounded-lg bg-white shadow-sm dark:bg-slate-800"
                        aria-hidden="true"
                      />
                    )}
                    <Icon className="relative z-10 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                    <span className="relative z-10 hidden sm:inline">{tab.label}</span>
                    <span className="relative z-10 sm:hidden">{tab.shortLabel}</span>
                  </motion.button>
                );
              })}
            </div>
          </nav>

          <div className="ms-auto flex shrink-0 items-center gap-1.5">
            <motion.button
              type="button"
              onClick={() => setActiveTab('pc')}
              whileHover={{ y: -0.5 }}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.14, ease: EASE_SETTLE }}
              className={`hidden min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors sm:inline-flex ${
                user
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]'
              }`}
            >
              <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{user ? t('sync.synced') : t('sync.action')}</span>
            </motion.button>
            <div className="relative" ref={langMenuRef}>
              <motion.button
                type="button"
                data-testid="locale-toggle-button"
                aria-label={t('lang.label')}
                aria-haspopup="menu"
                aria-expanded={langMenuOpen}
                title={t('lang.label')}
                whileTap={{ scale: 0.94 }}
                transition={{ duration: 0.12, ease: EASE_SETTLE }}
                onClick={() => setLangMenuOpen((open) => !open)}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                  langMenuOpen
                    ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]'
                }`}
              >
                <Languages className="h-4 w-4" aria-hidden="true" />
              </motion.button>
              <AnimatePresence>
                {langMenuOpen && (
                  <motion.div
                    role="menu"
                    aria-label={t('lang.label')}
                    data-testid="locale-menu"
                    initial={{ opacity: 0, y: -4, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.96 }}
                    transition={{ duration: 0.15, ease: EASE_SETTLE }}
                    className="absolute end-0 top-full z-40 mt-1.5 min-w-36 origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-[#0d131b]"
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <motion.button
              type="button"
              data-testid="theme-toggle-button"
              aria-pressed={isDark}
              aria-label={isDark ? t('theme.toLight') : t('theme.toDark')}
              title={isDark ? t('theme.lightMode') : t('theme.darkMode')}
              whileTap={{ scale: 0.94 }}
              transition={{ duration: 0.12, ease: EASE_SETTLE }}
              onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08]"
            >
              <AnimatePresence mode="wait" initial={false}>
                {isDark ? (
                  <motion.span
                    key="sun"
                    initial={{ opacity: 0, rotate: -45, scale: 0.7 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: 45, scale: 0.7 }}
                    transition={{ duration: 0.15, ease: EASE_SETTLE }}
                    className="inline-flex"
                  >
                    <Sun className="h-4 w-4" aria-hidden="true" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="moon"
                    initial={{ opacity: 0, rotate: 45, scale: 0.7 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: -45, scale: 0.7 }}
                    transition={{ duration: 0.15, ease: EASE_SETTLE }}
                    className="inline-flex"
                  >
                    <Moon className="h-4 w-4" aria-hidden="true" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
            <motion.a
              href="/downloads/IroncladOS.apk"
              download="Ironclad-OS.apk"
              aria-label={t('download.apkAria')}
              title={t('download.apkTitle', APK_META_VARS)}
              whileHover={{ y: -0.5 }}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.14, ease: EASE_SETTLE }}
              className="btn-primary whitespace-nowrap"
            >
              <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{t('download.apk')}</span>
            </motion.a>
          </div>
        </div>
      </header>

      {/* APK release notes: own row under the top bar so it never widens the header. */}
      <p className="mx-auto w-full max-w-6xl px-4 py-2 text-[11px] font-medium leading-snug text-slate-500 sm:px-6 dark:text-slate-400">
        {t('download.apkNotes', APK_META_VARS)}
      </p>

      {/* Main Content */}
      <main id="top" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <section className="mb-8 grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_292px]">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: EASE_SETTLE }}
            className="max-w-2xl"
          >
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-400">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden="true" />
              {t('hero.eyebrow')}
            </div>
            <h1 className="mt-3 text-[30px] font-semibold leading-[1.1] tracking-tight text-slate-900 dark:text-white sm:text-[40px]">
              {t('hero.title')}
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
              {t('hero.lead')}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <motion.a
                href="/downloads/IroncladOS.apk"
                download="Ironclad-OS.apk"
                title={t('download.apkTitle', APK_META_VARS)}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.14, ease: EASE_SETTLE }}
                className="group btn-primary min-h-11 px-5 text-sm"
              >
                <Download
                  className="h-4 w-4 transition-transform duration-150 group-hover:translate-y-0.5"
                  aria-hidden="true"
                />
                {t('hero.cta')}
              </motion.a>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t('hero.meta', APK_META_VARS)}
              </span>
            </div>
            <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
              <li>{t('hero.bullet.reset')}</li>
              <li>{t('hero.bullet.block')}</li>
              <li>{t('hero.bullet.allowlist')}</li>
              <li>{t('hero.bullet.bypass')}</li>
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.34, delay: 0.06, ease: EASE_SETTLE }}
            onPointerMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                setHeroPointer({
                  x: (e.clientX - rect.left) / rect.width,
                  y: (e.clientY - rect.top) / rect.height,
                });
              }
            }}
            onPointerLeave={() => setHeroPointer({ x: 0.5, y: 0.5 })}
            className="relative hidden aspect-square overflow-hidden rounded-2xl border border-slate-200/80 bg-[#0a1220] shadow-sm lg:block dark:border-white/10"
          >
            {!heroImageError ? (
              <img
                src="/brand/ironclad-shield.jpg"
                alt={t('hero.imageAlt')}
                width={1024}
                height={1024}
                loading="eager"
                onError={() => setHeroImageError(true)}
                className="h-full w-full object-cover opacity-90 transition-transform duration-300 ease-out"
                style={{
                  transform: `scale(1.03) translate3d(${(heroPointer.x - 0.5) * -6}px, ${(heroPointer.y - 0.5) * -6}px, 0)`,
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 to-[#060b14]">
                <ShieldCheck className="h-16 w-16 text-sky-400/80" aria-hidden="true" />
              </div>
            )}
            <HeroSecurityCanvas
              pointerX={heroPointer.x}
              pointerY={heroPointer.y}
              className="absolute inset-0 h-full w-full"
            />
            <div
              className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10"
              aria-hidden="true"
            />
          </motion.div>
        </section>

        <ErrorBoundary
          key={activeTab}
          sectionName={tr('Active Workspace')}
          onReset={() => setSyncRetryNonce((n) => n + 1)}
        >
          <AnimatePresence mode="wait">
            <MotionWorkspacePanel key={activeTab}>
              {activeTab === 'features' && <FeaturesView />}

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
                    onToggleAppPasswordProtection={handleToggleAppPasswordProtection}
                    onVerifyAppAccessPin={handleVerifyAppAccessPin}
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
                  devicesLoading={devicesLoading}
                  lastSyncedAt={lastSyncedAt}
                  pendingOfflineSync={pendingOfflineSync}
                  syncError={syncError}
                  syncedDevices={syncedDevices}
                  hasMoreDevices={hasMoreDevices}
                  loadingMoreDevices={loadingMoreDevices}
                  selectedDeviceId={selectedDeviceId}
                  remoteDevice={syncedDevices.find((d) => d.deviceId === selectedDeviceId) ?? null}
                  localKioskState={state}
                  selfImprovement={selfImprovement}
                  onSelectDeviceId={setSelectedDeviceId}
                  onLoadMoreDevices={handleLoadMoreDevices}
                  onRetrySync={() => setSyncRetryNonce((n) => n + 1)}
                  onSignInGoogle={handleSignInGoogle}
                  onSignOutGoogle={handleSignOutGoogle}
                  onSyncNow={async () => {
                    if (user) {
                      try {
                        await pushLocalToCloud(user, state, selfImprovement, 'web_simulator', undefined, true);
                      } catch (err) {
                        setSyncError(err instanceof Error ? err.message : tr('Sync failed.'));
                      }
                    }
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
            </MotionWorkspacePanel>
          </AnimatePresence>
        </ErrorBoundary>
      </main>
      <div className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6">
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300/70 bg-amber-50/80 p-4 dark:border-amber-500/25 dark:bg-amber-500/[0.07]">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
          <div>
            <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">
              {t('notice.title')}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-200/80">
              {t('notice.body')}
            </p>
          </div>
        </div>
      </div>
      <LegalFooter />
    </div>
  );
}
