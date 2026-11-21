package com.kiosk.launcher.service

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import com.kiosk.launcher.data.KioskPreferences

/**
 * Optional window guard. When enabled it returns to the kiosk launcher as soon as
 * an app outside the allowlist comes to the foreground. It never reads screen
 * content: only the package name of the window that gained focus.
 */
class KioskGuardAccessibilityService : AccessibilityService() {

    private var prefs: KioskPreferences? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        prefs = KioskPreferences(this)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val store = prefs ?: return
        if (!store.guardEnabled) return

        val packageName = event.packageName?.toString() ?: return
        if (packageName == this.packageName) return
        if (packageName.startsWith("com.android.systemui")) return
        if (store.isAllowed(packageName)) return

        performGlobalAction(GLOBAL_ACTION_HOME)
    }

    override fun onInterrupt() = Unit
}
