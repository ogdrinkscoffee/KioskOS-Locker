package com.kiosk.launcher.admin

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The rule that keeps lock task mode from being entered in the wrong state: a preview
 * install would get the screen-pinning prompt, and the admin unlock window would be
 * cancelled before it could reach system settings.
 */
class LockTaskPolicyTest {

    @Test
    fun ownerEntersLockTask() {
        assertTrue(
            LockTaskPolicy.shouldStart(
                isDeviceOwner = true,
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
                temporaryAdminUnlockActive = false,
                inLockTaskMode = true
            )
        )
    }

    @Test
    fun onlyALockedOwnerKioskEnters() {
        for (owner in booleanArrayOf(false, true)) {
            for (unlock in booleanArrayOf(false, true)) {
                for (inLockTask in booleanArrayOf(false, true)) {
                    assertEquals(
                        "owner=$owner unlock=$unlock inLockTask=$inLockTask",
                        owner && !unlock && !inLockTask,
                        LockTaskPolicy.shouldStart(owner, unlock, inLockTask)
                    )
                }
            }
        }
    }
}
