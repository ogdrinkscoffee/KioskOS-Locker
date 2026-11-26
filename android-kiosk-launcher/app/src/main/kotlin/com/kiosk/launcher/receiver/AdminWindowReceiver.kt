package com.kiosk.launcher.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.kiosk.launcher.admin.AdminWindowExpiry
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences

/**
 * Closes the temporary admin window when its alarm fires.
 *
 * This runs from the manifest, so it also runs when the launcher process is gone — the admin
 * is usually in system Settings by then. It only re-applies policy; it never starts an
 * activity, so it does not depend on a background-activity start Android may drop. Lock task
 * is re-entered by the launcher when the admin presses Home, which now always reaches it.
 */
class AdminWindowReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val prefs = KioskPreferences(context)
        if (prefs.adminUnlockedUntilMs == 0L) return
        if (prefs.isAdminTemporarilyUnlocked()) {
            // The clock moved back, or the window was re-granted: wait for the real deadline.
            AdminWindowExpiry.sync(context, prefs)
            return
        }
        prefs.endTemporaryAdminWindow()
        runCatching { DevicePolicyHelper(context).applyPolicy() }
    }
}
