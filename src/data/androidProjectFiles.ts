import settingsGradle from '../../android-kiosk-launcher/settings.gradle.kts?raw';
import rootBuildGradle from '../../android-kiosk-launcher/build.gradle.kts?raw';
import gradleProperties from '../../android-kiosk-launcher/gradle.properties?raw';
import appBuildGradle from '../../android-kiosk-launcher/app/build.gradle.kts?raw';
import proguardRules from '../../android-kiosk-launcher/app/proguard-rules.pro?raw';
import androidManifest from '../../android-kiosk-launcher/app/src/main/AndroidManifest.xml?raw';
import deviceAdminXml from '../../android-kiosk-launcher/app/src/main/res/xml/device_admin.xml?raw';
import accessibilityGuardXml from '../../android-kiosk-launcher/app/src/main/res/xml/accessibility_guard_config.xml?raw';
import filePathsXml from '../../android-kiosk-launcher/app/src/main/res/xml/file_paths.xml?raw';
import kioskApplicationKt from '../../android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/KioskApplication.kt?raw';
import deviceAdminReceiverKt from '../../android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/admin/KioskDeviceAdminReceiver.kt?raw';
import devicePolicyHelperKt from '../../android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/admin/DevicePolicyHelper.kt?raw';
import bootReceiverKt from '../../android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/receiver/BootCompletedReceiver.kt?raw';
import accessibilityServiceKt from '../../android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/service/KioskGuardAccessibilityService.kt?raw';
import kioskPreferencesKt from '../../android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/data/KioskPreferences.kt?raw';
import installedAppsRepoKt from '../../android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/data/InstalledAppsRepository.kt?raw';
import launcherActivityKt from '../../android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/ui/KioskLauncherActivity.kt?raw';
import adminSettingsActivityKt from '../../android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/ui/AdminSettingsActivity.kt?raw';
import pinPromptDialogKt from '../../android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/ui/PinPromptDialog.kt?raw';
import cloudSyncManagerKt from '../../android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/sync/CloudSyncManager.kt?raw';
import updateResultReceiverKt from '../../android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/update/UpdateResultReceiver.kt?raw';
import appUpdaterKt from '../../android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/update/AppUpdater.kt?raw';
import kioskPolicyTestKt from '../../android-kiosk-launcher/app/src/test/kotlin/com/kiosk/launcher/KioskPolicyTest.kt?raw';
import stringsXml from '../../android-kiosk-launcher/app/src/main/res/values/strings.xml?raw';
import colorsXml from '../../android-kiosk-launcher/app/src/main/res/values/colors.xml?raw';
import colorsNightXml from '../../android-kiosk-launcher/app/src/main/res/values-night/colors.xml?raw';
import themesXml from '../../android-kiosk-launcher/app/src/main/res/values/themes.xml?raw';
import icLauncherBgXml from '../../android-kiosk-launcher/app/src/main/res/drawable/ic_launcher_background.xml?raw';
import icLauncherFgXml from '../../android-kiosk-launcher/app/src/main/res/drawable/ic_launcher_foreground.xml?raw';
import icLauncherXml from '../../android-kiosk-launcher/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml?raw';
import icLauncherRoundXml from '../../android-kiosk-launcher/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml?raw';
import layoutLauncherXml from '../../android-kiosk-launcher/app/src/main/res/layout/activity_kiosk_launcher.xml?raw';
import layoutAdminXml from '../../android-kiosk-launcher/app/src/main/res/layout/activity_admin_settings.xml?raw';
import layoutItemAppXml from '../../android-kiosk-launcher/app/src/main/res/layout/item_kiosk_app.xml?raw';
import layoutItemAdminXml from '../../android-kiosk-launcher/app/src/main/res/layout/item_admin_app_toggle.xml?raw';
import layoutDialogPinXml from '../../android-kiosk-launcher/app/src/main/res/layout/dialog_pin_entry.xml?raw';
import selfImprovementModelsKt from '../../android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/selfimprovement/SelfImprovementModels.kt?raw';
import selfImprovementRepoKt from '../../android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/selfimprovement/SelfImprovementRepository.kt?raw';
import selfImprovementActivityKt from '../../android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/ui/SelfImprovementActivity.kt?raw';
import layoutSelfImprovementXml from '../../android-kiosk-launcher/app/src/main/res/layout/activity_self_improvement.xml?raw';
import kioskBrowserActivityKt from '../../android-kiosk-launcher/app/src/main/kotlin/com/kiosk/launcher/ui/KioskBrowserActivity.kt?raw';
import layoutKioskBrowserXml from '../../android-kiosk-launcher/app/src/main/res/layout/activity_kiosk_browser.xml?raw';
import githubApkWorkflow from '../../android-kiosk-launcher/.github/workflows/build-apk.yml?raw';
import gradleWrapperProps from '../../android-kiosk-launcher/gradle/wrapper/gradle-wrapper.properties?raw';
import buildApkScript from '../../android-kiosk-launcher/build-apk.sh?raw';

