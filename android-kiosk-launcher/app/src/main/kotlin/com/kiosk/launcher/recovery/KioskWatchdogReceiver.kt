package com.kiosk.launcher.recovery

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.ui.KioskLauncherActivity

/**
 * The liveness check itself: re-applies policy and brings the kiosk back when the launcher died
 * on screen.
 *
 * Declared in the manifest, so a dead process is recreated to run it. It starts an activity,
 * which is the one deliberate exception to the rule that receivers never do that: a kiosk with
 * no adb has no other way back to a usable screen. A device owner is exempt from the background
 * start restriction; if Android drops the start anyway, the next tick retries and Home still
 * works.
 */
class KioskWatchdogReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val prefs = KioskPreferences(context)
        val policy = DevicePolicyHelper(context)

        val action = RecoveryPolicy.decide(
            kioskEnabled = prefs.kioskEnabled,
            isDefaultLauncher = policy.isDefaultLauncher,
            kioskUiVisible = prefs.kioskUiVisible,
            lastHeartbeatMs = prefs.launcherHeartbeatMs,
            nowMs = System.currentTimeMillis(),
            adminWindowOpen = prefs.isAdminTemporarilyUnlocked(),
            installingUpdate = prefs.isInstallingUpdate()
        )
        if (action != RecoveryPolicy.Action.RESTORE) return

        prefs.logPolicy("Watchdog restored the kiosk after the launcher stopped")
        runCatching { policy.applyPolicy() }
        runCatching {
            context.startActivity(
                Intent(context, KioskLauncherActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            )
        }
    }
}
