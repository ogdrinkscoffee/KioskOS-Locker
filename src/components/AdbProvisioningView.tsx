import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  KeyRound,
  Link2,
  PackageCheck,
  Terminal,
  Upload,
} from 'lucide-react';

interface AdbProvisioningViewProps {
  publisherToken?: string | null;
  onPublisherTokenChange?: (token: string | null) => void;
  installedVersionCode?: number;
  installedVersionName?: string;
}

interface LiveApkRelease {
  versionCode: number;
  versionName: string;
  downloadUrl: string;
  releaseNotes: string;
  sha256: string;
  fileName: string;
  sizeBytes: number;
  publishedAt: string | null;
  source: 'builtin' | 'upload' | 'external';
  hasLocalBinary?: boolean;
}

interface CommandStep {
  id: string;
  title: string;
  description: string;
  command: string;
}

const PROVISIONING_STEPS: CommandStep[] = [
  {
    id: 'cloud-apk',
    title: '00. Build Downloadable APK via GitHub Actions (No Android Studio Needed)',
    description:
      'Click "Download Android Project", push the extracted folder to GitHub, and run Actions -> Build KioskOS Android APK (or push a v* tag to auto-create a GitHub Release). Then upload or link the compiled .apk above so devices update inside the app.',
    command: 'gh workflow run build-apk.yml && gh run download -n KioskOS-debug-apk',
  },
  {
    id: 'build-apk',
    title: '01. Or Build APK Locally in Android Studio / CLI',
    description:
      'Open the extracted android-kiosk-launcher folder in Android Studio (Build -> Build APK(s)) or run the included helper script with JDK 17 + Android SDK installed.',
    command: 'bash build-apk.sh',
  },
  {
    id: 'install-apk',
    title: '02. Install APK onto a Factory-Reset Android Device',
    description:
      'Ensure no Google or user accounts exist on the target device (Settings -> Accounts) before setting Device Owner.',
    command: 'adb install -r app/build/outputs/apk/debug/app-debug.apk',
  },
  {
    id: 'set-device-owner',
    title: '03. Provision KioskDeviceAdminReceiver as Device Owner',
    description:
      'Grants Device Owner privileges, triggering onEnabled() and automatically enforcing DISALLOW_SAFE_BOOT, DISALLOW_FACTORY_RESET, DISALLOW_ADD_USER, and DISALLOW_APPS_CONTROL.',
    command:
      'adb shell dpm set-device-owner com.kiosk.launcher/.admin.KioskDeviceAdminReceiver',
  },
  {
    id: 'enable-guard',
    title: '04. Enable Accessibility Window & Timed-Unlock Guard',
    description:
      'Adds an instant foreground window guard blocking Settings & Package Installer dialogs whenever timed Admin PIN unlock is inactive or expires.',
    command:
      'adb shell settings put secure enabled_accessibility_services com.kiosk.launcher/.service.KioskGuardAccessibilityService',
  },
  {
    id: 'verify-boot',
    title: '05. Verify Reboot & Persistent Home Behavior',
    description:
      'Reboot the device and confirm BootCompletedReceiver restores KioskLauncherActivity as HOME with all UserManager restrictions intact.',
    command: 'adb reboot',
  },
];

const REQUIREMENT_MATRIX = [
  {
    requirement: 'DeviceAdminReceiver & BIND_DEVICE_ADMIN',
    implementation: 'KioskDeviceAdminReceiver declared in AndroidManifest.xml with @xml/device_admin metadata',
  },
  {
    requirement: 'HOME + DEFAULT Launcher & LockTask Home',
    implementation:
      'dpm.setLockTaskFeatures(LOCK_TASK_FEATURE_HOME | SYSTEM_INFO | KEYGUARD) allows Home button exit back to Kiosk Home in Multi-App mode',
  },
  {
    requirement: 'Status Bar & Lockscreen Sync',
    implementation:
      'applyLockTaskFeatures & setKeyguardDisabled(!unlocked && prefs.isKeyguardDisabled()) reflect user toggles without requiring Settings unlock',
  },
  {
    requirement: 'Configurable Timed Admin Unlock (- / +)',
    implementation:
      'Timed unlock persisted across Home switches with -5m/-1m/+1m/+5m adjustments, auto-expiry watchdog & silent DO PackageInstaller uninstall',
  },
  {
    requirement: 'Website + In-App APK Self-Updater',
    implementation:
      'Server /api/apk/latest + AppUpdater.kt SHA-256 verification + Device Owner silent PackageInstaller.Session updates',
  },
  {
    requirement: 'Reboot & Configuration Change Resilience',
    implementation: 'LOCKED_BOOT_COMPLETED receiver + comprehensive android:configChanges + onConfigurationChanged()',
  },
];

