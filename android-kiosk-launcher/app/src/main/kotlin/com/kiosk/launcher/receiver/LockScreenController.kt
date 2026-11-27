package com.kiosk.launcher.receiver

import android.content.Context
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.ui.KioskLockScreenActivity

/**
 * Guarantees custom lock screen delivery from the launcher's own foreground lifecycle.
 *
 * A wake or screen-off event sets `lockScreenPending`; when [com.kiosk.launcher.ui.KioskLauncherActivity]
 * becomes visible/focused, [onKioskVisible] presents [KioskLockScreenActivity] from the foreground
 * so Android 10+ background activity start restrictions can never silently drop it.
 */
object LockScreenController {

    /** The screen went off: the kiosk owes a lock screen the next time it is seen. */
    fun onScreenOff(context: Context) {
        val prefs = KioskPreferences(context)
        if (prefs.customLockScreenEnabled) {
            prefs.lockScreenPending = true
        }
    }

    /**
     * Called by [com.kiosk.launcher.ui.KioskLauncherActivity] from `onResume` and `onWindowFocusChanged`.
     * Runs while the launcher is in the foreground so no background-activity-start restriction applies.
     */
    fun onKioskVisible(context: Context) {
        val prefs = KioskPreferences(context)
        if (!prefs.customLockScreenEnabled || !prefs.lockScreenPending) return
        if (prefs.isAdminTemporarilyUnlocked() || prefs.isInstallingUpdate()) return
        if (!prefs.isKioskActiveNow() || !DevicePolicyHelper(context).isDefaultLauncher) return
        if (KioskLockScreenActivity.isShowing) return
        KioskLockScreenActivity.launch(context)
    }
}
