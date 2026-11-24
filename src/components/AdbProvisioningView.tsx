import React, { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';

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
      'Because this browser workspace does not bundle the Android SDK compiler, click "Download Android Project", upload the extracted folder to a GitHub repository, and open Actions -> Build KioskOS Android APK to download the compiled app-debug.apk artifact directly to your phone.',
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
    title: '04. Enable Optional Accessibility Window Guard',
    description:
      'Adds an instant foreground window guard blocking Settings & Package Installer dialogs whenever Admin PIN unlock is inactive.',
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
    requirement: 'HOME + DEFAULT Launcher Categories',
    implementation: 'KioskLauncherActivity intent-filter + dpm.addPersistentPreferredActivity() pinning',
  },
  {
    requirement: 'Automatic Device Owner UserRestrictions',
    implementation: 'DISALLOW_SAFE_BOOT, DISALLOW_FACTORY_RESET, DISALLOW_ADD_USER, DISALLOW_APPS_CONTROL',
  },
  {
    requirement: 'PIN-Protected Admin Settings (Default 1234)',
    implementation: 'Salted SHA-256 PIN in Direct-Boot Device Protected Storage (KioskPreferences.kt)',
  },
  {
    requirement: 'Allowed App Selection & startLockTask()',
    implementation: 'AdminSettingsActivity allowlist synced to dpm.setLockTaskPackages() & setLockTaskEnabled(true)',
  },
  {
    requirement: 'Block Android Settings & App Uninstall',
    implementation: 'setPackagesSuspended() + setUninstallBlocked() + DISALLOW_APPS_CONTROL + Accessibility Guard',
  },
  {
    requirement: 'Reboot & Configuration Change Resilience',
    implementation: 'LOCKED_BOOT_COMPLETED receiver + comprehensive android:configChanges + onConfigurationChanged()',
  },
  {
    requirement: 'Automated APK Packaging Pipeline',
    implementation: 'Bundled .github/workflows/build-apk.yml + build-apk.sh outputting app-debug.apk',
  },
];

export const AdbProvisioningView: React.FC = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string, cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      // Clipboard blocked; ignore silently
    }
  };

  return (
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
  );
};
