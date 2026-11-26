package com.kiosk.launcher.receiver

import android.content.Context
import android.content.Intent
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.ui.LockScreenActivity

/**
 * The custom lock screen has exactly one trigger: the kiosk activity asking on its own
 * resume. A wake broadcast only records that a lock is owed, because starting an activity
 * from a receiver is a background activity start, which Android 10+ may drop silently.
 * Working around that (the device-owner exemption, full-screen intents, notification
 * grants) bought nothing the kiosk's own lifecycle does not already provide for free.
 *
 * The lock screen only ever appears for a device actually running as the kiosk (kiosk state on,
 * inside a scheduled window, and Home owned by this app), so an ordinary install with the toggle
 * on cannot pop a lock screen over someone else's home screen, and a device that is a normal phone
 * for the night does not lock like a kiosk. The admin's temporary system-access window is never
 * covered either.
 */
object LockScreenController {

    /** The screen went off: the kiosk owes a lock screen the next time it is seen. */
    fun onScreenOff(context: Context) {
        val prefs = KioskPreferences(context)
        if (prefs.customLockScreen) prefs.lockScreenPending = true
    }

    /**
     * Called by [com.kiosk.launcher.ui.KioskLauncherActivity] from `onResume` and when it
     * regains window focus. The caller is on screen, so this is a foreground start and no
     * background-activity-start rule applies. The flag is durable, so a wake whose SCREEN_OFF
     * was never delivered (boot, an update) still locks on the first resume.
     */
    fun onKioskVisible(context: Context) {
        val prefs = KioskPreferences(context)
        if (!prefs.customLockScreen || !prefs.lockScreenPending) return
        if (prefs.isAdminTemporarilyUnlocked()) return
        if (!prefs.isKioskActiveNow() || !DevicePolicyHelper(context).isDefaultLauncher) return
        // A lock screen that fails to open must not take the kiosk down with it: the flag
        // stays set and the next resume tries again.
        runCatching {
            context.startActivity(
                Intent(context, LockScreenActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }
}
