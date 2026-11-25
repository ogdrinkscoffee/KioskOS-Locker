package com.kiosk.launcher.admin

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The rule that keeps lock task mode from being entered in the wrong state: a preview
 * install would get the screen-pinning prompt, the admin unlock window would be
 * cancelled before it could reach system settings, and a device owner that is not the
 * Home app would be trapped in a kiosk nobody asked for.
 */
class LockTaskPolicyTest {

    @Test
    fun ownerKioskEntersLockTask() {
        assertTrue(
            LockTaskPolicy.shouldStart(
                isDeviceOwner = true,
                isDefaultLauncher = true,
                temporaryAdminUnlockActive = false,
                inLockTaskMode = false
            )
        )
    }

    @Test
    fun previewInstallNeverEntersLockTask() {
        assertFalse(
            LockTaskPolicy.shouldStart(
                isDeviceOwner = false,
                isDefaultLauncher = true,
                temporaryAdminUnlockActive = false,
                inLockTaskMode = false
            )
        )
    }

    @Test
    fun anotherLauncherOwningHomeKeepsLockTaskOff() {
        assertFalse(
            LockTaskPolicy.shouldStart(
                isDeviceOwner = true,
                isDefaultLauncher = false,
                temporaryAdminUnlockActive = false,
                inLockTaskMode = false
            )
        )
    }

    @Test
    fun adminUnlockWindowKeepsLockTaskOff() {
        assertFalse(
            LockTaskPolicy.shouldStart(
                isDeviceOwner = true,
                isDefaultLauncher = true,
                temporaryAdminUnlockActive = true,
                inLockTaskMode = false
            )
        )
    }

    @Test
    fun runningLockTaskIsNotStartedTwice() {
        assertFalse(
            LockTaskPolicy.shouldStart(
                isDeviceOwner = true,
                isDefaultLauncher = true,
                temporaryAdminUnlockActive = false,
                inLockTaskMode = true
            )
        )
    }

    @Test
    fun anUpdateInstallKeepsLockTaskOff() {
        assertFalse(
            LockTaskPolicy.shouldStartDuringUpdate(
                isDeviceOwner = true,
                isDefaultLauncher = true,
                temporaryAdminUnlockActive = false,
                inLockTaskMode = false,
                installingUpdate = true
            )
        )
        assertTrue(
            LockTaskPolicy.shouldStartDuringUpdate(
                isDeviceOwner = true,
                isDefaultLauncher = true,
                temporaryAdminUnlockActive = false,
                inLockTaskMode = false,
                installingUpdate = false
            )
        )
    }

    @Test
    fun onlyAHomeOwningOwnerKioskEnters() {
        for (owner in booleanArrayOf(false, true)) {
            for (home in booleanArrayOf(false, true)) {
                for (unlock in booleanArrayOf(false, true)) {
                    for (inLockTask in booleanArrayOf(false, true)) {
                        assertEquals(
                            "owner=$owner home=$home unlock=$unlock inLockTask=$inLockTask",
                            owner && home && !unlock && !inLockTask,
                            LockTaskPolicy.shouldStart(owner, home, unlock, inLockTask)
                        )
                    }
                }
            }
        }
    }
}
