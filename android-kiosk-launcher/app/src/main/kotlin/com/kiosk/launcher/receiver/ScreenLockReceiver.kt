package com.kiosk.launcher.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.ui.KioskLockScreenActivity

/**
 * Coordinates the custom lock screen across screen-off/wake broadcasts:
 * - On [Intent.ACTION_SCREEN_OFF], records `lockScreenPending` via [LockScreenController.onScreenOff]
 *   so [com.kiosk.launcher.ui.KioskLauncherActivity] guarantees a foreground lock on next resume even
 *   if Android 10+ suppresses background receiver activity starts.
 * - On [Intent.ACTION_SCREEN_ON] / [Intent.ACTION_USER_PRESENT], attempts an immediate wake launch
 *   when permitted (such as Device Owner mode).
 */
class ScreenLockReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action == Intent.ACTION_SCREEN_OFF) {
            LockScreenController.onScreenOff(context)
            return
        }
        if (action != Intent.ACTION_SCREEN_ON && action != Intent.ACTION_USER_PRESENT) {
            return
        }
        if (!shouldTrigger(context)) return
        if (!KioskLockScreenActivity.isShowing) {
            KioskLockScreenActivity.launch(context)
        }
    }

    companion object {
        fun shouldTrigger(context: Context): Boolean {
            val prefs = KioskPreferences(context)
            val policy = DevicePolicyHelper(context)
            return prefs.customLockScreenEnabled &&
                prefs.isKioskActiveNow() &&
                policy.isDefaultLauncher &&
                !prefs.isInstallingUpdate() &&
                !prefs.isAdminTemporarilyUnlocked()
        }
    }
}
