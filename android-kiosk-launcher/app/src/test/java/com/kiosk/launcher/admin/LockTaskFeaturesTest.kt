package com.kiosk.launcher.admin

import android.app.admin.DevicePolicyManager
import android.os.Build
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Guards the regression that made the kiosk feel broken: a hardcoded
 * LOCK_TASK_FEATURE_NONE overrode the Admin toggles, killing Home, the status bar and
 * the keyguard no matter what was switched on.
 *
 * Runs under Robolectric because `Build.VERSION.SDK_INT` is inlined as 0 in a plain JVM
 * test, which would silently disable every branch here.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class LockTaskFeaturesTest {

    private val home = DevicePolicyManager.LOCK_TASK_FEATURE_HOME
    private val overview = DevicePolicyManager.LOCK_TASK_FEATURE_OVERVIEW
    private val systemInfo = DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO
    private val notifications = DevicePolicyManager.LOCK_TASK_FEATURE_NOTIFICATIONS
    private val keyguard = DevicePolicyManager.LOCK_TASK_FEATURE_KEYGUARD
    private val blockStart = DevicePolicyManager.LOCK_TASK_FEATURE_BLOCK_ACTIVITY_START_IN_TASK

    @Test
    fun homeAndOverviewStayAvailableWhateverTheTogglesSay() {
        for (statusBar in booleanArrayOf(false, true)) {
            for (keyguardOff in booleanArrayOf(false, true)) {
                val flags = LockTaskFeatures.compute(statusBar, keyguardOff, true)
                assertTrue(
                    "Home must stay usable (statusBar=$statusBar keyguardOff=$keyguardOff)",
                    flags and home != 0
                )
                assertTrue(
                    "Overview must stay usable alongside Home (statusBar=$statusBar keyguardOff=$keyguardOff)",
                    flags and overview != 0
                )
            }
        }
    }

    @Test
    fun unlockingTheStatusBarRestoresTheShade() {
        val locked = LockTaskFeatures.compute(statusBarLocked = true, keyguardDisabled = false, blockActivityStartInTask = true)
        assertEquals(0, locked and systemInfo)
        assertEquals(0, locked and notifications)

        val unlocked = LockTaskFeatures.compute(statusBarLocked = false, keyguardDisabled = false, blockActivityStartInTask = true)
        assertTrue(unlocked and systemInfo != 0)
        assertTrue(unlocked and notifications != 0)
    }

    @Test
    fun keepingTheLockScreenEnablesItsLockTaskFlag() {
        val kept = LockTaskFeatures.compute(statusBarLocked = true, keyguardDisabled = false, blockActivityStartInTask = true)
        assertTrue(kept and keyguard != 0)

        val disabled = LockTaskFeatures.compute(statusBarLocked = true, keyguardDisabled = true, blockActivityStartInTask = true)
        assertEquals(0, disabled and keyguard)
    }

    @Test
    fun blockedActivityStartsAreRequestedExplicitlyOnAndroid11Plus() {
        assertTrue(
            LockTaskFeatures.compute(true, true, blockActivityStartInTask = true, sdkInt = Build.VERSION_CODES.R) and blockStart != 0
        )
        assertEquals(
            0,
            LockTaskFeatures.compute(true, true, blockActivityStartInTask = true, sdkInt = Build.VERSION_CODES.Q) and blockStart
        )
        assertEquals(
            0,
            LockTaskFeatures.compute(true, true, blockActivityStartInTask = false, sdkInt = Build.VERSION_CODES.R) and blockStart
        )
    }

    @Test
    fun nothingIsConfiguredBeforeLockTaskFeaturesExist() {
        assertEquals(
            0,
            LockTaskFeatures.compute(
                statusBarLocked = false,
                keyguardDisabled = false,
                blockActivityStartInTask = true,
                sdkInt = Build.VERSION_CODES.O
            )
        )
    }
}
