package com.kiosk.launcher.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import com.kiosk.launcher.schedule.KioskSchedule
import com.kiosk.launcher.schedule.KioskWindow
import com.kiosk.launcher.schedule.ScheduleParse
import java.security.SecureRandom
import java.util.Calendar

data class PolicyEvent(val time: Long, val label: String)

data class KioskFolder(
    val id: String,
    val name: String,
    val packageNames: List<String>
)

/**
 * All persisted kiosk state. Everything is local: the app works offline and
 * never needs an account.
 */
class KioskPreferences(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("kiosk_prefs", Context.MODE_PRIVATE)

    // ------------------------------------------------------------------ raw JSON
    fun raw(key: String): String? = prefs.getString(key, null)

    fun putRaw(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    // --------------------------------------------------------- passcode (4..50)
    fun setPin(pin: String) {
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        prefs.edit()
            .putString(KEY_PIN_SALT, PinHash.toHex(salt))
            .putString(KEY_PIN_HASH, digest(pin, salt))
            .putInt(KEY_FAILED_PIN, 0)
            .putLong(KEY_PIN_LOCKED_UNTIL, 0L)
            .apply()
    }

    fun checkPin(pin: String): Boolean {
        if (pin.length < MIN_PIN_LENGTH || pin.length > MAX_PIN_LENGTH || pin.isBlank()) return false
        val stored = prefs.getString(KEY_PIN_HASH, null) ?: return pin == DEFAULT_PIN
        val salt = PinHash.hexToBytes(prefs.getString(KEY_PIN_SALT, "") ?: "")
        return digest(pin, salt) == stored
    }

    var failedPinAttempts: Int
        get() = prefs.getInt(KEY_FAILED_PIN, 0)
        set(value) { prefs.edit().putInt(KEY_FAILED_PIN, value).apply() }

    var pinLockedUntilMs: Long
        get() = prefs.getLong(KEY_PIN_LOCKED_UNTIL, 0L)
        set(value) { prefs.edit().putLong(KEY_PIN_LOCKED_UNTIL, value).apply() }

    fun pinLockoutRemainingSeconds(nowMs: Long = System.currentTimeMillis()): Int {
        val diff = pinLockedUntilMs - nowMs
        return if (diff > 0L) ((diff + 999L) / 1000L).toInt() else 0
    }

    fun recordFailedPinAttempt(nowMs: Long = System.currentTimeMillis()): Int {
        val next = failedPinAttempts + 1
        if (next >= MAX_FAILED_PIN_ATTEMPTS) {
            failedPinAttempts = 0
            pinLockedUntilMs = nowMs + PIN_LOCKOUT_MS
            tamperWarningsCount += 1
            logPolicy("Tamper Warning: repeated failed passcode attempts (30s lockout)")
            return 30
        }
        failedPinAttempts = next
        return 0
    }

    fun resetPinFailures() {
        prefs.edit()
            .putInt(KEY_FAILED_PIN, 0)
            .putLong(KEY_PIN_LOCKED_UNTIL, 0L)
            .apply()
    }

    // --------------------------------------------------- app access passcode
    fun hasAppAccessPin(): Boolean = !prefs.getString(KEY_APP_PIN_HASH, null).isNullOrBlank()

    fun setAppAccessPin(pin: String) {
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        prefs.edit()
            .putString(KEY_APP_PIN_SALT, PinHash.toHex(salt))
            .putString(KEY_APP_PIN_HASH, digest(pin, salt))
            .putInt(KEY_APP_PIN_FAILED, 0)
            .putLong(KEY_APP_PIN_LOCKED_UNTIL, 0L)
            .apply()
    }

    fun clearAppAccessPin() {
        prefs.edit()
            .remove(KEY_APP_PIN_SALT)
            .remove(KEY_APP_PIN_HASH)
            .putInt(KEY_APP_PIN_FAILED, 0)
            .putLong(KEY_APP_PIN_LOCKED_UNTIL, 0L)
            .apply()
    }

    fun checkAppAccessPin(pin: String): Boolean {
        if (pin.length < MIN_PIN_LENGTH || pin.length > MAX_PIN_LENGTH || pin.isBlank()) return false
        val stored = prefs.getString(KEY_APP_PIN_HASH, null) ?: return checkPin(pin)
        val salt = PinHash.hexToBytes(prefs.getString(KEY_APP_PIN_SALT, "") ?: "")
        return digest(pin, salt) == stored
    }

    fun appPinLockoutRemainingSeconds(nowMs: Long = System.currentTimeMillis()): Int {
        val diff = prefs.getLong(KEY_APP_PIN_LOCKED_UNTIL, 0L) - nowMs
        return if (diff > 0L) ((diff + 999L) / 1000L).toInt() else 0
    }

    /**
     * Same 5-attempt / 30 second rule as the admin passcode, but counted separately: guessing at
     * an app password must never lock the admin out of Admin settings.
     */
    fun recordFailedAppPinAttempt(nowMs: Long = System.currentTimeMillis()): Int {
        val next = prefs.getInt(KEY_APP_PIN_FAILED, 0) + 1
        if (next >= MAX_FAILED_PIN_ATTEMPTS) {
            prefs.edit()
                .putInt(KEY_APP_PIN_FAILED, 0)
                .putLong(KEY_APP_PIN_LOCKED_UNTIL, nowMs + PIN_LOCKOUT_MS)
                .apply()
            tamperWarningsCount += 1
            logPolicy("Repeated failed protected-app passcode attempts (30s lockout)")
            return (PIN_LOCKOUT_MS / 1000L).toInt()
        }
        prefs.edit().putInt(KEY_APP_PIN_FAILED, next).apply()
        return 0
    }

    fun resetAppPinFailures() {
        prefs.edit()
            .putInt(KEY_APP_PIN_FAILED, 0)
            .putLong(KEY_APP_PIN_LOCKED_UNTIL, 0L)
            .apply()
    }

    private fun digest(pin: String, salt: ByteArray): String = PinHash.digest(pin, salt)

    // Legacy method aliases kept for helper compatibility.
    fun hasAppPin(): Boolean = hasAppAccessPin()
    fun setAppPin(pin: String) = setAppAccessPin(pin)
    fun clearAppPin() = clearAppAccessPin()
    fun checkAppPin(pin: String): Boolean = checkAppAccessPin(pin)

    /** Packages the admin marked "Require Password", independent of the password itself. */
    fun protectedPackages(): Set<String> = passwordProtectedPackages()

    fun setAppProtected(packageName: String, protected: Boolean) =
        setAppPasswordRequired(packageName, protected)

    fun isAppProtected(packageName: String): Boolean =
        isAppPasswordRequired(packageName)

    // ---------------------------------------------------------------------- mode
    var kioskMode: String
        get() = prefs.getString(KEY_MODE, MODE_MULTI) ?: MODE_MULTI
        set(value) { prefs.edit().putString(KEY_MODE, value).apply() }

    /** Closed by default: only packages an admin picks are launchable. */
    var allowAllApps: Boolean
        get() = bool(KEY_ALLOW_ALL, false)
        set(value) = setBool(KEY_ALLOW_ALL, value)

    // Toggleable strong UserManager restrictions (Device Owner)
    var disallowSafeBoot: Boolean
        get() = bool(KEY_DISALLOW_SAFE_BOOT, true)
        set(value) = setBool(KEY_DISALLOW_SAFE_BOOT, value)

    var disallowFactoryReset: Boolean
        get() = bool(KEY_DISALLOW_FACTORY_RESET, true)
        set(value) = setBool(KEY_DISALLOW_FACTORY_RESET, value)

    var disallowAddUser: Boolean
        get() = bool(KEY_DISALLOW_ADD_USER, true)
        set(value) = setBool(KEY_DISALLOW_ADD_USER, value)

    var disallowAppsControl: Boolean
        get() = bool(KEY_DISALLOW_APPS_CONTROL, false)
        set(value) = setBool(KEY_DISALLOW_APPS_CONTROL, value)

    // Hardware & tamper locks (opt-in so calling, status bar, lock screen, USB & screenshots work by default)
    var statusBarLocked: Boolean
        get() = bool(KEY_STATUS_BAR, false)
        set(value) = setBool(KEY_STATUS_BAR, value)

    var keyguardDisabled: Boolean
        get() = bool(KEY_KEYGUARD, false)
        set(value) = setBool(KEY_KEYGUARD, value)

    var cameraDisabled: Boolean
        get() = bool(KEY_CAMERA, false)
        set(value) = setBool(KEY_CAMERA, value)

    var screenCaptureDisabled: Boolean
        get() = bool(KEY_SCREENSHOTS, false)
        set(value) = setBool(KEY_SCREENSHOTS, value)

    var usbLocked: Boolean
        get() = bool(KEY_USB, false)
        set(value) = setBool(KEY_USB, value)

    var dateTimeLocked: Boolean
        get() = bool(KEY_DATE_TIME, false)
        set(value) = setBool(KEY_DATE_TIME, value)

    var stayAwake: Boolean
        get() = bool(KEY_STAY_AWAKE, false)
        set(value) = setBool(KEY_STAY_AWAKE, value)

    var guardEnabled: Boolean
        get() = bool(KEY_GUARD, false)
        set(value) = setBool(KEY_GUARD, value)

    // Custom lock screen replacement settings (opt-in)
    var customLockScreenEnabled: Boolean
        get() = bool(KEY_CUSTOM_LOCK_SCREEN, false)
        set(value) = setBool(KEY_CUSTOM_LOCK_SCREEN, value)

    var lockWidgetBattery: Boolean
        get() = bool(KEY_LOCK_WIDGET_BATTERY, true)
        set(value) = setBool(KEY_LOCK_WIDGET_BATTERY, value)

    var lockWidgetStats: Boolean
        get() = bool(KEY_LOCK_WIDGET_STATS, true)
        set(value) = setBool(KEY_LOCK_WIDGET_STATS, value)

    var lockWidgetNote: Boolean
        get() = bool(KEY_LOCK_WIDGET_NOTE, true)
        set(value) = setBool(KEY_LOCK_WIDGET_NOTE, value)

    var lockScreenNote: String
        get() = prefs.getString(KEY_LOCK_SCREEN_NOTE, "") ?: ""
        set(value) { prefs.edit().putString(KEY_LOCK_SCREEN_NOTE, value.trim()).apply() }

    /**
     * Explicit record that this device was set up as a kiosk. Null only on installs that
     * predate the flag; the next cold start resolves it once with [migrateKioskState].
     * Kept separate from Home ownership so an upgrade can tell a real kiosk from a phone
     * an older build pinned by force.
     */
    var kioskEnabled: Boolean?
        get() = if (prefs.contains(KEY_KIOSK_ENABLED)) {
            prefs.getBoolean(KEY_KIOSK_ENABLED, false)
        } else {
            null
        }
        set(value) {
            val editor = prefs.edit()
            if (value == null) editor.remove(KEY_KIOSK_ENABLED)
            else editor.putBoolean(KEY_KIOSK_ENABLED, value)
            editor.apply()
        }

    /**
     * Resolves the explicit kiosk state for installs that predate it. [homeIsKiosk] is
     * whether Android already resolves Home to this app: the only evidence an older build
     * leaves that the device was actually running as a kiosk. Writes the result so the
     * decision is made exactly once.
     */
    fun migrateKioskState(homeIsKiosk: Boolean): KioskActivation.Decision {
        val legacyDeclined = if (prefs.contains(KEY_HOME_LAUNCHER_DECLINED)) {
            prefs.getBoolean(KEY_HOME_LAUNCHER_DECLINED, true)
        } else {
            null
        }
        val decision = KioskActivation.resolve(kioskEnabled, legacyDeclined, homeIsKiosk)
        if (!decision.migrated) return decision

        kioskEnabled = decision.enabled
        prefs.edit().remove(KEY_HOME_LAUNCHER_DECLINED).apply()
        logPolicy(
            when (decision.source) {
                KioskActivation.Source.HOME_OWNER -> "Kiosk state: on (already the Home app)"
                KioskActivation.Source.NEVER_OPTED_IN -> "Kiosk state: off (never opted in)"
                else -> "Kiosk state: ${if (decision.enabled) "on" else "off"}"
            }
        )
        return decision
    }

    // Browser & shield toggles
    var showBrowserOnHome: Boolean
        get() = bool(KEY_SHOW_BROWSER_ON_HOME, true)
        set(value) = setBool(KEY_SHOW_BROWSER_ON_HOME, value)

    var blockUnsupportedBrowsers: Boolean
        get() = bool(KEY_BLOCK_UNSUPPORTED_BROWSERS, true)
        set(value) = setBool(KEY_BLOCK_UNSUPPORTED_BROWSERS, value)

    var blockShortFormFeeds: Boolean
        get() = bool(KEY_BLOCK_SHORT_FEEDS, true)
        set(value) = setBool(KEY_BLOCK_SHORT_FEEDS, value)

    // --------------------------------------------------- panic & temporary admin
    var panicLockUntilMs: Long
        get() = prefs.getLong(KEY_PANIC_LOCK_UNTIL, 0L)
        set(value) { prefs.edit().putLong(KEY_PANIC_LOCK_UNTIL, value).apply() }

    var panicCount: Int
        get() = prefs.getInt(KEY_PANIC_COUNT, 0)
        set(value) { prefs.edit().putInt(KEY_PANIC_COUNT, value).apply() }

    var tamperWarningsCount: Int
        get() = prefs.getInt(KEY_TAMPER_WARNINGS, 0)
        set(value) { prefs.edit().putInt(KEY_TAMPER_WARNINGS, value).apply() }

    var adminUnlockedUntilMs: Long
        get() = prefs.getLong(KEY_ADMIN_UNLOCKED_UNTIL, 0L)
        set(value) { prefs.edit().putLong(KEY_ADMIN_UNLOCKED_UNTIL, value).apply() }

    fun isPanicLocked(nowMs: Long = System.currentTimeMillis()): Boolean =
        panicLockUntilMs > nowMs

    fun panicRemainingMinutes(nowMs: Long = System.currentTimeMillis()): Int {
        val diff = panicLockUntilMs - nowMs
        return if (diff > 0L) ((diff + 59_999L) / 60_000L).toInt() else 0
    }

    fun triggerPanicLockdown(durationMinutes: Int = PANIC_DURATION_MINUTES) {
        val now = System.currentTimeMillis()
        panicLockUntilMs = now + durationMinutes * 60_000L
        panicCount += 1
        adminUnlockedUntilMs = 0L
        logPolicy("Panic lockdown engaged (${durationMinutes}m), clipboard wiped")
    }

    fun clearPanicLockdown() {
        panicLockUntilMs = 0L
        logPolicy("Panic lockdown cleared by Admin")
    }

    fun isAdminTemporarilyUnlocked(nowMs: Long = System.currentTimeMillis()): Boolean =
        adminUnlockedUntilMs > nowMs

    fun adminUnlockRemainingSeconds(nowMs: Long = System.currentTimeMillis()): Int {
        val diff = adminUnlockedUntilMs - nowMs
        return if (diff > 0L) ((diff + 999L) / 1000L).toInt() else 0
    }

    /** Duration the admin window opens for, adjustable in Admin. */
    var adminUnlockMinutes: Int
        get() = prefs.getInt(KEY_ADMIN_UNLOCK_MINUTES, DEFAULT_ADMIN_UNLOCK_MINUTES)
            .coerceIn(MIN_ADMIN_UNLOCK_MINUTES, MAX_ADMIN_UNLOCK_MINUTES)
        set(value) {
            prefs.edit()
                .putInt(
                    KEY_ADMIN_UNLOCK_MINUTES,
                    value.coerceIn(MIN_ADMIN_UNLOCK_MINUTES, MAX_ADMIN_UNLOCK_MINUTES)
                )
                .apply()
        }

    fun grantTemporaryAdminWindow(minutes: Int = adminUnlockMinutes) {
        adminUnlockedUntilMs = System.currentTimeMillis() + minutes * 60_000L
        logPolicy("Temporary admin window opened (${minutes}m)")
    }

    /** Ends the window early; callers re-apply policy afterwards. */
    fun endTemporaryAdminWindow() {
        if (adminUnlockedUntilMs == 0L) return
        adminUnlockedUntilMs = 0L
        logPolicy("Temporary admin window closed")
    }

    /** Event log for kiosk administration; also used by the in-app updater. */
    var updateFeedUrl: String
        get() = prefs.getString(KEY_UPDATE_FEED, "") ?: ""
        set(value) { prefs.edit().putString(KEY_UPDATE_FEED, value.trim()).apply() }

    // ----------------------------------------------------------- in-app update
    /** True while the installer is open and its package must stay reachable. */
    var installingUpdate: Boolean
        get() = bool(KEY_INSTALLING_UPDATE, false)
        set(value) = setBool(KEY_INSTALLING_UPDATE, value)

    fun isInstallingUpdate(nowMs: Long = System.currentTimeMillis()): Boolean {
        if (!installingUpdate) return false
        // A crashed installer session must not leave the launcher permanently unpinned.
        val started = prefs.getLong(KEY_UPDATE_STARTED_AT, 0L)
        if (started > 0L && nowMs - started > UPDATE_INSTALL_TIMEOUT_MS) {
            installingUpdate = false
            return false
        }
        return true
    }

    fun beginUpdateInstall() {
        installingUpdate = true
        prefs.edit().putLong(KEY_UPDATE_STARTED_AT, System.currentTimeMillis()).apply()
    }

    fun finishUpdateInstall() {
        installingUpdate = false
    }

    var lastUpdateCheckMs: Long
        get() = prefs.getLong(KEY_LAST_UPDATE_CHECK, 0L)
        set(value) { prefs.edit().putLong(KEY_LAST_UPDATE_CHECK, value).apply() }

    /** Version code the admin skipped with "later", so the card can stay quiet. */
    var skippedUpdateVersionCode: Int
        get() = prefs.getInt(KEY_SKIPPED_UPDATE_CODE, 0)
        set(value) { prefs.edit().putInt(KEY_SKIPPED_UPDATE_CODE, value).apply() }

    var lastAppliedVersionCode: Int
        get() = prefs.getInt(KEY_LAST_APPLIED_VERSION_CODE, 0)
        set(value) { prefs.edit().putInt(KEY_LAST_APPLIED_VERSION_CODE, value).apply() }

    // ----------------------------------------------------------------- allowlist
    fun allowedPackages(): Set<String> =
        prefs.getStringSet(KEY_ALLOWED, emptySet())?.toSet() ?: emptySet()

    fun setAppAllowed(packageName: String, allowed: Boolean) {
        val next = allowedPackages().toMutableSet()
        if (allowed) next.add(packageName) else next.remove(packageName)
        prefs.edit().putStringSet(KEY_ALLOWED, next).apply()
    }

    /**
     * Everything the grid, the lock screen dock and the launch gate ask before an app opens.
     * With a schedule on, an app is allowed outside the kiosk windows regardless of the lists,
     * because the device is a normal phone then. An unreadable schedule keeps the kiosk strict
     * (see [isWithinKioskHours]) rather than quietly turning the restrictions off.
     */
    fun isAllowed(packageName: String, nowMs: Long = System.currentTimeMillis()): Boolean {
        if (allowAllApps) return true
        if (!scheduleEnabled) return allowedPackages().contains(packageName)
        if (!isWithinKioskHours(nowMs)) return true
        return allowedPackagesForDay(KioskSchedule.isWeekend(nowMs)).contains(packageName)
    }

    // ------------------------------------------------------------------ schedule
    /** Master switch for time-based kiosk mode; off keeps the plain single allowlist. */
    var scheduleEnabled: Boolean
        get() = bool(KEY_SCHEDULE_ENABLED, false)
        set(value) = setBool(KEY_SCHEDULE_ENABLED, value)

    /** The schedule text exactly as the admin typed it, one window per line. */
    var scheduleWindows: String
        get() = prefs.getString(KEY_SCHEDULE_WINDOWS, "") ?: ""
        set(value) { prefs.edit().putString(KEY_SCHEDULE_WINDOWS, value.trim()).apply() }

    fun scheduleWindowsParsed(): ScheduleParse = KioskSchedule.parse(scheduleWindows)

    private fun parsedWindows(): List<KioskWindow>? =
        (scheduleWindowsParsed() as? ScheduleParse.Parsed)?.windows

    /**
     * True when kiosk mode may be enforced right now.
     *
     * A schedule with no windows, or one the parser cannot read, counts as kiosk time: a typo must
     * not hand a pinned device back as a normal phone. Outside a real window it is false, which is
     * what turns the device into a normal phone.
     */
    fun isWithinKioskHours(nowMs: Long = System.currentTimeMillis()): Boolean {
        if (!scheduleEnabled) return true
        val windows = parsedWindows() ?: return true
        if (windows.isEmpty()) return true
        return KioskSchedule.isKioskTime(windows, nowMs)
    }

    /** True when the kiosk is both opted in and inside its scheduled hours. */
    fun isKioskActiveNow(nowMs: Long = System.currentTimeMillis()): Boolean =
        kioskEnabled == true && isWithinKioskHours(nowMs)

    fun weekdayPackages(): Set<String> =
        prefs.getStringSet(KEY_WEEKDAY_ALLOWED, emptySet())?.toSet() ?: emptySet()

    fun weekendPackages(): Set<String> =
        prefs.getStringSet(KEY_WEEKEND_ALLOWED, emptySet())?.toSet() ?: emptySet()

    fun allowedPackagesForDay(weekend: Boolean): Set<String> =
        if (weekend) weekendPackages() else weekdayPackages()

    fun setDayAllowed(packageName: String, allowed: Boolean, weekend: Boolean) {
        val next = allowedPackagesForDay(weekend).toMutableSet()
        if (allowed) next.add(packageName) else next.remove(packageName)
        prefs.edit()
            .putStringSet(if (weekend) KEY_WEEKEND_ALLOWED else KEY_WEEKDAY_ALLOWED, next)
            .apply()
    }

    fun isDayAllowed(packageName: String, weekend: Boolean): Boolean =
        allowedPackagesForDay(weekend).contains(packageName)

    /** The list that applies right now; lock task packages must follow it, not the legacy set. */
    fun allowedPackagesNow(nowMs: Long = System.currentTimeMillis()): Set<String> =
        if (!scheduleEnabled) allowedPackages()
        else allowedPackagesForDay(KioskSchedule.isWeekend(nowMs))

    /** True when the app is on any list, which is what the per-app password row keys off. */
    fun isAllowlistedAnywhere(packageName: String): Boolean =
        allowedPackages().contains(packageName) ||
            weekdayPackages().contains(packageName) ||
            weekendPackages().contains(packageName)

    /**
     * Seeds the weekday and weekend lists from the old single allowlist the first time a schedule
     * is turned on, so enabling it never silently empties what the kiosk may run.
     */
    fun seedDayListsFromLegacyAllowlist() {
        if (weekdayPackages().isNotEmpty() || weekendPackages().isNotEmpty()) return
        val legacy = allowedPackages()
        if (legacy.isEmpty()) return
        prefs.edit()
            .putStringSet(KEY_WEEKDAY_ALLOWED, legacy.toMutableSet())
            .putStringSet(KEY_WEEKEND_ALLOWED, legacy.toMutableSet())
            .apply()
    }

    /** Last kiosk state a schedule check applied, so a boundary is logged once, not per resume. */
    var scheduleObservedActive: Boolean
        get() = bool(KEY_SCHEDULE_OBSERVED, false)
        set(value) = setBool(KEY_SCHEDULE_OBSERVED, value)

    // ------------------------------------------------------- custom lock screen
    var customLockScreen: Boolean
        get() = customLockScreenEnabled
        set(value) { customLockScreenEnabled = value }

    /** Admin-picked dock apps, kept in the order the admin saved them. */
    fun quickLaunchPackages(): List<String> = lockScreenQuickApps()

    fun setQuickLaunchPackages(packages: List<String>) = setLockScreenQuickApps(packages)

    /**
     * Set while the screen is off, so a receiver that starts in a fresh process still
     * knows the custom lock screen is owed. An unlock clears it.
     */
    var lockScreenPending: Boolean
        get() = bool(KEY_LOCK_SCREEN_PENDING, false)
        set(value) = setBool(KEY_LOCK_SCREEN_PENDING, value)

    // ------------------------------------------------------------ watchdog liveness
    /**
     * True only while one of this app's own screens is in front. It is cleared when the last one
     * pauses, so a value still set after the process is gone means the kiosk died on screen.
     */
    var kioskUiVisible: Boolean
        get() = bool(KEY_KIOSK_UI_VISIBLE, false)
        set(value) = setBool(KEY_KIOSK_UI_VISIBLE, value)

    /** Refreshed by the application every 30 seconds; silence means the process is gone. */
    var launcherHeartbeatMs: Long
        get() = prefs.getLong(KEY_LAUNCHER_HEARTBEAT, 0L)
        set(value) { prefs.edit().putLong(KEY_LAUNCHER_HEARTBEAT, value).apply() }

    fun passwordProtectedPackages(): Set<String> {
        val primary = prefs.getStringSet(KEY_APP_PASSWORD_PACKAGES, null)
        if (primary != null) return primary.toSet()
        return prefs.getStringSet(KEY_LEGACY_PROTECTED_PACKAGES, emptySet())?.toSet() ?: emptySet()
    }

    fun isAppPasswordRequired(packageName: String): Boolean =
        com.kiosk.launcher.admin.AppPasswordPolicy.requiresPassword(
            packageName,
            passwordProtectedPackages()
        )

    fun setAppPasswordRequired(packageName: String, required: Boolean) {
        val next = passwordProtectedPackages().toMutableSet()
        if (required) next.add(packageName) else next.remove(packageName)
        prefs.edit()
            .putStringSet(KEY_APP_PASSWORD_PACKAGES, next)
            .remove(KEY_LEGACY_PROTECTED_PACKAGES)
            .apply()
    }

    fun lockScreenQuickApps(): List<String> {
        val raw = prefs.getString(KEY_LOCK_QUICK_APPS, null)
        if (raw != null) {
            return runCatching {
                val array = JSONArray(raw)
                (0 until array.length()).mapNotNull { i ->
                    array.optString(i)?.takeIf { it.isNotBlank() }
                }.distinct()
            }.getOrDefault(emptyList())
        }
        return LockScreenShortcuts.decode(prefs.getString(KEY_LOCK_SCREEN_QUICK_LAUNCH, null))
    }

    fun setLockScreenQuickApps(packages: List<String>) {
        val array = JSONArray()
        packages.distinct()
            .take(com.kiosk.launcher.admin.AppPasswordPolicy.MAX_QUICK_LAUNCH_APPS)
            .forEach { array.put(it) }
        putRaw(KEY_LOCK_QUICK_APPS, array.toString())
    }

    // --------------------------------------------------------- uninstall blocks
    /**
     * Packages this app currently holds an uninstall block on. Recording them is what
     * lets a later pass release an app whose block was applied by an older build.
     */
    fun uninstallBlockedPackages(): Set<String> =
        prefs.getStringSet(KEY_UNINSTALL_BLOCKED, emptySet())?.toSet() ?: emptySet()

    fun setUninstallBlockedPackages(value: Set<String>) {
        prefs.edit().putStringSet(KEY_UNINSTALL_BLOCKED, value.toMutableSet()).apply()
    }

    /**
     * True once the one-time release sweep for blocks left by older builds has run. After
     * that a release pass only touches the recorded packages, so cold starts with the
     * kiosk off no longer walk the whole package list.
     */
    var uninstallReleaseSwept: Boolean
        get() = bool(KEY_UNINSTALL_RELEASE_SWEPT, false)
        set(value) = setBool(KEY_UNINSTALL_RELEASE_SWEPT, value)

    // ------------------------------------------------------------------- browser
    fun domains(): Set<String> =
        prefs.getStringSet(KEY_DOMAINS, DEFAULT_DOMAINS)?.toSet() ?: DEFAULT_DOMAINS

    fun setDomains(value: Set<String>) {
        prefs.edit().putStringSet(KEY_DOMAINS, value.toMutableSet()).apply()
    }

    fun blockedKeywords(): Set<String> =
        prefs.getStringSet(KEY_BLOCKED_KEYWORDS, DEFAULT_BLOCKED_KEYWORDS)?.toSet()
            ?: DEFAULT_BLOCKED_KEYWORDS

    fun setBlockedKeywords(value: Set<String>) {
        prefs.edit().putStringSet(KEY_BLOCKED_KEYWORDS, value.toMutableSet()).apply()
    }

    // -------------------------------------------------------------------- streak
    var streak: Int
        get() = prefs.getInt(KEY_STREAK, 0)
        set(value) { prefs.edit().putInt(KEY_STREAK, value).apply() }

    var bestStreak: Int
        get() = prefs.getInt(KEY_BEST, 0)
        set(value) { prefs.edit().putInt(KEY_BEST, value).apply() }

    var lastCleanDay: Long
        get() = prefs.getLong(KEY_LAST_CLEAN, 0L)
        set(value) { prefs.edit().putLong(KEY_LAST_CLEAN, value).apply() }

    /** Local calendar epoch-day so midnight rollovers honor the device timezone. */
    fun today(): Long = localEpochDay()

    /** Returns false when today was already logged. */
    fun markTodayClean(): Boolean {
        val day = today()
        if (lastCleanDay == day) return false
        streak = if (lastCleanDay == day - 1L) streak + 1 else 1
        if (streak > bestStreak) bestStreak = streak
        lastCleanDay = day
        return true
    }

    // --------------------------------------------------------------- policy log
    fun policyEvents(): List<PolicyEvent> {
        val raw = raw(KEY_POLICY_LOG) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            (0 until array.length()).mapNotNull { index ->
                array.optJSONObject(index)?.let {
                    PolicyEvent(it.optLong("t"), it.optString("l"))
                }
            }
        }.getOrDefault(emptyList())
    }

    fun logPolicy(label: String) {
        val events = policyEvents().toMutableList()
        val previous = events.firstOrNull()
        if (previous != null && previous.label == label &&
            System.currentTimeMillis() - previous.time < 5_000
        ) {
            return
        }
        events.add(0, PolicyEvent(System.currentTimeMillis(), label))
        val array = JSONArray()
        events.take(20).forEach { array.put(JSONObject().put("t", it.time).put("l", it.label)) }
        putRaw(KEY_POLICY_LOG, array.toString())
    }

    // ------------------------------------------------------------------ helpers
    private fun bool(key: String, default: Boolean) = prefs.getBoolean(key, default)

    private fun setBool(key: String, value: Boolean) {
        prefs.edit().putBoolean(key, value).apply()
    }


    // --------------------------------------------------- home folders & layout
    fun homeFolders(): List<KioskFolder> {
        val raw = prefs.getString(KEY_HOME_FOLDERS, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            (0 until array.length()).mapNotNull { i ->
                val obj = array.optJSONObject(i) ?: return@mapNotNull null
                val id = obj.optString("id") ?: return@mapNotNull null
                val name = obj.optString("name") ?: "Folder"
                val pkgsArray = obj.optJSONArray("packageNames") ?: JSONArray()
                val pkgs = (0 until pkgsArray.length()).mapNotNull { j -> pkgsArray.optString(j) }
                KioskFolder(id = id, name = name, packageNames = pkgs)
            }
        }.getOrDefault(emptyList())
    }

    fun saveHomeFolders(folders: List<KioskFolder>) {
        val array = JSONArray()
        for (f in folders) {
            val obj = JSONObject()
            obj.put("id", f.id)
            obj.put("name", f.name)
            val pkgsArray = JSONArray()
            f.packageNames.distinct().forEach { pkgsArray.put(it) }
            obj.put("packageNames", pkgsArray)
            array.put(obj)
        }
        putRaw(KEY_HOME_FOLDERS, array.toString())
    }

    fun createFolder(name: String, packageNames: List<String>): KioskFolder {
        val id = "folder_" + System.currentTimeMillis()
        val folder = KioskFolder(id, name, packageNames)
        val updated = homeFolders() + folder
        saveHomeFolders(updated)
        return folder
    }

    fun updateFolder(folderId: String, name: String, packageNames: List<String>) {
        val updated = homeFolders().map {
            if (it.id == folderId) KioskFolder(folderId, name, packageNames) else it
        }
        saveHomeFolders(updated)
    }

    fun deleteFolder(folderId: String) {
        val updated = homeFolders().filter { it.id != folderId }
        saveHomeFolders(updated)
        homeItemsOrder = homeItemsOrder.filter { it != "folder:$folderId" }
    }

    var homeItemsOrder: List<String>
        get() {
            val raw = prefs.getString(KEY_HOME_ITEMS_ORDER, null) ?: return emptyList()
            return runCatching {
                val array = JSONArray(raw)
                (0 until array.length()).mapNotNull { array.optString(it) }
            }.getOrDefault(emptyList())
        }
        set(value) {
            val array = JSONArray()
            value.forEach { array.put(it) }
            putRaw(KEY_HOME_ITEMS_ORDER, array.toString())
        }

    companion object {
        const val DEFAULT_PIN = "1234"
        const val MIN_PIN_LENGTH = 4
        const val MAX_PIN_LENGTH = 50
        const val MAX_FAILED_PIN_ATTEMPTS = 5
        const val PIN_LOCKOUT_MS = 30_000L
        const val PANIC_DURATION_MINUTES = 15

        const val DEFAULT_ADMIN_UNLOCK_MINUTES = 5
        const val MIN_ADMIN_UNLOCK_MINUTES = 1
        const val MAX_ADMIN_UNLOCK_MINUTES = 120
        const val ADMIN_UNLOCK_STEP_MINUTES = 5
        const val UPDATE_INSTALL_TIMEOUT_MS = 10 * 60_000L

        const val MODE_MULTI = "multi"
        const val MODE_SINGLE = "single"
        const val MODE_BROWSER = "browser"

        fun localEpochDay(nowMs: Long = System.currentTimeMillis()): Long {
            val cal = Calendar.getInstance()
            val offsetMs = cal.timeZone.getOffset(nowMs)
            return (nowMs + offsetMs) / 86_400_000L
        }

        private const val KEY_HOME_FOLDERS = "home_folders_json"
        private const val KEY_HOME_ITEMS_ORDER = "home_items_order_json"
        private const val KEY_PIN_HASH = "pin_hash"
        private const val KEY_PIN_SALT = "pin_salt"
        private const val KEY_FAILED_PIN = "failed_pin_attempts"
        private const val KEY_PIN_LOCKED_UNTIL = "pin_locked_until_ms"
        private const val KEY_APP_PIN_HASH = "app_pin_hash"
        private const val KEY_APP_PIN_SALT = "app_pin_salt"
        private const val KEY_APP_PIN_FAILED = "app_pin_failed_attempts"
        private const val KEY_APP_PIN_LOCKED_UNTIL = "app_pin_locked_until_ms"
        private const val KEY_LEGACY_PROTECTED_PACKAGES = "protected_packages"
        private const val KEY_APP_PASSWORD_PACKAGES = "app_password_packages"
        private const val KEY_CUSTOM_LOCK_SCREEN = "custom_lock_screen_enabled"
        private const val KEY_LOCK_WIDGET_BATTERY = "lock_widget_battery"
        private const val KEY_LOCK_WIDGET_STATS = "lock_widget_stats"
        private const val KEY_LOCK_WIDGET_NOTE = "lock_widget_note"
        private const val KEY_LOCK_SCREEN_NOTE = "lock_screen_note"
        private const val KEY_LOCK_QUICK_APPS = "lock_screen_quick_apps"
        private const val KEY_LOCK_SCREEN_QUICK_LAUNCH = "lock_screen_quick_launch"
        private const val KEY_LOCK_SCREEN_PENDING = "lock_screen_pending"
        private const val KEY_KIOSK_UI_VISIBLE = "kiosk_ui_visible"
        private const val KEY_LAUNCHER_HEARTBEAT = "launcher_heartbeat_ms"
        private const val KEY_MODE = "kiosk_mode"
        private const val KEY_ALLOW_ALL = "allow_all_apps"
        private const val KEY_ALLOWED = "allowed_packages"
        private const val KEY_DOMAINS = "browser_domains"
        private const val KEY_BLOCKED_KEYWORDS = "blocked_keywords"
        private const val KEY_DISALLOW_SAFE_BOOT = "disallow_safe_boot"
        private const val KEY_DISALLOW_FACTORY_RESET = "disallow_factory_reset"
        private const val KEY_DISALLOW_ADD_USER = "disallow_add_user"
        private const val KEY_DISALLOW_APPS_CONTROL = "disallow_apps_control"
        private const val KEY_STATUS_BAR = "lock_status_bar"
        private const val KEY_KEYGUARD = "lock_keyguard"
        private const val KEY_CAMERA = "lock_camera"
        private const val KEY_SCREENSHOTS = "lock_screenshots"
        private const val KEY_USB = "lock_usb"
        private const val KEY_DATE_TIME = "lock_date_time"
        private const val KEY_STAY_AWAKE = "stay_awake"
        private const val KEY_GUARD = "guard_enabled"
        private const val KEY_KIOSK_ENABLED = "kiosk_enabled"
        /** Written by 1.3.1 only; read once by [migrateKioskState]. */
        private const val KEY_HOME_LAUNCHER_DECLINED = "home_launcher_declined"
        private const val KEY_UNINSTALL_BLOCKED = "uninstall_blocked_packages"
        private const val KEY_UNINSTALL_RELEASE_SWEPT = "uninstall_release_swept"
        private const val KEY_SCHEDULE_ENABLED = "schedule_enabled"
        private const val KEY_SCHEDULE_WINDOWS = "schedule_windows"
        private const val KEY_WEEKDAY_ALLOWED = "weekday_allowed_packages"
        private const val KEY_WEEKEND_ALLOWED = "weekend_allowed_packages"
        private const val KEY_SCHEDULE_OBSERVED = "schedule_observed_active"
        private const val KEY_SHOW_BROWSER_ON_HOME = "show_browser_on_home"
        private const val KEY_BLOCK_UNSUPPORTED_BROWSERS = "block_unsupported_browsers"
        private const val KEY_BLOCK_SHORT_FEEDS = "block_short_form_feeds"
        private const val KEY_PANIC_LOCK_UNTIL = "panic_lock_until_ms"
        private const val KEY_PANIC_COUNT = "panic_count"
        private const val KEY_TAMPER_WARNINGS = "tamper_warnings_count"
        private const val KEY_ADMIN_UNLOCKED_UNTIL = "admin_unlocked_until_ms"
        private const val KEY_ADMIN_UNLOCK_MINUTES = "admin_unlock_minutes"
        private const val KEY_INSTALLING_UPDATE = "installing_update"
        private const val KEY_UPDATE_STARTED_AT = "update_started_at_ms"
        private const val KEY_LAST_UPDATE_CHECK = "last_update_check_ms"
        private const val KEY_SKIPPED_UPDATE_CODE = "skipped_update_code"
        private const val KEY_LAST_APPLIED_VERSION_CODE = "last_applied_version_code"
        private const val KEY_UPDATE_FEED = "update_feed_url"
        private const val KEY_STREAK = "streak"
        private const val KEY_BEST = "best_streak"
        private const val KEY_LAST_CLEAN = "last_clean_day"
        private const val KEY_POLICY_LOG = "policy_log"

        private val DEFAULT_DOMAINS = setOf("wikipedia.org", "khanacademy.org")
        private val DEFAULT_BLOCKED_KEYWORDS = setOf("porn", "xxx", "nsfw", "onlyfans", "hentai", "xvideos", "xnxx")
    }
}
