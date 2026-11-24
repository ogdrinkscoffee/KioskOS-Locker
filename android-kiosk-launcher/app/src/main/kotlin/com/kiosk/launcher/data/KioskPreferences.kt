package com.kiosk.launcher.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.security.SecureRandom
import java.util.Calendar

data class PolicyEvent(val time: Long, val label: String)

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

    private fun digest(pin: String, salt: ByteArray): String = PinHash.digest(pin, salt)

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
        get() = bool(KEY_DISALLOW_APPS_CONTROL, true)
        set(value) = setBool(KEY_DISALLOW_APPS_CONTROL, value)

    // Hardware & tamper locks
    var statusBarLocked: Boolean
        get() = bool(KEY_STATUS_BAR, true)
        set(value) = setBool(KEY_STATUS_BAR, value)

    var keyguardDisabled: Boolean
        get() = bool(KEY_KEYGUARD, true)
        set(value) = setBool(KEY_KEYGUARD, value)

    var cameraDisabled: Boolean
        get() = bool(KEY_CAMERA, false)
        set(value) = setBool(KEY_CAMERA, value)

    var screenCaptureDisabled: Boolean
        get() = bool(KEY_SCREENSHOTS, true)
        set(value) = setBool(KEY_SCREENSHOTS, value)

    var usbLocked: Boolean
        get() = bool(KEY_USB, true)
        set(value) = setBool(KEY_USB, value)

    var dateTimeLocked: Boolean
        get() = bool(KEY_DATE_TIME, true)
        set(value) = setBool(KEY_DATE_TIME, value)

    var stayAwake: Boolean
        get() = bool(KEY_STAY_AWAKE, true)
        set(value) = setBool(KEY_STAY_AWAKE, value)

    var guardEnabled: Boolean
        get() = bool(KEY_GUARD, false)
        set(value) = setBool(KEY_GUARD, value)

    /** Set when an admin opts out, so the launcher stops re-pinning itself as Home. */
    var homeLauncherDeclined: Boolean
        get() = bool(KEY_HOME_LAUNCHER_DECLINED, false)
        set(value) = setBool(KEY_HOME_LAUNCHER_DECLINED, value)

    // Browser & shield toggles
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

    // ----------------------------------------------------------------- allowlist
    fun allowedPackages(): Set<String> =
        prefs.getStringSet(KEY_ALLOWED, emptySet())?.toSet() ?: emptySet()

    fun setAppAllowed(packageName: String, allowed: Boolean) {
        val next = allowedPackages().toMutableSet()
        if (allowed) next.add(packageName) else next.remove(packageName)
        prefs.edit().putStringSet(KEY_ALLOWED, next).apply()
    }

    fun isAllowed(packageName: String): Boolean =
        allowAllApps || allowedPackages().contains(packageName)

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

        private const val KEY_PIN_HASH = "pin_hash"
        private const val KEY_PIN_SALT = "pin_salt"
        private const val KEY_FAILED_PIN = "failed_pin_attempts"
        private const val KEY_PIN_LOCKED_UNTIL = "pin_locked_until_ms"
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
        private const val KEY_HOME_LAUNCHER_DECLINED = "home_launcher_declined"
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
        private const val KEY_UPDATE_FEED = "update_feed_url"
        private const val KEY_STREAK = "streak"
        private const val KEY_BEST = "best_streak"
        private const val KEY_LAST_CLEAN = "last_clean_day"
        private const val KEY_POLICY_LOG = "policy_log"

        private val DEFAULT_DOMAINS = setOf("wikipedia.org", "khanacademy.org")
        private val DEFAULT_BLOCKED_KEYWORDS = setOf("porn", "xxx", "nsfw", "onlyfans", "hentai", "xvideos", "xnxx")
    }
}
