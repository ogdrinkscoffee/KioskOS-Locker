package com.kiosk.launcher.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.ui.KioskLauncherActivity

/**
 * Direct-Boot-aware BroadcastReceiver that re-enforces all Device Owner restrictions,
 * revokes any temporary Settings/Uninstall unlock, and launches KioskLauncherActivity
 * cleanly after reboot or package upgrade.
 */
class BootCompletedReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            DevicePolicyHelper.enforceKioskPoliciesOnBoot(context)

            val launchIntent = Intent(context, KioskLauncherActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
            }
            try {
                context.startActivity(launchIntent)
            } catch (_: SecurityException) {
                // Background activity start may be blocked if not yet provisioned as Device Owner / HOME
            }
        }
    }
}
