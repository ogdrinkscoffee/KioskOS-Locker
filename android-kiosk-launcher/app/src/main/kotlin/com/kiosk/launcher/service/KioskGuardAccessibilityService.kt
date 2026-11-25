package com.kiosk.launcher.service

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences

/**
 * Optional window guard. When enabled it returns to the kiosk launcher as soon as
 * an app outside the allowlist comes to the foreground (or during an active Panic Lock).
 * It never reads screen content: only the package name of the window that gained focus.
 */
class KioskGuardAccessibilityService : AccessibilityService() {

    private var prefs: KioskPreferences? = null
    private var policy: DevicePolicyHelper? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        prefs = KioskPreferences(this)
        policy = DevicePolicyHelper(this)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val store = prefs ?: return
        if (!store.guardEnabled && !store.isPanicLocked()) return
        // The system installer has to stay reachable while an in-app update runs.
        if (!store.isPanicLocked() && store.isInstallingUpdate()) return
        // The guard belongs to the kiosk. While another launcher owns Home the kiosk is
        // not in charge, so it must not keep bouncing the user's own launcher, Settings
        // and the Google apps they opened back to a grid they were not using.
        if (store.kioskEnabled != true || policy?.isDefaultLauncher != true) return

        val packageName = event.packageName?.toString() ?: return
        if (packageName == this.packageName) return
        if (packageName.startsWith("com.android.systemui")) return

        if (store.blockUnsupportedBrowsers && packageName in DevicePolicyHelper.UNSUPPORTED_BROWSERS) {
            performGlobalAction(GLOBAL_ACTION_HOME)
            return
        }

        if (store.isAdminTemporarilyUnlocked()) return

        if (store.isPanicLocked()) {
            performGlobalAction(GLOBAL_ACTION_HOME)
            return
        }

        if (store.isAllowed(packageName)) return

        performGlobalAction(GLOBAL_ACTION_HOME)
    }

    override fun onInterrupt() = Unit
}
