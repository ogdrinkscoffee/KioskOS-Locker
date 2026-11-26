package com.kiosk.launcher.admin

import android.os.UserManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Ensures kiosk tamper protections do not auto-disable baseline system features
 * (calling, SMS, Google account sign-in, Wi-Fi/mobile networks, or unlocked app control).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class KioskRestrictionsTest {

    private fun defaultConfig(
        disallowAppsControl: Boolean = false,
        dateTimeLocked: Boolean = false,
        usbLocked: Boolean = false,
        statusBarLocked: Boolean = false,
        screenCaptureDisabled: Boolean = false,
        temporaryAdminUnlockActive: Boolean = false,
        customLockScreenEnabled: Boolean = false
    ) = KioskRestrictions.Config(
        disallowSafeBoot = true,
        disallowFactoryReset = true,
        disallowAddUser = true,
        disallowAppsControl = disallowAppsControl,
        dateTimeLocked = dateTimeLocked,
        usbLocked = usbLocked,
        statusBarLocked = statusBarLocked,
        keyguardDisabled = false,
        cameraDisabled = false,
        screenCaptureDisabled = screenCaptureDisabled,
        blockUnsupportedBrowsers = true,
        stayAwake = false,
        temporaryAdminUnlockActive = temporaryAdminUnlockActive,
        customLockScreenEnabled = customLockScreenEnabled
    )

    @Test
    fun baselineTelephonyAccountsNetworkingAndAppInstallsStayUnlocked() {
        val state = KioskRestrictions.computeEnforced(defaultConfig())

        assertEquals(false, state.userRestrictions[UserManager.DISALLOW_OUTGOING_CALLS])
        assertEquals(false, state.userRestrictions[UserManager.DISALLOW_SMS])
        assertEquals(false, state.userRestrictions[UserManager.DISALLOW_MODIFY_ACCOUNTS])
        assertEquals(false, state.userRestrictions[UserManager.DISALLOW_INSTALL_APPS])
        assertEquals(false, state.userRestrictions[UserManager.DISALLOW_UNINSTALL_APPS])
        assertEquals(false, state.userRestrictions[UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES])
        assertEquals(false, state.userRestrictions[UserManager.DISALLOW_CONFIG_WIFI])
        assertEquals(false, state.userRestrictions[UserManager.DISALLOW_CONFIG_MOBILE_NETWORKS])
        assertEquals(false, state.userRestrictions[UserManager.DISALLOW_APPS_CONTROL])
        assertFalse(state.blockPackageUninstalls)
        assertFalse(state.statusBarDisabled)
        assertFalse(state.screenCaptureDisabled)

        // Core kiosk tamper guards stay active.
        assertEquals(true, state.userRestrictions[UserManager.DISALLOW_SAFE_BOOT])
        assertEquals(true, state.userRestrictions[UserManager.DISALLOW_FACTORY_RESET])
        assertEquals(true, state.userRestrictions[UserManager.DISALLOW_ADD_USER])
        assertTrue(state.suspendUnsupportedBrowsers)
    }

    @Test
    fun customLockScreenDisablesSystemKeyguardUnlessTemporarilyUnlocked() {
        val lockedState = KioskRestrictions.computeEnforced(
            defaultConfig(customLockScreenEnabled = true, temporaryAdminUnlockActive = false)
        )
        assertTrue(lockedState.keyguardDisabled)

        val unlockedState = KioskRestrictions.computeEnforced(
            defaultConfig(customLockScreenEnabled = true, temporaryAdminUnlockActive = true)
        )
        assertFalse(unlockedState.keyguardDisabled)
    }

    @Test
    fun temporaryAdminUnlockRelaxesLockableRestrictionsAndHardwareLocks() {
        val state = KioskRestrictions.computeEnforced(
            defaultConfig(
                disallowAppsControl = true,
                dateTimeLocked = true,
                usbLocked = true,
                statusBarLocked = true,
                screenCaptureDisabled = true,
                temporaryAdminUnlockActive = true
            )
        )

        assertEquals(false, state.userRestrictions[UserManager.DISALLOW_APPS_CONTROL])
        assertEquals(false, state.userRestrictions[UserManager.DISALLOW_CONFIG_DATE_TIME])
        assertEquals(false, state.userRestrictions[UserManager.DISALLOW_USB_FILE_TRANSFER])
        assertEquals(false, state.userRestrictions[UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA])
        assertFalse(state.statusBarDisabled)
        assertFalse(state.screenCaptureDisabled)
        assertFalse(state.suspendUnsupportedBrowsers)
        assertFalse(state.blockPackageUninstalls)
    }

    @Test
    fun allClearedRestrictionKeysIncludesBothManagedAndBaselineTelephonyKeys() {
        val keys = KioskRestrictions.allClearedRestrictionKeys().toSet()

        assertTrue(UserManager.DISALLOW_OUTGOING_CALLS in keys)
        assertTrue(UserManager.DISALLOW_MODIFY_ACCOUNTS in keys)
        assertTrue(UserManager.DISALLOW_INSTALL_APPS in keys)
        assertTrue(UserManager.DISALLOW_UNINSTALL_APPS in keys)
        assertTrue(UserManager.DISALLOW_APPS_CONTROL in keys)
        assertTrue(UserManager.DISALLOW_SAFE_BOOT in keys)
    }
}
