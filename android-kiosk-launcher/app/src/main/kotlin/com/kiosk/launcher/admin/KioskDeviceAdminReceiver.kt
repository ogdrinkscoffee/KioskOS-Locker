package com.kiosk.launcher.admin

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import com.kiosk.launcher.data.KioskPreferences

class KioskDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        DevicePolicyHelper(context).applyPolicy()
    }

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        super.onProfileProvisioningComplete(context, intent)
        DevicePolicyHelper(context).applyPolicy()
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        val prefs = KioskPreferences(context)
        prefs.kioskEnabled = false
        prefs.finishUpdateInstall()
    }
}
