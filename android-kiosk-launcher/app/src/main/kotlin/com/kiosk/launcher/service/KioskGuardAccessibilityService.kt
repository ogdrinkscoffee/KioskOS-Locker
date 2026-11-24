package com.kiosk.launcher.service

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.kiosk.launcher.admin.DevicePolicyHelper
import com.kiosk.launcher.data.KioskPreferences
import com.kiosk.launcher.ui.KioskLauncherActivity

/**
 * Real-time accessibility guard implementing BlockP / BlockerX & AppBlock / Freedom defenses:
 * 1. Blocks Android Settings & Package Installer unless Admin Passcode unlocked.
 * 2. Suspends & blocks unmonitored third-party browsers (Firefox, Opera, Brave, DuckDuckGo, Tor).
 * 3. Tracks active foreground time per package, enforcing daily limits, Quiet Hours Downtime & Focus Locks.
 * 4. Intercepts embedded In-App Browsers (CustomTabs & WebViews inside social/chat apps) unless whitelisted.
 * 5. Inspects browser address bars & search fields for adult domains, custom blocked keywords, and Shorts/Reels.
 */
class KioskGuardAccessibilityService : AccessibilityService() {

    private var lastBlockTimestampMs: Long = 0L
    private var currentForegroundPkg: String? = null
    private var lastUsageTickElapsedMs: Long = 0L
    private val usageHandler = Handler(Looper.getMainLooper())
    private val usageTicker = object : Runnable {
        override fun run() {
            val fgPkg = currentForegroundPkg
            if (fgPkg != null) {
                flushUsageAndEnforceIfNeeded(fgPkg)
                usageHandler.postDelayed(this, USAGE_TICK_INTERVAL_MS)
            }
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        usageHandler.removeCallbacks(usageTicker)
    }

    override fun onDestroy() {
        usageHandler.removeCallbacks(usageTicker)
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val eventType = event?.eventType ?: return
        if (eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED &&
            eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
        ) {
            return
        }

        val pkgName = event.packageName?.toString() ?: return
        val prefs = KioskPreferences(this)
        prefs.ensureUsageDateCurrent()

        if (pkgName != currentForegroundPkg && !isSystemUiNoise(pkgName)) {
            currentForegroundPkg?.let { prev -> flushUsageAndEnforceIfNeeded(prev) }
            currentForegroundPkg = if (pkgName == packageName) null else pkgName
            lastUsageTickElapsedMs = SystemClock.elapsedRealtime()
            usageHandler.removeCallbacks(usageTicker)
            if (currentForegroundPkg != null && prefs.getAppDailyLimitMinutes(pkgName) > 0) {
                usageHandler.postDelayed(usageTicker, USAGE_TICK_INTERVAL_MS)
            }
        }

        if (pkgName == packageName) return

        val isAdminUnlocked = prefs.isSettingsAndUninstallUnlocked()

        // 1. Settings & Package Installer Guard
        if (!isAdminUnlocked && pkgName in DevicePolicyHelper.BLOCKED_SETTINGS_AND_INSTALLER_PACKAGES) {
            prefs.incrementBlockedAttemptsToday()
            prefs.recordBypassAttempt("Restricted system package: $pkgName", points = 6)
            blockAndReturnToKiosk(pkgName, "Blocked $pkgName: unlock with Admin passcode.")
            return
        }

        // 2. Unsupported Alternative Browsers Guard (BlockP / BlockerX)
        if (!isAdminUnlocked &&
            prefs.isBlockUnsupportedBrowsers() &&
            pkgName in DevicePolicyHelper.UNSUPPORTED_BROWSER_PACKAGES
        ) {
            prefs.incrementBlockedAttemptsToday()
            prefs.recordBypassAttempt("Unsupported browser attempt: $pkgName", points = 8)
            performGlobalAction(GLOBAL_ACTION_BACK)
            blockAndReturnToKiosk(pkgName, "Unsupported browser blocked ($pkgName).")
            return
        }

        // 3. Per-App Daily Time Limit, Quiet Hours Downtime & Freedom Focus Block
        val scheduleOrLimitReason = prefs.getTimeOrScheduleBlockReason(pkgName)
        if (!isAdminUnlocked && scheduleOrLimitReason != null) {
            prefs.incrementBlockedAttemptsToday()
            prefs.recordBypassAttempt("Schedule/Limit override attempt: $pkgName", points = 5)
            DevicePolicyHelper.enforceKioskPolicies(this)
            performGlobalAction(GLOBAL_ACTION_HOME)
            blockAndReturnToKiosk(pkgName, "$pkgName: $scheduleOrLimitReason")
            return
        }

        // 4. Embedded In-App Browser Guard with Admin Whitelist
        if (prefs.isBlockInAppBrowsers() &&
            !KioskPreferences.isInAppBrowserPermitted(pkgName, prefs.getInAppBrowserWhitelist())
        ) {
            val className = event.className?.toString().orEmpty()
            val isInAppBrowserClass = IN_APP_BROWSER_ACTIVITY_HINTS.any { hint ->
                className.contains(hint, ignoreCase = true)
            }
            if (isInAppBrowserClass || hasEmbeddedWebViewNode(rootInActiveWindow, depth = 0)) {
                prefs.incrementBlockedAttemptsToday()
                prefs.recordBypassAttempt("In-app browser attempt in $pkgName", points = 6)
                performGlobalAction(GLOBAL_ACTION_BACK)
                blockAndReturnToKiosk(pkgName, "In-app browser blocked inside $pkgName (not whitelisted).")
                return
            }
        }

        // 5. Address-bar domain, keyword & Short-Form Feed check
        if (prefs.isDisablePornOnBrowsers() || prefs.isBlockShortFormFeeds()) {
            val detectedReason = inspectNodeForBlockedContent(
                node = rootInActiveWindow,
                prefs = prefs,
                depth = 0
            )
            if (detectedReason != null) {
                prefs.incrementBlockedAttemptsToday()
                prefs.recordBypassAttempt("$detectedReason in $pkgName", points = 6)
                performGlobalAction(GLOBAL_ACTION_BACK)
                blockAndReturnToKiosk(pkgName, "$detectedReason intercepted in $pkgName.")
            }
        }
    }

    private fun flushUsageAndEnforceIfNeeded(pkgName: String) {
        if (pkgName == packageName || isSystemUiNoise(pkgName)) return
        val nowElapsed = SystemClock.elapsedRealtime()
        val deltaSeconds = ((nowElapsed - lastUsageTickElapsedMs) / 1000L).toInt().coerceIn(0, 60)
        lastUsageTickElapsedMs = nowElapsed
        if (deltaSeconds <= 0) return

        val prefs = KioskPreferences(this)
        if (prefs.isSettingsAndUninstallUnlocked()) return

        if (prefs.getAppDailyLimitMinutes(pkgName) > 0) {
            prefs.addAppUsageSeconds(pkgName, deltaSeconds)
        }
        val blockReason = prefs.getTimeOrScheduleBlockReason(pkgName)
        if (blockReason != null && pkgName == currentForegroundPkg) {
            currentForegroundPkg = null
            usageHandler.removeCallbacks(usageTicker)
            prefs.incrementBlockedAttemptsToday()
            DevicePolicyHelper.enforceKioskPolicies(this)
            performGlobalAction(GLOBAL_ACTION_HOME)
            blockAndReturnToKiosk(pkgName, "$pkgName: $blockReason")
        }
    }

    private fun isSystemUiNoise(pkgName: String): Boolean {
        return pkgName == "com.android.systemui" || pkgName.contains("inputmethod")
    }

    private fun hasEmbeddedWebViewNode(node: AccessibilityNodeInfo?, depth: Int): Boolean {
        if (node == null || depth > 8) return false
        val cls = node.className?.toString().orEmpty()
        if (cls == "android.webkit.WebView") return true
        for (i in 0 until node.childCount) {
            if (hasEmbeddedWebViewNode(node.getChild(i), depth + 1)) {
                return true
            }
        }
        return false
    }

    private fun inspectNodeForBlockedContent(
        node: AccessibilityNodeInfo?,
        prefs: KioskPreferences,
        depth: Int
    ): String? {
        if (node == null || depth > 8) return null
        val text = node.text?.toString()?.trim().orEmpty()
        val viewId = node.viewIdResourceName?.lowercase().orEmpty()

        if (prefs.isBlockShortFormFeeds() && SHORT_FORM_VIEW_ID_HINTS.any { viewId.contains(it) }) {
            return "Short-form video feed"
        }

        val isUrlOrInputNode = node.isEditable ||
            viewId.contains("url") ||
            viewId.contains("search") ||
            viewId.contains("address") ||
            viewId.contains("omnibox")

        if (isUrlOrInputNode && text.length >= 3) {
            val lower = text.lowercase()
            if (prefs.isDisablePornOnBrowsers()) {
                val blockedDomain = KioskPreferences.BLOCKED_DISTRACTION_DOMAINS.firstOrNull { domain ->
                    lower.contains(domain)
                }
                if (blockedDomain != null) {
                    return "Blocked site ($blockedDomain)"
                }
            }
            val keywordOrFeed = KioskPreferences.detectBlockedKeywordOrFeed(
                rawText = lower,
                blockedKeywords = if (prefs.isDisablePornOnBrowsers()) prefs.getBlockedKeywords() else emptySet(),
                blockShortFormFeeds = prefs.isBlockShortFormFeeds()
            )
            if (keywordOrFeed != null) {
                return keywordOrFeed
            }
        }

        for (i in 0 until node.childCount) {
            val childMatch = inspectNodeForBlockedContent(node.getChild(i), prefs, depth + 1)
            if (childMatch != null) return childMatch
        }
        return null
    }

    private fun blockAndReturnToKiosk(pkgName: String, reason: String) {
        val now = System.currentTimeMillis()
        if (now - lastBlockTimestampMs < 600L) return
        lastBlockTimestampMs = now

        val returnHome = Intent(this, KioskLauncherActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra(KioskLauncherActivity.EXTRA_BLOCKED_PACKAGE, pkgName)
            putExtra(KioskLauncherActivity.EXTRA_BLOCKED_REASON, reason)
        }
        startActivity(returnHome)
    }

    override fun onInterrupt() {
        usageHandler.removeCallbacks(usageTicker)
    }

    companion object {
        private const val USAGE_TICK_INTERVAL_MS = 5_000L

        private val IN_APP_BROWSER_ACTIVITY_HINTS = listOf(
            "CustomTab",
            "BrowserActivity",
            "InAppBrowser",
            "WebViewActivity",
            "InternalBrowser"
        )

        private val SHORT_FORM_VIEW_ID_HINTS = listOf(
            "reel_recycler",
            "shorts_player",
            "clips_viewer",
            "reel_viewer"
        )
    }
}