export interface AndroidProjectFile {
  id: string;
  path: string;
  name: string;
  group: 'Manifest & Policy' | 'Kotlin Core' | 'UI & Layouts' | 'Gradle & Tests';
  summary: string;
  content: string;
}

export const ANDROID_PROJECT_FILES: AndroidProjectFile[] = [
  {
    id: 'manifest',
    path: 'app/src/main/AndroidManifest.xml',
    name: 'AndroidManifest.xml',
    group: 'Manifest & Policy',
    summary: 'Declares HOME/DEFAULT launcher, BIND_DEVICE_ADMIN receiver, Direct-Boot receiver, and configChanges.',
    content: androidManifest,
  },
  {
    id: 'device-admin-xml',
    path: 'app/src/main/res/xml/device_admin.xml',
    name: 'device_admin.xml',
    group: 'Manifest & Policy',
    summary: 'Device Admin policy metadata referenced by KioskDeviceAdminReceiver.',
    content: deviceAdminXml,
  },
  {
    id: 'accessibility-xml',
    path: 'app/src/main/res/xml/accessibility_guard_config.xml',
    name: 'accessibility_guard_config.xml',
    group: 'Manifest & Policy',
    summary: 'Window state listener config for blocking Android Settings and Package Installer.',
    content: accessibilityGuardXml,
  },
  {
    id: 'file-paths-xml',
    path: 'app/src/main/res/xml/file_paths.xml',
    name: 'file_paths.xml',
    group: 'Manifest & Policy',
    summary: 'FileProvider cache-path declaration for fallback APK update installation prompts.',
    content: filePathsXml,
  },
  {
    id: 'device-policy-helper',
    path: 'app/src/main/kotlin/com/kiosk/launcher/admin/DevicePolicyHelper.kt',
    name: 'DevicePolicyHelper.kt',
    group: 'Kotlin Core',
    summary: 'Enforces all 4 UserManager restrictions, setLockTaskPackages, startLockTask(), and Settings/Uninstall blocking.',
    content: devicePolicyHelperKt,
  },
  {
    id: 'device-admin-receiver',
    path: 'app/src/main/kotlin/com/kiosk/launcher/admin/KioskDeviceAdminReceiver.kt',
    name: 'KioskDeviceAdminReceiver.kt',
    group: 'Kotlin Core',
    summary: 'DeviceAdminReceiver subclass handling provisioning & admin lifecycle hooks.',
    content: deviceAdminReceiverKt,
  },
  {
    id: 'boot-receiver',
    path: 'app/src/main/kotlin/com/kiosk/launcher/receiver/BootCompletedReceiver.kt',
    name: 'BootCompletedReceiver.kt',
    group: 'Kotlin Core',
    summary: 'Handles LOCKED_BOOT_COMPLETED & BOOT_COMPLETED, revokes temp unlocks, and restores kiosk home.',
    content: bootReceiverKt,
  },
  {
    id: 'kiosk-preferences',
    path: 'app/src/main/kotlin/com/kiosk/launcher/data/KioskPreferences.kt',
    name: 'KioskPreferences.kt',
    group: 'Kotlin Core',
    summary: 'Direct-Boot Device Protected Storage for salted SHA-256 PIN (default 1234) and allowed packages.',
    content: kioskPreferencesKt,
  },
  {
    id: 'accessibility-guard',
    path: 'app/src/main/kotlin/com/kiosk/launcher/service/KioskGuardAccessibilityService.kt',
    name: 'KioskGuardAccessibilityService.kt',
    group: 'Kotlin Core',
    summary: 'Prevents Settings & Uninstall screens from opening unless unlocked with Admin PIN.',
    content: accessibilityServiceKt,
  },
  {
    id: 'installed-apps-repo',
    path: 'app/src/main/kotlin/com/kiosk/launcher/data/InstalledAppsRepository.kt',
    name: 'InstalledAppsRepository.kt',
    group: 'Kotlin Core',
    summary: 'Queries launchable packages via PackageManager for Admin allowlist selection.',
    content: installedAppsRepoKt,
  },
  {
    id: 'kiosk-application',
    path: 'app/src/main/kotlin/com/kiosk/launcher/KioskApplication.kt',
    name: 'KioskApplication.kt',
    group: 'Kotlin Core',
    summary: 'Application entrypoint applying Device Owner policies immediately on process start.',
    content: kioskApplicationKt,
  },
  {
    id: 'cloud-sync-manager',
    path: 'app/src/main/kotlin/com/kiosk/launcher/sync/CloudSyncManager.kt',
    name: 'CloudSyncManager.kt',
    group: 'Kotlin Core',
    summary: 'Optional, offline-first REST sync client for PC Web status, growth, and password-verified remote settings.',
    content: cloudSyncManagerKt,
  },
  {
    id: 'update-result-receiver',
    path: 'app/src/main/kotlin/com/kiosk/launcher/update/UpdateResultReceiver.kt',
    name: 'UpdateResultReceiver.kt',
    group: 'Kotlin Core',
    summary: 'BroadcastReceiver handling Device Owner PackageInstaller APK update & silent uninstall results.',
    content: updateResultReceiverKt,
  },
  {
    id: 'app-updater',
    path: 'app/src/main/kotlin/com/kiosk/launcher/update/AppUpdater.kt',
    name: 'AppUpdater.kt',
    group: 'Kotlin Core',
    summary: 'In-app APK updater supporting /api/apk/latest & GitHub Releases with SHA-256 verification and silent DO install.',
    content: appUpdaterKt,
  },
  {
    id: 'launcher-activity',
    path: 'app/src/main/kotlin/com/kiosk/launcher/ui/KioskLauncherActivity.kt',
    name: 'KioskLauncherActivity.kt',
    group: 'UI & Layouts',
    summary: 'HOME launcher activity launching allowed apps via startLockTask() and handling config changes.',
    content: launcherActivityKt,
  },
  {
    id: 'admin-settings-activity',
    path: 'app/src/main/kotlin/com/kiosk/launcher/ui/AdminSettingsActivity.kt',
    name: 'AdminSettingsActivity.kt',
    group: 'UI & Layouts',
    summary: 'PIN-protected admin screen to allow apps, change PIN, and temporarily unlock Settings/Uninstall.',
    content: adminSettingsActivityKt,
  },
  {
    id: 'pin-prompt-dialog',
    path: 'app/src/main/kotlin/com/kiosk/launcher/ui/PinPromptDialog.kt',
    name: 'PinPromptDialog.kt',
    group: 'UI & Layouts',
    summary: 'Material 3 PIN entry dialog guarding Admin Settings access.',
    content: pinPromptDialogKt,
  },
  {
    id: 'self-improvement-models',
    path: 'app/src/main/kotlin/com/kiosk/launcher/selfimprovement/SelfImprovementModels.kt',
    name: 'SelfImprovementModels.kt',
    group: 'Kotlin Core',
    summary: 'Data models for Habits, Tasks, Goals, Milestones, and Rich HTML Notes.',
    content: selfImprovementModelsKt,
  },
  {
    id: 'self-improvement-repo',
    path: 'app/src/main/kotlin/com/kiosk/launcher/selfimprovement/SelfImprovementRepository.kt',
    name: 'SelfImprovementRepository.kt',
    group: 'Kotlin Core',
    summary: 'Direct-Boot-safe JSON repository for Clean Streak, Habits, Tasks, Goals, and Notes.',
    content: selfImprovementRepoKt,
  },
  {
    id: 'self-improvement-activity',
    path: 'app/src/main/kotlin/com/kiosk/launcher/ui/SelfImprovementActivity.kt',
    name: 'SelfImprovementActivity.kt',
    group: 'UI & Layouts',
    summary: 'Integrated LockTask Self-Improvement hub with Clean Streak, Habit/Task trackers, and Rich Notes editor.',
    content: selfImprovementActivityKt,
  },
  {
    id: 'layout-self-improvement',
    path: 'app/src/main/res/layout/activity_self_improvement.xml',
    name: 'activity_self_improvement.xml',
    group: 'UI & Layouts',
    summary: 'Layout for Clean Streak, Focus Timer, Habit/Task tracker, and Rich Notes toolbar.',
    content: layoutSelfImprovementXml,
  },
  {
    id: 'kiosk-browser-activity',
    path: 'app/src/main/kotlin/com/kiosk/launcher/ui/KioskBrowserActivity.kt',
    name: 'KioskBrowserActivity.kt',
    group: 'UI & Layouts',
    summary: 'Locked kiosk WebView enforcing strict domain allowlist and blocking adult/social hosts.',
    content: kioskBrowserActivityKt,
  },
  {
    id: 'layout-kiosk-browser',
    path: 'app/src/main/res/layout/activity_kiosk_browser.xml',
    name: 'activity_kiosk_browser.xml',
    group: 'UI & Layouts',
    summary: 'Domain-locked WebView browser layout with Back/Reload controls and Admin exit.',
    content: layoutKioskBrowserXml,
  },
  {
    id: 'layout-launcher',
    path: 'app/src/main/res/layout/activity_kiosk_launcher.xml',
    name: 'activity_kiosk_launcher.xml',
    group: 'UI & Layouts',
    summary: 'Kiosk Home RecyclerView and Admin PIN entry button layout.',
    content: layoutLauncherXml,
  },
  {
    id: 'layout-admin',
    path: 'app/src/main/res/layout/activity_admin_settings.xml',
    name: 'activity_admin_settings.xml',
    group: 'UI & Layouts',
    summary: 'Admin Settings screen with unlock toggle, PIN change form, and allowlist RecyclerView.',
    content: layoutAdminXml,
  },
  {
    id: 'layout-item-app',
    path: 'app/src/main/res/layout/item_kiosk_app.xml',
    name: 'item_kiosk_app.xml',
    group: 'UI & Layouts',
    summary: 'Kiosk home tile layout.',
    content: layoutItemAppXml,
  },
  {
    id: 'layout-item-admin',
    path: 'app/src/main/res/layout/item_admin_app_toggle.xml',
    name: 'item_admin_app_toggle.xml',
    group: 'UI & Layouts',
    summary: 'Admin app allowlist toggle + direct LockTask launch button.',
    content: layoutItemAdminXml,
  },
  {
    id: 'layout-dialog-pin',
    path: 'app/src/main/res/layout/dialog_pin_entry.xml',
    name: 'dialog_pin_entry.xml',
    group: 'UI & Layouts',
    summary: 'Numeric password field layout for Admin PIN verification.',
    content: layoutDialogPinXml,
  },
  {
    id: 'strings-xml',
    path: 'app/src/main/res/values/strings.xml',
    name: 'strings.xml',
    group: 'UI & Layouts',
    summary: 'Localized UI copy and policy warning strings.',
    content: stringsXml,
  },
  {
    id: 'colors-xml',
    path: 'app/src/main/res/values/colors.xml',
    name: 'colors.xml',
    group: 'UI & Layouts',
    summary: 'Kiosk color palette tokens (Light).',
    content: colorsXml,
  },
  {
    id: 'colors-night-xml',
    path: 'app/src/main/res/values-night/colors.xml',
    name: 'values-night/colors.xml',
    group: 'UI & Layouts',
    summary: 'Kiosk color palette tokens (Dark DayNight).',
    content: colorsNightXml,
  },
  {
    id: 'themes-xml',
    path: 'app/src/main/res/values/themes.xml',
    name: 'themes.xml',
    group: 'UI & Layouts',
    summary: 'Material 3 DayNight/Light NoActionBar theme for kiosk display.',
    content: themesXml,
  },
  {
    id: 'ic-launcher-bg',
    path: 'app/src/main/res/drawable/ic_launcher_background.xml',
    name: 'ic_launcher_background.xml',
    group: 'UI & Layouts',
    summary: 'Vector slate background layer for Android Adaptive Launcher Icon.',
    content: icLauncherBgXml,
  },
  {
    id: 'ic-launcher-fg',
    path: 'app/src/main/res/drawable/ic_launcher_foreground.xml',
    name: 'ic_launcher_foreground.xml',
    group: 'UI & Layouts',
    summary: 'Vector shield and padlock foreground emblem for KioskOS Launcher icon.',
    content: icLauncherFgXml,
  },
  {
    id: 'ic-launcher',
    path: 'app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
    name: 'ic_launcher.xml',
    group: 'UI & Layouts',
    summary: 'Adaptive Icon descriptor combining background and foreground vectors.',
    content: icLauncherXml,
  },
  {
    id: 'ic-launcher-round',
    path: 'app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml',
    name: 'ic_launcher_round.xml',
    group: 'UI & Layouts',
    summary: 'Round Adaptive Icon descriptor for Android launcher grids.',
    content: icLauncherRoundXml,
  },
  {
    id: 'app-build-gradle',
    path: 'app/build.gradle.kts',
    name: 'app/build.gradle.kts',
    group: 'Gradle & Tests',
    summary: 'App Gradle configuration targeting SDK 35, minSdk 26, ViewBinding, and Material 3.',
    content: appBuildGradle,
  },
  {
    id: 'root-build-gradle',
    path: 'build.gradle.kts',
    name: 'build.gradle.kts',
    group: 'Gradle & Tests',
    summary: 'Root Gradle plugin declarations.',
    content: rootBuildGradle,
  },
  {
    id: 'settings-gradle',
    path: 'settings.gradle.kts',
    name: 'settings.gradle.kts',
    group: 'Gradle & Tests',
    summary: 'Gradle project repositories and :app module include.',
    content: settingsGradle,
  },
  {
    id: 'gradle-properties',
    path: 'gradle.properties',
    name: 'gradle.properties',
    group: 'Gradle & Tests',
    summary: 'AndroidX and Kotlin official code style properties.',
    content: gradleProperties,
  },
  {
    id: 'proguard-rules',
    path: 'app/proguard-rules.pro',
    name: 'proguard-rules.pro',
    group: 'Gradle & Tests',
    summary: 'Keep rules for Manifest-declared DeviceAdminReceiver, BootCompletedReceiver, and Guard Service.',
    content: proguardRules,
  },
  {
    id: 'unit-test',
    path: 'app/src/test/kotlin/com/kiosk/launcher/KioskPolicyTest.kt',
    name: 'KioskPolicyTest.kt',
    group: 'Gradle & Tests',
    summary: 'JUnit 4 tests for PIN validation and salted SHA-256 hashing.',
    content: kioskPolicyTestKt,
  },
  {
    id: 'gh-apk-workflow',
    path: '.github/workflows/build-apk.yml',
    name: 'build-apk.yml',
    group: 'Gradle & Tests',
    summary: 'GitHub Actions workflow that compiles app-debug.apk & app-release-unsigned.apk in the cloud.',
    content: githubApkWorkflow,
  },
  {
    id: 'gradle-wrapper-props',
    path: 'gradle/wrapper/gradle-wrapper.properties',
    name: 'gradle-wrapper.properties',
    group: 'Gradle & Tests',
    summary: 'Gradle 8.9 wrapper distribution metadata for reproducible APK builds.',
    content: gradleWrapperProps,
  },
  {
    id: 'build-apk-sh',
    path: 'build-apk.sh',
    name: 'build-apk.sh',
    group: 'Gradle & Tests',
    summary: 'One-command local shell script to compile app-debug.apk.',
    content: buildApkScript,
  },
];
