/**
 * Native Android sources for the Source Explorer and the "Download project" archive.
 *
 * Files are discovered from `android-kiosk-launcher/` at build time, so this list can
 * never contain fabricated content: if the folder is absent, the list is empty and the
 * UI shows an empty state instead of placeholder code.
 */

export type AndroidProjectGroup = 'Manifest & Policy' | 'Kotlin Core' | 'UI & Layouts' | 'Gradle & Tests';

export interface AndroidProjectFile {
  id: string;
  path: string;
  name: string;
  group: AndroidProjectGroup;
  summary: string;
  content: string;
}

const PREFIX = '../../android-kiosk-launcher/';

export const ANDROID_PROJECT_ROOT = 'android-kiosk-launcher';

// `build/` and `.gradle/` hold compiled output (dex, apk, caches) and must never
// reach the explorer, the zip or the bundle.
const rawModules = import.meta.glob(
  [
    '../../android-kiosk-launcher/**/*',
    '!../../android-kiosk-launcher/**/build/**',
    '!../../android-kiosk-launcher/**/.gradle/**',
    '!../../android-kiosk-launcher/.gradle/**',
    '!../../android-kiosk-launcher/local.properties',
    // Signing material is untracked and binary: never glob it into the bundle.
    '!../../android-kiosk-launcher/keystore.properties',
    '!../../android-kiosk-launcher/*.jks',
    '!../../android-kiosk-launcher/*.keystore',
  ],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  }
) as Record<string, string>;

const GROUP_ORDER: AndroidProjectGroup[] = [
  'Manifest & Policy',
  'Kotlin Core',
  'UI & Layouts',
  'Gradle & Tests',
];

const GROUP_LABELS: Record<AndroidProjectGroup, string> = {
  'Manifest & Policy': 'Manifest & policy',
  'Kotlin Core': 'Kotlin core',
  'UI & Layouts': 'UI & layouts',
  'Gradle & Tests': 'Gradle & tests',
};

/** Short, human descriptions keyed by file name. Falls back to a generic label. */
const SUMMARY_BY_NAME: Record<string, string> = {
  'AndroidManifest.xml': 'HOME launcher, device-admin receiver and boot re-enforcement.',
  'device_admin.xml': 'Device admin capability declarations.',
  'accessibility_guard_config.xml': 'Foreground window guard configuration.',
  'KioskApplication.kt': 'Application entry point and startup wiring.',
  'KioskDeviceAdminReceiver.kt': 'Enables device-owner restrictions when provisioned.',
  'DevicePolicyHelper.kt': 'DevicePolicyManager calls for kiosk, LockTask and restrictions.',
  'BootCompletedReceiver.kt': 'Restores the kiosk launcher after reboot.',
  'KioskGuardAccessibilityService.kt': 'Returns to the kiosk when a blocked app opens.',
  'KioskAppAdapter.kt': 'Grid adapter for the allowed-apps launcher.',
  'Ui.kt': 'Small view helpers (dp, colour).',
  'KioskPreferences.kt': 'Salted PIN storage and persisted policy flags.',
  'InstalledAppsRepository.kt': 'Enumerates launchable packages for the allowlist.',
  'KioskLauncherActivity.kt': 'Home screen: allowed apps grid and LockTask entry.',
  'AdminSettingsActivity.kt': 'PIN-gated allowlist and policy administration.',
  'PinPromptDialog.kt': 'Admin passcode prompt.',
  'SelfImprovementActivity.kt': 'Focus and self-improvement hub.',
  'SelfImprovementModels.kt': 'Data models for habits, goals and notes.',
  'SelfImprovementRepository.kt': 'Persistence for the self-improvement hub.',
  'KioskBrowserActivity.kt': 'Domain-allowlisted kiosk browser.',
  'build.gradle.kts': 'Module build configuration.',
  'build-apk.sh': 'Local APK build helper.',
  'build-apk.yml': 'CI workflow that builds the debug APK.',
  'gradle.properties': 'Gradle build flags.',
  'proguard-rules.pro': 'Release shrinking rules.',
  'settings.gradle.kts': 'Gradle project settings.',
};

function classify(relPath: string): AndroidProjectGroup {
  if (
    relPath.endsWith('AndroidManifest.xml') ||
    relPath.includes('/res/xml/') ||
    relPath.includes('/xml/')
  ) {
    return 'Manifest & Policy';
  }
  if (
    relPath.startsWith('.github/') ||
    relPath.endsWith('.gradle.kts') ||
    relPath.includes('.properties') ||
    relPath.endsWith('.pro') ||
    relPath.endsWith('.sh') ||
    relPath.endsWith('.yml') ||
    relPath.includes('/test/')
  ) {
    return 'Gradle & Tests';
  }
  if (relPath.endsWith('.kt')) {
    // Screens and their helpers live under `/ui/`; everything else is core logic.
    return relPath.includes('/ui/') ? 'UI & Layouts' : 'Kotlin Core';
  }
  if (relPath.includes('/res/') || relPath.endsWith('.xml')) {
    return 'UI & Layouts';
  }
  return 'Kotlin Core';
}

function toFile(absKey: string, content: string): AndroidProjectFile {
  const relPath = absKey.startsWith(PREFIX) ? absKey.slice(PREFIX.length) : absKey;
  const name = relPath.split('/').pop() ?? relPath;
  return {
    id: relPath,
    path: relPath,
    name,
    group: classify(relPath),
    summary: SUMMARY_BY_NAME[name] ?? 'Native Android source file.',
    content,
  };
}

export const ANDROID_PROJECT_FILES: AndroidProjectFile[] = Object.entries(rawModules)
  .filter(([key, value]) => key.startsWith(PREFIX) && typeof value === 'string')
  .map(([key, value]) => toFile(key, value))
  .sort((a, b) => {
    const byGroup = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    return byGroup !== 0 ? byGroup : a.path.localeCompare(b.path);
  });

export const ANDROID_PROJECT_GROUP_LABELS = GROUP_LABELS;
export const ANDROID_PROJECT_GROUPS = GROUP_ORDER;