export const AdbProvisioningView: React.FC<AdbProvisioningViewProps> = ({
  publisherToken = null,
  onPublisherTokenChange,
  installedVersionCode = 2,
  installedVersionName = '1.1.0',
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [liveRelease, setLiveRelease] = useState<LiveApkRelease | null>(null);
  const [releaseLoadError, setReleaseLoadError] = useState<string | null>(null);

  const [authInitialized, setAuthInitialized] = useState<boolean>(false);
  const [authEnvManaged, setAuthEnvManaged] = useState<boolean>(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const [publishMode, setPublishMode] = useState<'upload' | 'external'>('upload');
  const [versionCodeDraft, setVersionCodeDraft] = useState('3');
  const [versionNameDraft, setVersionNameDraft] = useState('1.2.0');
  const [releaseNotesDraft, setReleaseNotesDraft] = useState(
    'Fixed Home button navigation, lock screen keyguard, status bar toggle, adjustable timed unlock, and in-app updater.'
  );
  const [externalUrlDraft, setExternalUrlDraft] = useState('');
  const [externalShaDraft, setExternalShaDraft] = useState('');
  const [selectedApkFile, setSelectedApkFile] = useState<File | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);

  const originBase =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const manifestFeedUrl = `${originBase}/api/apk/latest`;

  const loadReleaseAndAuthStatus = useCallback(async () => {
    try {
      const [relRes, authRes] = await Promise.all([
        fetch('/api/apk/latest'),
        fetch('/api/apk/auth/status'),
      ]);
      if (relRes.ok) {
        const rel = (await relRes.json()) as LiveApkRelease;
        setLiveRelease(rel);
        setReleaseLoadError(null);
      } else {
        setReleaseLoadError(`Failed to load release feed (${relRes.status}).`);
      }
      if (authRes.ok) {
        const authData = (await authRes.json()) as {
          initialized?: boolean;
          envManaged?: boolean;
        };
        setAuthInitialized(Boolean(authData.initialized));
        setAuthEnvManaged(Boolean(authData.envManaged));
      }
    } catch {
      setReleaseLoadError('Could not connect to local APK release server.');
    }
  }, []);

  useEffect(() => {
    void loadReleaseAndAuthStatus();
  }, [loadReleaseAndAuthStatus]);

  const handleCopy = async (id: string, cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      // Clipboard blocked; ignore silently
    }
  };

  const handleAuthenticatePublisher = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthMessage(null);
    const endpoint =
      !authInitialized && !authEnvManaged ? '/api/apk/auth/setup' : '/api/apk/auth/verify';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcodeInput }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setAuthMessage(data.error ?? 'Authentication failed.');
        return;
      }
      onPublisherTokenChange?.(data.token);
      setPasscodeInput('');
      setAuthInitialized(true);
      setAuthMessage(null);
    } catch {
      setAuthMessage('Network error verifying publisher passcode.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleUploadApk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publisherToken) return;
    if (!selectedApkFile) {
      setPublishFeedback({ type: 'error', text: 'Select a compiled .apk file first.' });
      return;
    }

    setPublishBusy(true);
    setPublishFeedback(null);
    try {
      const bytes = await selectedApkFile.arrayBuffer();
      const res = await fetch('/api/apk/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${publisherToken}`,
          'Content-Type': 'application/vnd.android.package-archive',
          'x-apk-version-code': encodeURIComponent(versionCodeDraft.trim()),
          'x-apk-version-name': encodeURIComponent(versionNameDraft.trim()),
          'x-apk-release-notes': encodeURIComponent(releaseNotesDraft.trim()),
          'x-apk-file-name': encodeURIComponent(selectedApkFile.name),
        },
        body: bytes,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        release?: LiveApkRelease;
        error?: string;
      };
      if (res.status === 401) {
        onPublisherTokenChange?.(null);
        setPublishFeedback({
          type: 'error',
          text: 'Publisher session expired. Re-enter publisher passcode.',
        });
        return;
      }
      if (!res.ok || !data.ok) {
        setPublishFeedback({
          type: 'error',
          text: data.error ?? 'Failed to upload APK binary.',
        });
        return;
      }

      setSelectedApkFile(null);
      setPublishFeedback({
        type: 'ok',
        text: `Published ${data.release?.fileName ?? 'APK'} (v${data.release?.versionName}, build ${data.release?.versionCode}) to website & in-app updater.`,
      });
      await loadReleaseAndAuthStatus();
    } catch {
      setPublishFeedback({ type: 'error', text: 'Network error uploading APK.' });
    } finally {
      setPublishBusy(false);
    }
  };

  const handlePublishExternalRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publisherToken) return;
    setPublishBusy(true);
    setPublishFeedback(null);
    try {
      const res = await fetch('/api/apk/release', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${publisherToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          versionCode: Number.parseInt(versionCodeDraft, 10),
          versionName: versionNameDraft.trim(),
          downloadUrl: externalUrlDraft.trim(),
          releaseNotes: releaseNotesDraft.trim(),
          sha256: externalShaDraft.trim(),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        release?: LiveApkRelease;
        error?: string;
      };
      if (res.status === 401) {
        onPublisherTokenChange?.(null);
        setPublishFeedback({
          type: 'error',
          text: 'Publisher session expired. Re-enter publisher passcode.',
        });
        return;
      }
      if (!res.ok || !data.ok) {
        setPublishFeedback({
          type: 'error',
          text: data.error ?? 'Failed to save external release.',
        });
        return;
      }
      setPublishFeedback({
        type: 'ok',
        text: `Published external HTTPS release v${data.release?.versionName} (build ${data.release?.versionCode}).`,
      });
      await loadReleaseAndAuthStatus();
    } catch {
      setPublishFeedback({ type: 'error', text: 'Network error publishing release.' });
    } finally {
      setPublishBusy(false);
    }
  };

  const downloadable = Boolean(liveRelease?.downloadUrl || liveRelease?.hasLocalBinary);

  return (
    <div className="space-y-6">
      {/* Website & In-App APK Release Manager */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              <span>Website &amp; In-App APK Release Manager</span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Upload a compiled <code className="font-mono">.apk</code> or link an HTTPS GitHub Release binary here.
              Devices running KioskOS v{installedVersionName} (build {installedVersionCode}) check{' '}
              <code className="font-mono">/api/apk/latest</code> inside Admin Settings and update cleanly without losing Device Owner status.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleCopy('manifest-url', manifestFeedUrl)}
              className="min-h-[38px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5"
            >
              {copiedId === 'manifest-url' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                  <span>Copied Feed URL</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copy In-App Update URL</span>
                </>
              )}
            </button>
            {downloadable ? (
              <a
                href="/api/apk/download"
                download={liveRelease?.fileName || undefined}
                className="min-h-[38px] px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Download Latest APK (v{liveRelease?.versionName})</span>
              </a>
            ) : (
              <span className="min-h-[38px] px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 inline-flex items-center">
                No APK uploaded yet
              </span>
            )}
          </div>
        </div>

        {/* Live Published Channel Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Published Website Release
            </div>
            <div className="text-sm font-bold font-mono text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
              {liveRelease ? `v${liveRelease.versionName} (build ${liveRelease.versionCode})` : 'Loading...'}
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 capitalize">
              Source: {liveRelease?.source ?? '—'}
              {liveRelease && liveRelease.sizeBytes > 0
                ? ` · ${(liveRelease.sizeBytes / (1024 * 1024)).toFixed(2)} MB`
                : ''}
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Android In-App Feed Endpoint
            </div>
            <div className="text-xs font-mono text-sky-700 dark:text-sky-400 mt-1 truncate" title={manifestFeedUrl}>
              {manifestFeedUrl}
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 truncate">
              {liveRelease?.sha256 ? `SHA-256: ${liveRelease.sha256.slice(0, 20)}...` : 'No binary hash yet'}
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Release Notes
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 line-clamp-2">
              {releaseLoadError ?? (liveRelease?.releaseNotes || '—')}
            </p>
          </div>
        </div>

        {/* Publisher Authentication or Upload / Link Form */}
        {!publisherToken ? (
          <form
            onSubmit={handleAuthenticatePublisher}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  <span>
                    {!authInitialized && !authEnvManaged
                      ? 'Set Publisher Passcode (First-Run Setup)'
                      : 'Sign In to Publish APK Updates'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                  {!authInitialized && !authEnvManaged
                    ? 'Create a server-side publisher passcode (min 6 chars) or configure APK_PUBLISH_PASSCODE in Secrets.'
                    : authEnvManaged
                    ? 'Enter the configured server APK_PUBLISH_PASSCODE to upload or link releases.'
                    : 'Enter your publisher passcode to unlock APK upload & release publishing.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                placeholder={
                  !authInitialized && !authEnvManaged
                    ? 'Choose publisher passcode (6+ chars)...'
                    : 'Enter publisher passcode...'
                }
                aria-label="APK Publisher Passcode"
                className="flex-1 min-w-[220px] h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs"
              />
              <button
                type="submit"
                disabled={authBusy}
                className="h-9 px-4 rounded-lg bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 text-white text-xs font-semibold disabled:opacity-50"
              >
                {authBusy
                  ? 'Verifying...'
                  : !authInitialized && !authEnvManaged
                  ? 'Claim Publisher Passcode'
                  : 'Unlock Publishing'}
              </button>
            </div>
            {authMessage && (
              <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
                {authMessage}
              </p>
            )}
          </form>
        ) : (
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPublishMode('upload')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 ${
                    publishMode === 'upload'
                      ? 'bg-sky-600 border-sky-600 text-white'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Upload .apk File</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPublishMode('external')}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 ${
                    publishMode === 'external'
                      ? 'bg-sky-600 border-sky-600 text-white'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Link HTTPS / GitHub Release APK</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => onPublisherTokenChange?.(null)}
                className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              >
                Lock Publisher
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="apk-ver-code" className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                  Version Code (integer &gt; {installedVersionCode})
                </label>
                <input
                  id="apk-ver-code"
                  type="number"
                  min={1}
                  value={versionCodeDraft}
                  onChange={(e) => setVersionCodeDraft(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono text-xs"
                />
              </div>
              <div>
                <label htmlFor="apk-ver-name" className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                  Version Name (e.g. 1.2.0)
                </label>
                <input
                  id="apk-ver-name"
                  type="text"
                  value={versionNameDraft}
                  onChange={(e) => setVersionNameDraft(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono text-xs"
                />
              </div>
              <div>
                <label htmlFor="apk-release-notes" className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                  Release Notes
                </label>
                <input
                  id="apk-release-notes"
                  type="text"
                  value={releaseNotesDraft}
                  onChange={(e) => setReleaseNotesDraft(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs"
                />
              </div>
            </div>

            {publishMode === 'upload' ? (
              <form onSubmit={handleUploadApk} className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept=".apk,application/vnd.android.package-archive"
                  onChange={(e) => setSelectedApkFile(e.target.files?.[0] ?? null)}
                  aria-label="Select compiled Android APK file"
                  className="flex-1 min-w-[220px] text-xs text-slate-700 dark:text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-300 dark:file:border-slate-700 file:bg-white dark:file:bg-slate-900 file:text-xs file:font-semibold"
                />
                <button
                  type="submit"
                  disabled={publishBusy}
                  className="h-9 px-4 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{publishBusy ? 'Uploading...' : 'Publish APK to Website & App'}</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handlePublishExternalRelease} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="apk-ext-url" className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                      Direct HTTPS APK Download URL
                    </label>
                    <input
                      id="apk-ext-url"
                      type="url"
                      value={externalUrlDraft}
                      onChange={(e) => setExternalUrlDraft(e.target.value)}
                      placeholder="https://github.com/.../releases/download/v1.2.0/app-release.apk"
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="apk-ext-sha" className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                      Optional SHA-256 Digest (64 hex chars)
                    </label>
                    <input
                      id="apk-ext-sha"
                      type="text"
                      value={externalShaDraft}
                      onChange={(e) => setExternalShaDraft(e.target.value)}
                      placeholder="Optional checksum for verified install..."
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono text-xs"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={publishBusy}
                  className="h-9 px-4 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {publishBusy ? 'Publishing...' : 'Publish HTTPS Release Feed'}
                </button>
              </form>
            )}

            {publishFeedback && (
              <p
                role="status"
                className={`text-xs font-medium ${
                  publishFeedback.type === 'ok'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {publishFeedback.text}
              </p>
            )}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6 items-start">
        <section className="min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
          <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Mobile APK Build &amp; ADB Provisioning Guide
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Compile the downloadable <code className="font-mono text-slate-900 dark:text-slate-200">app-debug.apk</code>{' '}
              via the bundled GitHub Actions workflow or Android Studio, then bind{' '}
              <code className="font-mono text-slate-900 dark:text-slate-200">KioskDeviceAdminReceiver</code> as Device
              Owner.
            </p>
          </div>

          <div className="space-y-4">
            {PROVISIONING_STEPS.map((step) => (
              <div key={step.id} className="pb-4 border-b border-slate-100 dark:border-slate-800 last:border-b-0 last:pb-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{step.title}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{step.description}</p>
                <div className="mt-2.5 flex items-center justify-between gap-3 bg-slate-950 border border-slate-800 text-slate-100 rounded-lg px-3.5 py-2.5 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Terminal className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
                    <code className="font-mono text-xs truncate">{step.command}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(step.id, step.command)}
                    aria-label={`Copy command for ${step.title}`}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 text-[11px] font-medium inline-flex items-center gap-1 shrink-0"
                  >
                    {copiedId === step.id ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" aria-hidden="true" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 pb-3 border-b border-slate-200 dark:border-slate-800">
            Native Architecture Verification Matrix
          </h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
            {REQUIREMENT_MATRIX.map((row) => (
              <div key={row.requirement} className="py-3">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{row.requirement}</div>
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{row.implementation}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
