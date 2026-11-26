package com.kiosk.launcher.admin

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The rule that keeps lock task mode from being entered in the wrong state: a preview
 * install would get the screen-pinning prompt, the admin unlock window would be
 * cancelled before it could reach system settings, a scheduled window would stay pinned
 * outside its hours, and a device owner that is not the Home app would be trapped in a
 * kiosk nobody asked for.
 */
class LockTaskPolicyTest {

    private fun shouldStart(
        owner: Boolean = true,
        home: Boolean = true,
        unlocked: Boolean = false,
        scheduled: Boolean = true,
        inLockTask: Boolean = false
    ) = LockTaskPolicy.shouldStart(
        isDeviceOwner = owner,
        isDefaultLauncher = home,
        temporaryAdminUnlockActive = unlocked,
        scheduleKioskActive = scheduled,
        inLockTaskMode = inLockTask
    )

    @Test
    fun ownerKioskEntersLockTask() {
        assertTrue(shouldStart())
    }

    @Test
    fun previewInstallNeverEntersLockTask() {
        assertFalse(shouldStart(owner = false))
    }

    @Test
    fun anotherLauncherOwningHomeKeepsLockTaskOff() {
        assertFalse(shouldStart(home = false))
    }

    @Test
    fun adminUnlockWindowKeepsLockTaskOff() {
        assertFalse(shouldStart(unlocked = true))
    }

    @Test
    fun outsideAScheduledWindowNothingIsPinned() {
        assertFalse(shouldStart(scheduled = false))
    }

    @Test
    fun runningLockTaskIsNotStartedTwice() {
        assertFalse(shouldStart(inLockTask = true))
    }

    @Test
    fun anUpdateInstallKeepsLockTaskOff() {
        fun duringUpdate(installing: Boolean) = LockTaskPolicy.shouldStartDuringUpdate(
            isDeviceOwner = true,
            isDefaultLauncher = true,
            temporaryAdminUnlockActive = false,
            scheduleKioskActive = true,
            inLockTaskMode = false,
            installingUpdate = installing
        )
        assertFalse(duringUpdate(installing = true))
        assertTrue(duringUpdate(installing = false))
    }

    @Test
    fun anUpdateInstallOutsideHoursAlsoKeepsLockTaskOff() {
        assertFalse(
            LockTaskPolicy.shouldStartDuringUpdate(
                isDeviceOwner = true,
                isDefaultLauncher = true,
                temporaryAdminUnlockActive = false,
                scheduleKioskActive = false,
                inLockTaskMode = false,
                installingUpdate = false
            )
        )
    }

    @Test
    fun onlyAHomeOwningOwnerKioskInsideItsHoursEnters() {
        for (owner in booleanArrayOf(false, true)) {
            for (home in booleanArrayOf(false, true)) {
                for (unlock in booleanArrayOf(false, true)) {
                    for (scheduled in booleanArrayOf(false, true)) {
                        for (inLockTask in booleanArrayOf(false, true)) {
                            val label =
                                "owner=$owner home=$home unlock=$unlock scheduled=$scheduled " +
                                    "inLockTask=$inLockTask"
                            assertEquals(
                                label,
                                owner && home && !unlock && scheduled && !inLockTask,
                                LockTaskPolicy.shouldStart(
                                    owner,
                                    home,
                                    unlock,
                                    scheduled,
                                    inLockTask
                                )
                            )
                        }
                    }
                }
            }
        }
    }
}
