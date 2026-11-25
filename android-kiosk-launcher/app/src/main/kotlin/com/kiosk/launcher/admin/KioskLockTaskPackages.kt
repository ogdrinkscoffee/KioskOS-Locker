package com.kiosk.launcher.admin

/**
 * Computes the packages allowed to launch activities and surface windows while Lock Task Mode
 * is active.
 *
 * Kept pure Kotlin (zero Android framework dependencies) so the allowlist rules can be
 * thoroughly unit-tested on the JVM.
 */
object KioskLockTaskPackages {

    fun compute(
        ownPackage: String,
        panicLocked: Boolean,
        allowAllApps: Boolean,
        allowedPackages: Collection<String>,
        launchablePackages: Collection<String>,
        callingPackages: Collection<String>,
        essentialSystemPackages: Collection<String>,
        installerPackages: Collection<String>,
        storePackages: Collection<String>,
        unsupportedBrowsers: Set<String>,
        disallowAppsControl: Boolean,
        installingUpdate: Boolean,
        adminTemporarilyUnlocked: Boolean,
        blockUnsupportedBrowsers: Boolean,
        sdkInt: Int = 29
    ): Array<String> {
        val packages = LinkedHashSet<String>()
        if (ownPackage.isNotBlank()) packages.add(ownPackage)

        // Calling, in-call UI, and emergency dialers stay reachable even during Panic Lockdown.
        packages.addAll(callingPackages)
        if (panicLocked) {
            return packages.filter { it.isNotBlank() }.toTypedArray()
        }

        if (allowAllApps) {
            packages.addAll(launchablePackages)
        } else {
            packages.addAll(allowedPackages)
        }

        // Core Google services, permission prompts, media/file pickers, WebView, and system
        // dialogs remain accessible while the kiosk is active.
        packages.addAll(essentialSystemPackages)

        // On Android 7-9 (API < 29), runtime permission dialogs live inside packageinstaller.
        val permissionPromptLivesInInstaller = sdkInt in 1 until 29
        if (!disallowAppsControl || installingUpdate || adminTemporarilyUnlocked || permissionPromptLivesInInstaller) {
            packages.addAll(installerPackages)
        }

        if (!disallowAppsControl || adminTemporarilyUnlocked) {
            packages.addAll(storePackages)
        }

        if (blockUnsupportedBrowsers && !adminTemporarilyUnlocked) {
            packages.removeAll(unsupportedBrowsers)
            if (ownPackage.isNotBlank()) packages.add(ownPackage)
            packages.addAll(callingPackages)
        }

        return packages.filter { it.isNotBlank() }.toTypedArray()
    }
}
