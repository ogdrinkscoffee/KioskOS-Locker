package com.kiosk.launcher.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.ui.KioskLauncherActivity

class BootCompletedReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) {
            return
        }

        val prefs = KioskPreferences(context)
        if (action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            runCatching { prefs.finishUpdateInstall() }
        }

        // Preferences live in credential-encrypted storage, which is unavailable during
        // direct boot. BOOT_COMPLETED fires after the first unlock; the guard covers
        // devices that still deliver it early.
        val policy = DevicePolicyHelper(context)
        runCatching { policy.applyPolicy() }

        // Bring the kiosk back to the front after a reboot or update, but only when the
        // kiosk is enabled and owns Home: an un-opted or turned-off install must not
        // pull itself to the front.
        if (runCatching { prefs.kioskEnabled == true && policy.isDefaultLauncher }.getOrDefault(false)) {
            runCatching {
                context.startActivity(
                    Intent(context, KioskLauncherActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                )
            }
        }
    }
}
