package com.kiosk.launcher.admin

import android.app.admin.DevicePolicyManager
import android.os.Build

/**
 * Maps the Admin toggles onto the system features lock task mode is allowed to keep.
 *
 * This used to be a hardcoded `LOCK_TASK_FEATURE_NONE`, which Android documents as
 * disabling the system info area, the notification shade, the Home button, Recents, the
 * power menu *and* the keyguard. That single flag overrode the toggles, so Home was dead,
 * the status bar stayed hidden after being switched off, and the lock screen could never
 * appear while the kiosk was pinned.
 *
 * Home is always enabled: inside lock task it only returns to the default launcher, which
 * is this app, so it is an exit from an app back to the grid — not an escape hatch.
 * Kept free of Android calls (only inlined int constants) so the mapping is unit-testable.
 */
object LockTaskFeatures {

    fun compute(
        statusBarLocked: Boolean,
        keyguardDisabled: Boolean,
        blockActivityStartInTask: Boolean,
        sdkInt: Int = Build.VERSION.SDK_INT
    ): Int {
        // setLockTaskFeatures() only exists from Android 9 (P); returning NONE there is
        // the platform default even without this call.
        if (sdkInt < Build.VERSION_CODES.P) return 0

        var flags = DevicePolicyManager.LOCK_TASK_FEATURE_HOME

        if (!statusBarLocked) {
            flags = flags or
                DevicePolicyManager.LOCK_TASK_FEATURE_SYSTEM_INFO or
                DevicePolicyManager.LOCK_TASK_FEATURE_NOTIFICATIONS
        }

        // Without this flag Android hides the keyguard during lock task, even when the
        // device has a lock mode the admin asked to keep.
        if (!keyguardDisabled) {
            flags = flags or DevicePolicyManager.LOCK_TASK_FEATURE_KEYGUARD
        }

        if (blockActivityStartInTask) {
            flags = flags or DevicePolicyManager.LOCK_TASK_FEATURE_BLOCK_ACTIVITY_START_IN_TASK
        }

        return flags
    }
}
