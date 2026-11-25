package com.kiosk.launcher.admin

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Verifies that Lock Task allowlisting never locks out calling/emergency UI, core Google
 * services, permission dialogs, or installers/Play Store when app control is unlocked.
 */
class KioskLockTaskPackagesTest {

    private val own = "com.kiosk.launcher"
    private val calling = listOf("com.android.server.telecom", "com.oplus.dialer")
    private val essential = listOf(
        "com.google.android.gms",
        "com.google.android.permissioncontroller",
        "com.android.documentsui"
    )
    private val installers = listOf("com.google.android.packageinstaller")
    private val stores = listOf("com.android.vending")
    private val browsers = setOf("org.mozilla.firefox", "com.brave.browser")

    @Test
    fun kioskPreservesCallingGoogleServicesAndUnlockedInstallers() {
        val result = KioskLockTaskPackages.compute(
            ownPackage = own,
            panicLocked = false,
            allowAllApps = false,
            allowedPackages = listOf("com.example.study"),
            launchablePackages = listOf("com.example.study", "com.example.game"),
            callingPackages = calling,
            essentialSystemPackages = essential,
            installerPackages = installers,
            storePackages = stores,
            unsupportedBrowsers = browsers,
            disallowAppsControl = false,
            installingUpdate = false,
            adminTemporarilyUnlocked = false,
            blockUnsupportedBrowsers = true,
            sdkInt = 35
        ).toSet()

        assertTrue(own in result)
        assertTrue("com.example.study" in result)
        assertFalse("com.example.game" in result)
        assertTrue(calling.all { it in result })
        assertTrue(essential.all { it in result })
        assertTrue(installers.all { it in result })
        assertTrue("com.android.vending" in result)
    }

    @Test
    fun disallowAppsControlBlocksStoreAndInstallersExceptDuringUpdateOrPreQ() {
        val qPlus = KioskLockTaskPackages.compute(
            ownPackage = own,
            panicLocked = false,
            allowAllApps = false,
            allowedPackages = emptyList(),
            launchablePackages = emptyList(),
            callingPackages = calling,
            essentialSystemPackages = essential,
            installerPackages = installers,
            storePackages = stores,
            unsupportedBrowsers = browsers,
            disallowAppsControl = true,
            installingUpdate = false,
            adminTemporarilyUnlocked = false,
            blockUnsupportedBrowsers = true,
            sdkInt = 34
        ).toSet()

        assertFalse("com.google.android.packageinstaller" in qPlus)
        assertFalse("com.android.vending" in qPlus)
        assertTrue("com.google.android.gms" in qPlus)
        assertTrue("com.oplus.dialer" in qPlus)

        val updating = KioskLockTaskPackages.compute(
            ownPackage = own,
            panicLocked = false,
            allowAllApps = false,
            allowedPackages = emptyList(),
            launchablePackages = emptyList(),
            callingPackages = calling,
            essentialSystemPackages = essential,
            installerPackages = installers,
            storePackages = stores,
            unsupportedBrowsers = browsers,
            disallowAppsControl = true,
            installingUpdate = true,
            adminTemporarilyUnlocked = false,
            blockUnsupportedBrowsers = true,
            sdkInt = 34
        ).toSet()

        assertTrue("com.google.android.packageinstaller" in updating)
        assertFalse("com.android.vending" in updating)

        val preQ = KioskLockTaskPackages.compute(
            ownPackage = own,
            panicLocked = false,
            allowAllApps = false,
            allowedPackages = emptyList(),
            launchablePackages = emptyList(),
            callingPackages = calling,
            essentialSystemPackages = essential,
            installerPackages = installers,
            storePackages = stores,
            unsupportedBrowsers = browsers,
            disallowAppsControl = true,
            installingUpdate = false,
            adminTemporarilyUnlocked = false,
            blockUnsupportedBrowsers = true,
            sdkInt = 28
        ).toSet()

        // Android 7-9 hosts runtime permission prompts inside packageinstaller.
        assertTrue("com.google.android.packageinstaller" in preQ)
    }

    @Test
    fun allowAllAppsFiltersUnsupportedBrowsersUnlessAdminUnlocked() {
        val locked = KioskLockTaskPackages.compute(
            ownPackage = own,
            panicLocked = false,
            allowAllApps = true,
            allowedPackages = emptyList(),
            launchablePackages = listOf("com.example.notes", "org.mozilla.firefox"),
            callingPackages = calling,
            essentialSystemPackages = essential,
            installerPackages = installers,
            storePackages = stores,
            unsupportedBrowsers = browsers,
            disallowAppsControl = false,
            installingUpdate = false,
            adminTemporarilyUnlocked = false,
            blockUnsupportedBrowsers = true,
            sdkInt = 35
        ).toSet()

        assertTrue("com.example.notes" in locked)
        assertFalse("org.mozilla.firefox" in locked)

        val unlocked = KioskLockTaskPackages.compute(
            ownPackage = own,
            panicLocked = false,
            allowAllApps = true,
            allowedPackages = emptyList(),
            launchablePackages = listOf("com.example.notes", "org.mozilla.firefox"),
            callingPackages = calling,
            essentialSystemPackages = essential,
            installerPackages = installers,
            storePackages = stores,
            unsupportedBrowsers = browsers,
            disallowAppsControl = true,
            installingUpdate = false,
            adminTemporarilyUnlocked = true,
            blockUnsupportedBrowsers = true,
            sdkInt = 35
        ).toSet()

        assertTrue("org.mozilla.firefox" in unlocked)
        assertTrue("com.android.vending" in unlocked)
        assertTrue("com.google.android.packageinstaller" in unlocked)
    }

    @Test
    fun panicLockKeepsOnlyKioskAndCallingPackages() {
        val panic = KioskLockTaskPackages.compute(
            ownPackage = own,
            panicLocked = true,
            allowAllApps = true,
            allowedPackages = listOf("com.example.study"),
            launchablePackages = listOf("com.example.study", "com.example.game"),
            callingPackages = calling,
            essentialSystemPackages = essential,
            installerPackages = installers,
            storePackages = stores,
            unsupportedBrowsers = browsers,
            disallowAppsControl = false,
            installingUpdate = false,
            adminTemporarilyUnlocked = false,
            blockUnsupportedBrowsers = true,
            sdkInt = 35
        ).toSet()

        assertTrue(own in panic)
        assertTrue(calling.all { it in panic })
        assertFalse("com.example.study" in panic)
        assertFalse("com.android.vending" in panic)
    }
}
