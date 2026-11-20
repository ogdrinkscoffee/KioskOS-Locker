import { useCallback, useEffect, useRef, useState } from 'react';
import { Cloud, Download, Moon, Sun } from 'lucide-react';
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
import { SourceExplorerView } from './components/SourceExplorerView';
import { AdbProvisioningView } from './components/AdbProvisioningView';
import { PcRemoteWorkspace } from './components/PcRemoteWorkspace';
import { ANDROID_PROJECT_FILES } from './data/androidProjectFiles';
import { buildZipArchive } from './utils/zipBuilder';
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
  addCustomAffirmation,
  addGoal,
  addGoalMilestone,
  addHabit,
  addTask,
  commitTodaysAffirmation,
  createInitialSelfImprovementState,
  createNote,
  cycleAffirmation,
  deleteAffirmation,
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

type WorkspaceTab = 'simulator' | 'growth' | 'policy' | 'pc' | 'source' | 'adb';
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
    const parsed = JSON.parse(raw) as Partial<SelfImprovementState>;
    const base = createInitialSelfImprovementState();
    return {
      ...base,
      ...parsed,
      cleanCheckInDates:
        Array.isArray(parsed.cleanCheckInDates) && parsed.cleanCheckInDates.length > 0
          ? parsed.cleanCheckInDates
          : base.cleanCheckInDates,
      affirmations:
        Array.isArray(parsed.affirmations) && parsed.affirmations.length > 0
          ? parsed.affirmations
          : base.affirmations,
      activeAffirmationIndex:
        typeof parsed.activeAffirmationIndex === 'number' ? parsed.activeAffirmationIndex : 0,
      lastAffirmationCommittedDate:
        parsed.lastAffirmationCommittedDate !== undefined
          ? parsed.lastAffirmationCommittedDate
          : null,
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
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('simulator');
  const [themeMode, setThemeMode] = useState<ThemeMode>(loadInitialTheme);
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
      overrideSalt?: string
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

        const deviceRef = doc(db, 'users', targetUser.uid, 'devices', selectedDeviceId);
        const devicePayload = buildDeviceSyncPayload({
          state: kioskSnapshot,
          ownerId: targetUser.uid,
          deviceId: selectedDeviceId,
          deviceLabel:
            syncedDevices.find((d) => d.deviceId === selectedDeviceId)?.deviceLabel ??
            'Pixel Kiosk Mobile',
          platform:
            syncedDevices.find((d) => d.deviceId === selectedDeviceId)?.platform ??
            'web_simulator',
          isOnline: navigator.onLine,
          adminPinSalt: activeSalt,
          adminPinHash: pinHash,
          source,
        });

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

        const growthRef = doc(db, 'users', targetUser.uid, 'growth', DEFAULT_PROFILE_ID);
        const growthPayload = buildGrowthSyncPayload({
          growth: growthSnapshot,
          ownerId: targetUser.uid,
          profileId: DEFAULT_PROFILE_ID,
          source,
        });
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

        setPendingOfflineSync(false);
        setCloudConnected(true);
        setLastSyncedAt(formatClockNow());
      } catch (err) {
        if (isNetworkUnavailableError(err)) {
          setPendingOfflineSync(true);
          setSyncError('Offline or Firestore unreachable — changes remain saved locally and will sync later.');
        } else {
          setSyncError(err instanceof Error ? err.message : 'Sync failed.');
          handleFirestoreError(err, OperationType.WRITE, `${userPath} / ${devicePath} / ${growthPath}`);
        }
      } finally {
        setSyncBusy(false);
      }
    },
    [pinSalt, selectedDeviceId, syncedDevices]
  );

  // Attach real-time Firestore listeners ONLY when authenticated
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

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
          const pinHash = await hashPinWithSalt(state.adminPin, pinSalt);
          await setDoc(devRef, {
            ...buildDeviceSyncPayload({
              state,
              ownerId: user.uid,
              deviceId: selectedDeviceId,
              adminPinSalt: pinSalt,
              adminPinHash: pinHash,
              source: 'web_simulator',
            }),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        const growthRef = doc(db, 'users', user.uid, 'growth', DEFAULT_PROFILE_ID);
        const gSnap = await getDoc(growthRef);
        if (!gSnap.exists()) {
          await setDoc(growthRef, {
            ...buildGrowthSyncPayload({
              growth: selfImprovement,
              ownerId: user.uid,
              profileId: DEFAULT_PROFILE_ID,
              source: 'web_simulator',
            }),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
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
          setState((prev) => applyRemoteDeviceToKioskState(prev, matched));
          window.setTimeout(() => {
            applyingRemoteDeviceRef.current = false;
          }, 150);
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
          setSelfImprovement((prev) => applyRemoteGrowthToLocalState(prev, remote));
          window.setTimeout(() => {
            applyingRemoteGrowthRef.current = false;
          }, 150);
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
    if (!user || applyingRemoteDeviceRef.current) return;
    if (!isOnline) {
      setPendingOfflineSync(true);
      return;
    }
    const timer = window.setTimeout(() => {
      void pushLocalToCloud(user, state, selfImprovement, 'web_simulator');
    }, 650);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, selfImprovement, user, isOnline]);

  // Auto-flush queued offline changes when coming back online
  useEffect(() => {
    if (user && isOnline && pendingOfflineSync) {
      void pushLocalToCloud(user, state, selfImprovement, 'web_simulator');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, user, pendingOfflineSync]);

  const handleSignInGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithGoogleAccount();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In cancelled or blocked.');
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
    if (!user) return { ok: false, error: 'Sign in first.' };
    if (!isOnline) {
      return { ok: false, error: 'PC is offline — connect to push remote updates to your phone.' };
    }

    const remoteSnap = syncedDevices.find((d) => d.deviceId === selectedDeviceId);
    const baseState: KioskState = remoteSnap
      ? applyRemoteDeviceToKioskState(state, remoteSnap)
      : state;
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
      setState(updatedState);
      await updateDoc(doc(db, 'users', user.uid, 'devices', selectedDeviceId), {
        ...pcAllowedFields,
        updatedAt: serverTimestamp(),
      });
      setLastSyncedAt(formatClockNow());
      window.setTimeout(() => {
        applyingRemoteDeviceRef.current = false;
      }, 250);
      return { ok: true };
    } catch (err) {
      applyingRemoteDeviceRef.current = false;
      const msg = err instanceof Error ? err.message : 'Failed to push remote update.';
      if (!isNetworkUnavailableError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/devices/${selectedDeviceId}`);
      }
      return { ok: false, error: msg };
    }
  };

  const handleDownloadZip = () => {
    const zipBytes = buildZipArchive(
      ANDROID_PROJECT_FILES.map((file) => ({
        path: `android-kiosk-launcher/${file.path}`,
        content: file.content,
      }))
    );
    const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'android-kiosk-launcher.zip';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleLaunchApp = (packageName: string) => {
    setState((prev) => launchApp(prev, packageName, formatClockNow()));
  };

  const handleAttemptUninstall = (packageName: string) => {
    setState((prev) => attemptUninstallApp(prev, packageName, formatClockNow()));
  };

  const handleOpenPinGate = (target: PinGateTarget) => {
    setState((prev) => openPinGate(prev, target));
  };

  const handleSubmitPin = (pin: string): { verified: boolean; lockedOutSeconds?: number } => {
    const { nextState, verified, lockedOutSeconds } = submitPin(
      state,
      pin,
      formatClockNow(),
      Date.now()
    );
    setState(nextState);
    return { verified, lockedOutSeconds };
  };

  const handleCancelPinGate = () => {
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
  };

  const handleToggleAllowedApp = (packageName: string) => {
    setState((prev) => toggleAllowedApp(prev, packageName, formatClockNow()));
  };

  const handleAddCustomApp = (
    label: string,
    packageName: string
  ): { ok: boolean; error?: string } => {
    const res = addCustomApp(state, label, packageName, formatClockNow());
    if (res.ok) {
      setState(res.nextState);
    }
    return { ok: res.ok, error: res.error };
  };

  const handleUpdatePin = (
    currentPin: string,
    newPin: string,
    confirmPin: string
  ): { ok: boolean; error?: string } => {
    const res = updateAdminPin(state, currentPin, newPin, confirmPin, formatClockNow());
    if (res.ok) {
      setState(res.nextState);
    }
    return { ok: res.ok, error: res.error };
  };

  const handleSetAdminUnlock = (unlocked: boolean) => {
    setState((prev) => setAdminSystemUnlock(prev, unlocked, formatClockNow()));
  };

  const handleSetKioskMode = (mode: KioskOperationMode, singleAppPackage?: string | null) => {
    setState((prev) => setKioskOperationMode(prev, mode, singleAppPackage, formatClockNow()));
  };

  const handleUpdateKioskTitle = (title: string) => {
    setState((prev) => updateKioskTitle(prev, title, formatClockNow()));
  };

  const handleToggleHardwarePolicy = (key: HardwareLockPolicyKey) => {
    setState((prev) => toggleHardwarePolicy(prev, key, undefined, formatClockNow()));
  };

  const handleToggleBlockerShield = (
    key: BlockerShieldToggleKey
  ): { ok: boolean; error?: string } => {
    const res = toggleBlockerShield(state, key, undefined, formatClockNow(), Date.now());
    setState(res.nextState);
    return { ok: res.ok, error: res.error };
  };

  const handleSetFamilyDnsMode = (
    mode: FamilyDnsMode
  ): { ok: boolean; error?: string } => {
    const res = setFamilyDnsMode(state, mode, formatClockNow(), Date.now());
    setState(res.nextState);
    return { ok: res.ok, error: res.error };
  };

  const handleUpdateInAppWhitelist = (packages: string[]) => {
    setState((prev) => updateInAppBrowserWhitelist(prev, packages, formatClockNow()));
  };

  const handleUpdateBlockedKeywords = (keywords: string[]) => {
    setState((prev) => updateBlockedKeywords(prev, keywords, formatClockNow()));
  };

  const handleActivateStrictLock = (minutes: number) => {
    setState((prev) => activateStrictShieldLock(prev, minutes, formatClockNow(), Date.now()));
  };

  const handleTestInAppBrowser = (
    packageName: string
  ): { allowed: boolean; reason: string } => {
    const res = testInAppBrowserAccess(state, packageName, formatClockNow());
    setState(res.nextState);
    return { allowed: res.allowed, reason: res.reason };
  };

  const handleUpdateAllowedDomains = (domains: string[]) => {
    setState((prev) => updateAllowedDomains(prev, domains, formatClockNow()));
  };

  const handleNavigateBrowser = (url: string): { ok: boolean; reason?: string } => {
    const res = navigateKioskBrowser(state, url, formatClockNow());
    setState(res.nextState);
    return { ok: res.ok, reason: res.reason };
  };

  const handleSetAppTimeLimit = (
    packageName: string,
    minutes: number
  ): { ok: boolean; error?: string } => {
    const res = setAppTimeLimit(state, packageName, minutes, formatClockNow(), Date.now());
    setState(res.nextState);
    return { ok: res.ok, error: res.error };
  };

  const handleResetAppUsage = (packageName: string): { ok: boolean; error?: string } => {
    const res = resetAppUsage(state, packageName, formatClockNow(), Date.now());
    setState(res.nextState);
    return { ok: res.ok, error: res.error };
  };

  const handleUpdateDowntimeSchedule = (
    patch: Partial<DowntimeSchedule>
  ): { ok: boolean; error?: string } => {
    const res = updateDowntimeSchedule(state, patch, formatClockNow(), Date.now());
    setState(res.nextState);
    return { ok: res.ok, error: res.error };
  };

  const handleSetFocusBlockSession = (minutes: number): { ok: boolean; error?: string } => {
    const res = setFocusBlockSession(state, minutes, formatClockNow(), Date.now());
    setState(res.nextState);
    return { ok: res.ok, error: res.error };
  };

  const handleAdvanceAppUsage = (packageName: string, deltaSeconds: number) => {
    setState((prev) =>
      advanceAppUsage(prev, packageName, deltaSeconds, formatClockNow(), Date.now())
    );
  };

  const handleTriggerPanic = () => {
    setState((prev) => triggerPanicLockdown(prev, undefined, formatClockNow(), Date.now()));
  };

  const handleClearPanicLockdown = () => {
    setState((prev) => clearPanicLockdown(prev, formatClockNow()));
  };

  const handleResetTamperDiagnostics = () => {
    setState((prev) => resetTamperDiagnostics(prev, formatClockNow()));
  };

  const handleSimulateRapidAdminToggles = () => {
    const ts = formatClockNow();
    const baseMs = Date.now();
    setState((prev) => {
      let next = prev;
      for (let i = 0; i < 4; i += 1) {
        next = toggleHardwarePolicy(next, 'statusBarDisabled', undefined, ts, baseMs + i * 250);
      }
      return next;
    });
  };

  const handleReturnHome = () => {
    setState((prev) => returnToKioskHome(prev, formatClockNow()));
  };

  const handleToggleDeviceOwner = () => {
    setState((prev) => toggleDeviceOwnerMode(prev, !prev.isDeviceOwner, formatClockNow()));
  };

  const handleSimulateReboot = () => {
    setState((prev) => ({ ...prev, activeScreen: 'rebooting', blockedNotice: null }));
    window.setTimeout(() => {
      setState((prev) => simulateDeviceReboot(prev, formatClockNow()));
    }, 450);
  };

  const handleToggleOrientation = () => {
    setState((prev) => ({
      ...prev,
      orientation: prev.orientation === 'portrait' ? 'landscape' : 'portrait',
    }));
  };

  const handleToggleFontScale = () => {
    setState((prev) => ({
      ...prev,
      fontScale: prev.fontScale === '1.0x' ? '1.15x' : '1.0x',
    }));
  };

  const handleResetAll = () => {
    setState(createInitialKioskState());
  };

  const handleCreateNote = (
    notebook: Parameters<typeof createNote>[1],
    title?: string,
    htmlContent?: string
  ): string => {
    const { nextState, createdNoteId } = createNote(
      selfImprovement,
      notebook,
      title,
      htmlContent
    );
    setSelfImprovement(nextState);
    return createdNoteId;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      {/* 3-Zone Single-Line Top Bar Contract */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('simulator');
            }}
            className="inline-flex items-center gap-2.5 text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
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
            aria-label="Workspace sections"
            className="flex items-center gap-2.5 sm:gap-7 overflow-x-auto"
          >
            {(
              [
                { id: 'simulator', label: 'Simulator', shortLabel: 'Simulator' },
                { id: 'growth', label: 'Self-Improvement', shortLabel: 'Growth' },
                { id: 'policy', label: 'Policy Inspector', shortLabel: 'Policy' },
                { id: 'pc', label: 'PC Remote', shortLabel: 'PC' },
                { id: 'source', label: 'Source Explorer', shortLabel: 'Source' },
                { id: 'adb', label: 'ADB Provisioning', shortLabel: 'ADB' },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-1.5 text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                    active
                      ? 'border-sky-600 dark:border-sky-400 text-slate-900 dark:text-slate-100'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="shrink-0 hidden md:flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('pc')}
              className={`min-h-[38px] px-3 py-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                user
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{user ? 'Synced' : 'PC Sync'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadZip}
              className="min-h-[38px] px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download Android Project</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="top" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 text-balance">
              Android Device Owner Kiosk Launcher
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
              Native Kotlin project (<code className="font-mono text-slate-800 dark:text-slate-200">com.kiosk.launcher</code>)
              with <code className="font-mono text-slate-800 dark:text-slate-200">DeviceAdminReceiver</code>,{' '}
              <code className="font-mono text-slate-800 dark:text-slate-200">HOME</code> lockdown,{' '}
              <code className="font-mono text-slate-800 dark:text-slate-200">UserManager</code> restrictions,
              PIN-protected app allowlisting, and integrated Self-Improvement &amp; Rich Notes hub.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="theme-toggle-button"
              aria-pressed={isDark}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              className="min-h-[38px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              {isDark ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-700" aria-hidden="true" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadZip}
              className="md:hidden min-h-[38px] px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download Android Project</span>
            </button>
          </div>
        </div>

        {activeTab === 'simulator' && (
          <div
            className={`grid grid-cols-1 gap-8 items-start ${
              state.orientation === 'landscape'
                ? 'xl:grid-cols-[660px_1fr]'
                : 'lg:grid-cols-[420px_1fr]'
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
              onCycleAffirmation={(delta) =>
                setSelfImprovement((prev) => cycleAffirmation(prev, delta))
              }
              onRecordFocusSession={(minutes, label) =>
                setSelfImprovement((prev) => recordFocusSession(prev, minutes, label))
              }
              onQuickSaveDiaryNote={(title, body) => {
                handleCreateNote('Diary', title, body);
              }}
              onOpenFullSelfImprovement={() => setActiveTab('growth')}
            />
            <PolicyInspectorPanel
              state={state}
              onToggleDeviceOwner={handleToggleDeviceOwner}
              onSimulateReboot={handleSimulateReboot}
              onToggleOrientation={handleToggleOrientation}
              onToggleFontScale={handleToggleFontScale}
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
            onCycleAffirmation={(delta) =>
              setSelfImprovement((prev) => cycleAffirmation(prev, delta))
            }
            onCommitAffirmation={() =>
              setSelfImprovement((prev) => commitTodaysAffirmation(prev))
            }
            onAddCustomAffirmation={(text, focusArea) =>
              setSelfImprovement((prev) => addCustomAffirmation(prev, text, focusArea))
            }
            onDeleteAffirmation={(id) =>
              setSelfImprovement((prev) => deleteAffirmation(prev, id))
            }
            onRecordFocusSession={(minutes, label) =>
              setSelfImprovement((prev) => recordFocusSession(prev, minutes, label))
            }
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
              if (user) await pushLocalToCloud(user, state, selfImprovement, 'web_simulator');
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

        {activeTab === 'source' && <SourceExplorerView />}

        {activeTab === 'adb' && <AdbProvisioningView />}
      </main>
    </div>
  );
}
