package com.kiosk.launcher

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import androidx.core.content.ContextCompat
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
        val currentVersionCode = runCatching {
            val info = packageManager.getPackageInfo(packageName, 0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                info.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                info.versionCode
            }
        }.getOrDefault(0)
        if (currentVersionCode > 0 && prefs.lastAppliedVersionCode != currentVersionCode) {
            prefs.finishUpdateInstall()
            // Re-run the uninstall-block release sweep once on every upgrade so any leftover
            // locks from earlier builds or updates are cleaned up automatically.
            prefs.uninstallReleaseSwept = false
            prefs.lastAppliedVersionCode = currentVersionCode
        }
        val policy = DevicePolicyHelper(this)
        if (!prefs.migrateKioskState(homeIsKiosk = policy.isDefaultLauncher).enabled) {
            policy.clearHomeLauncher()
        }
        // Re-apply policy on every cold start; a no-op unless this app is the device owner,
        // and a release pass whenever the kiosk is off or another launcher owns Home.
        policy.applyPolicy()
        registerPackageUpdates()
    }

    private fun registerPackageUpdates() {
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_REPLACED)
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addDataScheme("package")
        }
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val appCtx = context ?: return
                val pkg = intent?.data?.schemeSpecificPart
                runCatching { DevicePolicyHelper(appCtx).onPackagesChanged(pkg) }
            }
        }
        runCatching {
            ContextCompat.registerReceiver(this, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        }
    }

    companion object {
        const val CHANNEL = "kiosk_status"
    }
}
