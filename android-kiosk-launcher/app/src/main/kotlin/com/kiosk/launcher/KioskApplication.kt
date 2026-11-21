package com.kiosk.launcher

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.kiosk.launcher.admin.DevicePolicyHelper

class KioskApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(
                NotificationChannel(CHANNEL, "Kiosk status", NotificationManager.IMPORTANCE_LOW)
            )
        }
        // Re-apply policy on every cold start; a no-op unless this app is the device owner.
        DevicePolicyHelper(this).applyPolicy()
    }

    companion object {
        const val CHANNEL = "kiosk_status"
    }
}
