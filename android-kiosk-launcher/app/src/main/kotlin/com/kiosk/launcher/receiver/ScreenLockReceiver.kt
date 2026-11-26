package com.kiosk.launcher.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.ui.KioskLockScreenActivity

/**
 * Triggers the custom glassmorphism lock screen on screen off/on or user-present wake
 * events whenever the admin enabled custom lock screen replacement in kiosk mode.
 */
class ScreenLockReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_SCREEN_OFF &&
            action != Intent.ACTION_SCREEN_ON &&
            action != Intent.ACTION_USER_PRESENT
        ) {
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
                prefs.kioskEnabled == true &&
                policy.isDefaultLauncher &&
                !prefs.isInstallingUpdate() &&
                !prefs.isAdminTemporarilyUnlocked()
        }
    }
}
