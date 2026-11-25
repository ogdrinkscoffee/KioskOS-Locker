import React, { useState } from 'react';
import { Check, ChevronDown, Copy, Terminal } from 'lucide-react';
import { useI18n } from '../i18n/LocaleProvider';

interface CommandStep {
  id: string;
  title: string;
  hint: string;
  command: string;
}

const STEPS: CommandStep[] = [
  {
    id: 'install',
    title: 'Install IroncladOS.apk on a factory-reset device',
    hint: 'Use the Download APK button first. The device must have no Google or user accounts before it can become Device Owner.',
    command: 'adb install -r IroncladOS.apk',
  },
  {
    id: 'device-owner',
    title: 'Set Device Owner',
    hint: 'Grants the admin APIs. Kiosk locks start once Ironclad OS is the Home app (Admin → Default launcher), so a device you keep using stays untouched.',
    command: 'adb shell dpm set-device-owner com.kiosk.launcher/.admin.KioskDeviceAdminReceiver',
  },
  {
    id: 'guard',
    title: 'Enable the window guard',
    hint: 'Optional. Blocks Settings and package-installer dialogs while the admin passcode is locked.',
    command:
      'adb shell settings put secure enabled_accessibility_services com.kiosk.launcher/.service.KioskGuardAccessibilityService',
  },
  {
    id: 'reboot',
    title: 'Reboot and verify',
    hint: 'BootCompletedReceiver restores the kiosk home screen with all restrictions intact.',
    command: 'adb reboot',
  },
];

const MATRIX: { requirement: string; implementation: string }[] = [
  {
    requirement: 'DeviceAdminReceiver & BIND_DEVICE_ADMIN',
    implementation: 'Declared in AndroidManifest.xml with @xml/device_admin metadata',
  },
  {
    requirement: 'HOME + DEFAULT launcher categories',
    implementation: 'KioskLauncherActivity intent-filter and addPersistentPreferredActivity()',
  },
  {
    requirement: 'Device Owner UserManager restrictions',
    implementation: 'DISALLOW_SAFE_BOOT, FACTORY_RESET, ADD_USER, APPS_CONTROL',
  },
  {
    requirement: 'PIN-protected admin settings',
    implementation: 'Salted SHA-256 PIN in direct-boot protected storage',
  },
  {
    requirement: 'Allowlist and LockTask',
    implementation: 'setLockTaskPackages() followed by setLockTaskEnabled(true)',
  },
  {
    requirement: 'Block Settings and uninstall',
    implementation: 'setPackagesSuspended(), setUninstallBlocked(), DISALLOW_APPS_CONTROL',
  },
  {
    requirement: 'Reboot resilience',
    implementation: 'LOCKED_BOOT_COMPLETED receiver and full configChanges handling',
  },
];

export const AdbProvisioningView: React.FC = () => {
  const { tr } = useI18n();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      // Clipboard blocked; ignore silently
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{tr("Provision a device")}</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{"\n          "}{tr("Four steps after downloading IroncladOS.apk to lock down a phone running")}{' '}
          <span className="font-mono text-[13px] text-slate-800 dark:text-slate-200">
            com.kiosk.launcher
          </span>
          .
        </p>
      </div>

      <ol className="surface divide-y divide-slate-200/80 dark:divide-white/10">
        {STEPS.map((step, index) => (
          <li key={step.id} className="px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold tabular-nums text-slate-600 dark:bg-white/10 dark:text-slate-300">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white">
                  {tr(step.title)}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {tr(step.hint)}
                </p>
                <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-white/10 dark:bg-black/40">
                  <Terminal className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  <code className="min-w-0 flex-1 truncate text-[11px] text-slate-800 dark:text-slate-200">
                    {step.command}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopy(step.id, step.command)}
                    aria-label={`${tr('Copy command for')} ${tr(step.title)}`}
                    className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    {copiedId === step.id ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <details className="surface group px-5 py-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold text-slate-900 dark:text-white">{"\n          "}{tr("Verification matrix")}{"\n          "}<ChevronDown
            className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <dl className="mt-4 space-y-3">
          {MATRIX.map((row) => (
            <div key={tr(row.requirement)}>
              <dt className="text-xs font-medium text-slate-900 dark:text-slate-100">
                {tr(row.requirement)}
              </dt>
              <dd className="text-xs text-slate-500 dark:text-slate-400">{tr(row.implementation)}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
};
