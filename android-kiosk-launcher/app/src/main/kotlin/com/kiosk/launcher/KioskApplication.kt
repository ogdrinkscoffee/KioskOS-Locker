package com.kiosk.launcher

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences

class KioskApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(
                NotificationChannel(CHANNEL, "Kiosk status", NotificationManager.IMPORTANCE_LOW)
            )
        }
        // Resolve the explicit kiosk state before touching Home. Older builds pinned every
        // device owner and kept no record of consent, so the migration reads Home ownership
        // once: a device already running as Home stays a kiosk until an admin turns it off,
        // while one that never owned Home is released. Home is only touched to drop a pin the
        // state no longer wants; re-pinning here would silently undo an admin who made another
        // launcher Home, which is exactly what the "waiting for Home" state reports.
        val prefs = KioskPreferences(this)
        val policy = DevicePolicyHelper(this)
        if (!prefs.migrateKioskState(homeIsKiosk = policy.isDefaultLauncher).enabled) {
            policy.clearHomeLauncher()
        }
        // Re-apply policy on every cold start; a no-op unless this app is the device owner,
        // and a release pass whenever the kiosk is off or another launcher owns Home.
        policy.applyPolicy()
    }

    companion object {
        const val CHANNEL = "kiosk_status"
    }
}
