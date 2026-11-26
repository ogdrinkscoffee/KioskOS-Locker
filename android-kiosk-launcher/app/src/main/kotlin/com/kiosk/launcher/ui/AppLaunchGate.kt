package com.kiosk.launcher.ui

import android.app.Activity
import android.widget.Toast
import com.kiosk.launcher.R
import com.kiosk.launcher.data.AppEntry
import com.kiosk.launcher.data.InstalledAppsRepository
import com.kiosk.launcher.data.KioskPreferences

/**
 * The one rule for opening an app from either surface.
 *
 * Panic lockdown blocks every app, the allowlist decides what exists at all, an app marked
 * "Require Password" asks for the app access password first, and only then is the launch
 * intent built. The kiosk grid and the lock screen dock both come through here, so the two
 * screens cannot disagree about who needs a password or what is blocked.
 */
object AppLaunchGate {

    fun open(
        activity: Activity,
        entry: AppEntry,
        apps: InstalledAppsRepository,
        onLaunched: () -> Unit = {}
    ) {
        val prefs = KioskPreferences(activity)
        if (prefs.isPanicLocked()) {
            toast(activity, activity.getString(R.string.panic_app_blocked))
            return
        }
        if (!prefs.isAllowed(entry.packageName)) {
            toast(activity, activity.getString(R.string.app_not_allowed_fmt, entry.label))
            return
        }
        if (prefs.isAppProtected(entry.packageName)) {
            AppAccessPinGate.prompt(activity, entry.label) {
                launch(activity, entry, apps, onLaunched)
            }
            return
        }
        launch(activity, entry, apps, onLaunched)
    }

    private fun launch(
        activity: Activity,
        entry: AppEntry,
        apps: InstalledAppsRepository,
        onLaunched: () -> Unit
    ) {
        if (!apps.launch(entry.packageName)) {
            toast(activity, activity.getString(R.string.cannot_open_app_fmt, entry.label))
            return
        }
        onLaunched()
    }

    private fun toast(activity: Activity, message: String) {
        Toast.makeText(activity, message, Toast.LENGTH_SHORT).show()
    }
}
