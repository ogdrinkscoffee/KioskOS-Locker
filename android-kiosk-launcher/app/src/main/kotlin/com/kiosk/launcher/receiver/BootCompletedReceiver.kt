package com.kiosk.launcher.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.ui.KioskLauncherActivity

class BootCompletedReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        // Preferences live in credential-encrypted storage, which is unavailable during
        // direct boot. BOOT_COMPLETED fires after the first unlock; the guard covers
        // devices that still deliver it early.
        runCatching { DevicePolicyHelper(context).applyPolicy() }

        // Bring the kiosk back to the front after a reboot.
        runCatching {
            context.startActivity(
                Intent(context, KioskLauncherActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            )
        }
    }
}
