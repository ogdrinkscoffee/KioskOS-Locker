package com.kiosk.launcher.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom

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

    // ----------------------------------------------------------------------- PIN
    fun setPin(pin: String) {
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        prefs.edit()
            .putString(KEY_PIN_SALT, salt.toHex())
            .putString(KEY_PIN_HASH, digest(pin, salt))
            .apply()
    }

    fun checkPin(pin: String): Boolean {
        val stored = prefs.getString(KEY_PIN_HASH, null) ?: return pin == DEFAULT_PIN
        val salt = (prefs.getString(KEY_PIN_SALT, "") ?: "").hexToBytes()
        return digest(pin, salt) == stored
    }

    private fun digest(pin: String, salt: ByteArray): String {
        val md = MessageDigest.getInstance("SHA-256")
        md.update(salt)
        md.update(pin.toByteArray(Charsets.UTF_8))
        return md.digest().toHex()
    }

    // ---------------------------------------------------------------------- mode
    var kioskMode: String
        get() = prefs.getString(KEY_MODE, MODE_MULTI) ?: MODE_MULTI
        set(value) { prefs.edit().putString(KEY_MODE, value).apply() }

    var allowAllApps: Boolean
        get() = bool(KEY_ALLOW_ALL, true)
        set(value) = setBool(KEY_ALLOW_ALL, value)

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

    fun today(): Long = System.currentTimeMillis() / 86_400_000L

    /** Returns false when today was already logged. */
    fun markTodayClean(): Boolean {
        val day = today()
        if (lastCleanDay == day) return false
        streak = if (lastCleanDay == day - 1) streak + 1 else 1
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

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

    private fun String.hexToBytes(): ByteArray =
        chunked(2).mapNotNull { it.toIntOrNull(16)?.toByte() }.toByteArray()

    companion object {
        const val DEFAULT_PIN = "1234"
        const val MODE_MULTI = "multi"
        const val MODE_SINGLE = "single"
        const val MODE_BROWSER = "browser"

        private const val KEY_PIN_HASH = "pin_hash"
        private const val KEY_PIN_SALT = "pin_salt"
        private const val KEY_MODE = "kiosk_mode"
        private const val KEY_ALLOW_ALL = "allow_all_apps"
        private const val KEY_ALLOWED = "allowed_packages"
        private const val KEY_DOMAINS = "browser_domains"
        private const val KEY_STATUS_BAR = "lock_status_bar"
        private const val KEY_KEYGUARD = "lock_keyguard"
        private const val KEY_CAMERA = "lock_camera"
        private const val KEY_SCREENSHOTS = "lock_screenshots"
        private const val KEY_USB = "lock_usb"
        private const val KEY_DATE_TIME = "lock_date_time"
        private const val KEY_STAY_AWAKE = "stay_awake"
        private const val KEY_GUARD = "guard_enabled"
        private const val KEY_STREAK = "streak"
        private const val KEY_BEST = "best_streak"
        private const val KEY_LAST_CLEAN = "last_clean_day"
        private const val KEY_POLICY_LOG = "policy_log"

        private val DEFAULT_DOMAINS = setOf("wikipedia.org", "khanacademy.org")
    }
}
