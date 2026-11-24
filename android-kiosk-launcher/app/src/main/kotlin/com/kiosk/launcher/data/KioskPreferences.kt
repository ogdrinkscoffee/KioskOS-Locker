package com.kiosk.launcher.data

import android.content.Context
import android.content.SharedPreferences
import android.net.Uri
import android.os.UserManager
import java.security.MessageDigest
import java.security.SecureRandom
import java.text.SimpleDateFormat
import java.time.LocalDate
import java.util.Date
import java.util.Locale

/**
 * Direct-Boot-aware preference store backed by Device Protected Storage.
 * Guarantees admin passcode (4-50 chars), allowed app packages, kiosk operation mode,
 * hardware lockdown policies, BlockP/BlockerX web & in-app browser guards,
 * and strict anti-relapse shield cooldowns survive reboots.
 */
class KioskPreferences(context: Context) {

    private val deviceContext: Context = context.applicationContext.createDeviceProtectedStorageContext()
    private val prefs: SharedPreferences = deviceContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    init {
        migrateLegacyCredentialsIfNeeded(context.applicationContext)
        ensureDefaultPinInitialized()
    }

    private fun migrateLegacyCredentialsIfNeeded(appContext: Context) {
        val userManager = appContext.getSystemService(UserManager::class.java)
        val isUnlocked = userManager?.isUserUnlocked == true
        if (isUnlocked && !prefs.contains(KEY_PIN_HASH) && !appContext.isDeviceProtectedStorage) {
            try {
                deviceContext.moveSharedPreferencesFrom(appContext, PREFS_NAME)
            } catch (_: IllegalStateException) {
                // Credential-encrypted storage not yet unlocked during Direct Boot
            }
        }
    }

    private fun ensureDefaultPinInitialized() {
        if (!prefs.contains(KEY_PIN_HASH) || !prefs.contains(KEY_PIN_SALT)) {
            val salt = generateSalt()
            val hash = hashPin(DEFAULT_PIN, salt)
            prefs.edit()
                .putString(KEY_PIN_SALT, salt)
                .putString(KEY_PIN_HASH, hash)
                .apply()
        }
    }

    fun verifyPin(candidatePin: String): Boolean {
        if (getPinLockoutRemainingSeconds() > 0) return false
        if (candidatePin.isBlank()) return false
        val salt = prefs.getString(KEY_PIN_SALT, null) ?: return false
        val expectedHash = prefs.getString(KEY_PIN_HASH, null) ?: return false
        val matched = MessageDigest.isEqual(
            hashPin(candidatePin, salt).toByteArray(Charsets.UTF_8),
            expectedHash.toByteArray(Charsets.UTF_8)
        )
        if (matched) {
            resetFailedPinAttempts()
        } else {
            recordFailedPinAttempt()
        }
        return matched
    }

    fun getFailedPinAttempts(): Int = prefs.getInt(KEY_FAILED_PIN_ATTEMPTS, 0)

    fun getPinLockoutRemainingSeconds(): Int {
        val lockedUntil = prefs.getLong(KEY_PIN_LOCKOUT_UNTIL_MS, 0L)
        val diff = lockedUntil - System.currentTimeMillis()
        return if (diff > 0L) ((diff + 999L) / 1000L).toInt() else 0
    }

    private fun recordFailedPinAttempt() {
        val next = getFailedPinAttempts() + 1
        val editor = prefs.edit().putInt(KEY_FAILED_PIN_ATTEMPTS, next)
        if (next >= MAX_FAILED_PIN_ATTEMPTS) {
            val baseUntil = System.currentTimeMillis() + PIN_LOCKOUT_DURATION_MS
            val existingUntil = prefs.getLong(KEY_PIN_LOCKOUT_UNTIL_MS, 0L)
            editor.putLong(KEY_PIN_LOCKOUT_UNTIL_MS, maxOf(existingUntil, baseUntil))
            editor.putInt(KEY_FAILED_PIN_ATTEMPTS, 0)
        }
        editor.apply()
        recordBypassAttempt("Failed Admin passcode attempt ($next/$MAX_FAILED_PIN_ATTEMPTS)", points = 4)
    }

    fun resetFailedPinAttempts() {
        prefs.edit()
            .putInt(KEY_FAILED_PIN_ATTEMPTS, 0)
            .putLong(KEY_PIN_LOCKOUT_UNTIL_MS, 0L)
            .apply()
    }

    fun getAdminPinSalt(): String = prefs.getString(KEY_PIN_SALT, "") ?: ""

    fun getAdminPinHashHex(): String = prefs.getString(KEY_PIN_HASH, "") ?: ""

    fun getLastEscalationTier(): Int = prefs.getInt(KEY_LAST_ESCALATION_TIER, 0)

    fun getPinLockoutUntilMs(): Long = prefs.getLong(KEY_PIN_LOCKOUT_UNTIL_MS, 0L)

    fun clearPinLockout() {
        prefs.edit()
            .putInt(KEY_FAILED_PIN_ATTEMPTS, 0)
            .putLong(KEY_PIN_LOCKOUT_UNTIL_MS, 0L)
            .putInt(KEY_LAST_ESCALATION_TIER, 0)
            .apply()
    }

    fun applyRemotePinCredentials(salt: String, hashHex: String): Boolean {
        val cleanSalt = salt.trim()
        val cleanHash = hashHex.trim().lowercase()
        if (cleanSalt.length < 16 || !cleanHash.matches(Regex("^[a-f0-9]{64}$"))) {
            return false
        }
        prefs.edit()
            .putString(KEY_PIN_SALT, cleanSalt)
            .putString(KEY_PIN_HASH, cleanHash)
            .apply()
        return true
    }

    fun changePin(currentPin: String, newPin: String): PinChangeResult {
        if (!verifyPin(currentPin)) {
            return PinChangeResult.InvalidCurrentPin
        }
        if (!isValidPinFormat(newPin)) {
            return PinChangeResult.InvalidFormat
        }
        val newSalt = generateSalt()
        val newHash = hashPin(newPin, newSalt)
        prefs.edit()
            .putString(KEY_PIN_SALT, newSalt)
            .putString(KEY_PIN_HASH, newHash)
            .apply()
        return PinChangeResult.Success
    }

    fun getAllowedPackages(): Set<String> {
        return prefs.getStringSet(KEY_ALLOWED_PACKAGES, emptySet())?.toSet() ?: emptySet()
    }

    fun setAllowedPackages(packages: Set<String>) {
        prefs.edit()
            .putStringSet(KEY_ALLOWED_PACKAGES, packages.toSet())
            .apply()
    }

    fun setPackageAllowed(packageName: String, allowed: Boolean) {
        val updated = getAllowedPackages().toMutableSet()
        if (allowed) {
            updated.add(packageName)
        } else {
            updated.remove(packageName)
        }
        setAllowedPackages(updated)
    }

    fun isSettingsAndUninstallUnlocked(nowMs: Long = System.currentTimeMillis()): Boolean {
        val untilMs = prefs.getLong(KEY_ADMIN_UNLOCK_UNTIL_MS, 0L)
        if (untilMs > nowMs) {
            return true
        }
        if (untilMs > 0L || prefs.getBoolean(KEY_ADMIN_UNLOCKED, false)) {
            prefs.edit()
                .putBoolean(KEY_ADMIN_UNLOCKED, false)
                .putLong(KEY_ADMIN_UNLOCK_UNTIL_MS, 0L)
                .apply()
        }
        return false
    }

    fun getAdminUnlockUntilMs(): Long = prefs.getLong(KEY_ADMIN_UNLOCK_UNTIL_MS, 0L)

    fun getAdminUnlockDurationMinutes(): Int =
        prefs.getInt(KEY_ADMIN_UNLOCK_DURATION_MINUTES, DEFAULT_ADMIN_UNLOCK_DURATION_MINUTES)
            .coerceIn(MIN_ADMIN_UNLOCK_MINUTES, MAX_ADMIN_UNLOCK_MINUTES)

    fun setAdminUnlockDurationMinutes(minutes: Int) {
        prefs.edit()
            .putInt(
                KEY_ADMIN_UNLOCK_DURATION_MINUTES,
                minutes.coerceIn(MIN_ADMIN_UNLOCK_MINUTES, MAX_ADMIN_UNLOCK_MINUTES)
            )
            .apply()
    }

    fun getAdminUnlockRemainingSeconds(nowMs: Long = System.currentTimeMillis()): Int {
        if (!isSettingsAndUninstallUnlocked(nowMs)) return 0
        return computeRemainingUnlockSeconds(getAdminUnlockUntilMs(), nowMs)
    }

    /**
     * Adjusts the unlock timer by [deltaMinutes] (positive or negative).
     * When currently unlocked, extends or shortens the live expiration timestamp (relocking if <= now).
     * When locked, adjusts the planned unlock duration (1..120 minutes).
     */
    fun adjustAdminUnlockTime(deltaMinutes: Int, nowMs: Long = System.currentTimeMillis()): Boolean {
        if (isSettingsAndUninstallUnlocked(nowMs)) {
            val nextUntil = computeAdjustedUnlockUntilMs(getAdminUnlockUntilMs(), deltaMinutes, nowMs)
            val stillUnlocked = nextUntil > nowMs
            prefs.edit()
                .putLong(KEY_ADMIN_UNLOCK_UNTIL_MS, if (stillUnlocked) nextUntil else 0L)
                .putBoolean(KEY_ADMIN_UNLOCKED, stillUnlocked)
                .apply()
            return stillUnlocked
        }
        val nextDuration = adjustUnlockDurationMinutes(getAdminUnlockDurationMinutes(), deltaMinutes)
        setAdminUnlockDurationMinutes(nextDuration)
        return false
    }

    fun setSettingsAndUninstallUnlocked(
        unlocked: Boolean,
        nowMs: Long = System.currentTimeMillis()
    ) {
        val editor = prefs.edit().putBoolean(KEY_ADMIN_UNLOCKED, unlocked)
        if (unlocked) {
            val durationMins = getAdminUnlockDurationMinutes()
            editor.putLong(KEY_ADMIN_UNLOCK_UNTIL_MS, nowMs + durationMins * 60_000L)
        } else {
            editor.putLong(KEY_ADMIN_UNLOCK_UNTIL_MS, 0L)
        }
        editor.apply()
    }

    fun getApkUpdateManifestUrl(): String =
        prefs.getString(KEY_APK_UPDATE_MANIFEST_URL, "")?.trim().orEmpty()

    fun setApkUpdateManifestUrl(url: String) {
        prefs.edit().putString(KEY_APK_UPDATE_MANIFEST_URL, url.trim()).apply()
    }

    fun getKioskMode(): String = prefs.getString(KEY_KIOSK_MODE, MODE_MULTI_APP) ?: MODE_MULTI_APP

    fun setKioskMode(mode: String) {
        prefs.edit().putString(KEY_KIOSK_MODE, mode).apply()
    }

    fun getSingleAppPackage(): String? = prefs.getString(KEY_SINGLE_APP_PACKAGE, null)

    fun setSingleAppPackage(packageName: String?) {
        prefs.edit().putString(KEY_SINGLE_APP_PACKAGE, packageName).apply()
    }

    fun getKioskTitle(defaultTitle: String): String {
        val saved = prefs.getString(KEY_KIOSK_TITLE, null)?.trim()
        return if (saved.isNullOrEmpty()) defaultTitle else saved
    }

    fun setKioskTitle(title: String) {
        prefs.edit().putString(KEY_KIOSK_TITLE, title.trim()).apply()
    }

    fun isStatusBarDisabled(): Boolean = prefs.getBoolean(KEY_STATUS_BAR_DISABLED, true)
    fun setStatusBarDisabled(disabled: Boolean) =
        prefs.edit().putBoolean(KEY_STATUS_BAR_DISABLED, disabled).apply()

    fun isKeyguardDisabled(): Boolean = prefs.getBoolean(KEY_KEYGUARD_DISABLED, false)
    fun setKeyguardDisabled(disabled: Boolean) =
        prefs.edit().putBoolean(KEY_KEYGUARD_DISABLED, disabled).apply()

    fun isCameraDisabled(): Boolean = prefs.getBoolean(KEY_CAMERA_DISABLED, false)
    fun setCameraDisabled(disabled: Boolean) =
        prefs.edit().putBoolean(KEY_CAMERA_DISABLED, disabled).apply()

    fun isUsbTransferBlocked(): Boolean = prefs.getBoolean(KEY_USB_BLOCKED, true)
    fun setUsbTransferBlocked(blocked: Boolean) =
        prefs.edit().putBoolean(KEY_USB_BLOCKED, blocked).apply()

    fun isDateTimeLocked(): Boolean = prefs.getBoolean(KEY_DATE_TIME_LOCKED, true)
    fun setDateTimeLocked(locked: Boolean) =
        prefs.edit().putBoolean(KEY_DATE_TIME_LOCKED, locked).apply()

    fun isScreenCaptureDisabled(): Boolean = prefs.getBoolean(KEY_SCREEN_CAPTURE_DISABLED, false)
    fun setScreenCaptureDisabled(disabled: Boolean) =
        prefs.edit().putBoolean(KEY_SCREEN_CAPTURE_DISABLED, disabled).apply()

    fun isKeepScreenAwake(): Boolean = prefs.getBoolean(KEY_KEEP_SCREEN_AWAKE, true)
    fun setKeepScreenAwake(awake: Boolean) =
        prefs.edit().putBoolean(KEY_KEEP_SCREEN_AWAKE, awake).apply()

    fun getAllowedDomains(): Set<String> {
        val stored = prefs.getStringSet(KEY_ALLOWED_DOMAINS, null)
        return stored?.toSet() ?: DEFAULT_ALLOWED_DOMAINS
    }

    fun setAllowedDomains(domains: Set<String>) {
        val cleaned = domains.map { it.trim().lowercase().removePrefix("https://").removePrefix("http://").trim('/') }
            .filter { it.isNotEmpty() && !BLOCKED_DISTRACTION_DOMAINS.contains(it) }
            .toSet()
        prefs.edit().putStringSet(KEY_ALLOWED_DOMAINS, cleaned).apply()
    }

    // --- BlockP / BlockerX / BlockerHero Web & Browser Shield Preferences ---

    fun isDisablePornOnBrowsers(): Boolean = prefs.getBoolean(KEY_DISABLE_PORN_BROWSERS, true)
    fun setDisablePornOnBrowsers(enabled: Boolean) =
        prefs.edit().putBoolean(KEY_DISABLE_PORN_BROWSERS, enabled).apply()

    fun isBlockInAppBrowsers(): Boolean = prefs.getBoolean(KEY_BLOCK_IN_APP_BROWSERS, true)
    fun setBlockInAppBrowsers(enabled: Boolean) =
        prefs.edit().putBoolean(KEY_BLOCK_IN_APP_BROWSERS, enabled).apply()

    fun getInAppBrowserWhitelist(): Set<String> {
        val stored = prefs.getStringSet(KEY_IN_APP_BROWSER_WHITELIST, null)
        return stored?.toSet() ?: DEFAULT_IN_APP_BROWSER_WHITELIST
    }

    fun setInAppBrowserWhitelist(packages: Set<String>) {
        val cleaned = packages.map { it.trim() }.filter { it.isNotEmpty() }.toMutableSet()
        cleaned.add("com.kiosk.launcher")
        prefs.edit().putStringSet(KEY_IN_APP_BROWSER_WHITELIST, cleaned).apply()
    }

    fun isBlockUnsupportedBrowsers(): Boolean = prefs.getBoolean(KEY_BLOCK_UNSUPPORTED_BROWSERS, true)
    fun setBlockUnsupportedBrowsers(enabled: Boolean) =
        prefs.edit().putBoolean(KEY_BLOCK_UNSUPPORTED_BROWSERS, enabled).apply()

    fun isBlockShortFormFeeds(): Boolean = prefs.getBoolean(KEY_BLOCK_SHORT_FORM_FEEDS, true)
    fun setBlockShortFormFeeds(enabled: Boolean) =
        prefs.edit().putBoolean(KEY_BLOCK_SHORT_FORM_FEEDS, enabled).apply()

    fun getFamilyDnsMode(): String = prefs.getString(KEY_FAMILY_DNS_MODE, DNS_CLOUDFLARE_FAMILY) ?: DNS_CLOUDFLARE_FAMILY
    fun setFamilyDnsMode(mode: String) =
        prefs.edit().putString(KEY_FAMILY_DNS_MODE, mode).apply()

    fun getBlockedKeywords(): Set<String> {
        val stored = prefs.getStringSet(KEY_BLOCKED_KEYWORDS, null)
        return stored?.toSet() ?: DEFAULT_BLOCKED_KEYWORDS
    }

    fun setBlockedKeywords(keywords: Set<String>) {
        val cleaned = keywords.map { it.trim().lowercase() }.filter { it.length >= 2 }.toSet()
        prefs.edit().putStringSet(KEY_BLOCKED_KEYWORDS, cleaned).apply()
    }

    fun getStrictShieldLockUntilMs(): Long = prefs.getLong(KEY_STRICT_SHIELD_LOCK_UNTIL_MS, 0L)

    fun isStrictShieldLocked(nowMs: Long = System.currentTimeMillis()): Boolean {
        return getStrictShieldLockUntilMs() > nowMs
    }

    fun getStrictShieldRemainingMinutes(nowMs: Long = System.currentTimeMillis()): Int {
        val diff = getStrictShieldLockUntilMs() - nowMs
        return if (diff > 0L) ((diff + 59_999L) / 60_000L).toInt() else 0
    }

    fun lockBlockerShieldsForMinutes(minutes: Int, nowMs: Long = System.currentTimeMillis()) {
        if (minutes <= 0) return
        val until = nowMs + minutes * 60_000L
        if (until > getStrictShieldLockUntilMs()) {
            prefs.edit().putLong(KEY_STRICT_SHIELD_LOCK_UNTIL_MS, until).apply()
        }
    }

    fun setStrictShieldLockUntilMs(untilMs: Long) {
        prefs.edit().putLong(KEY_STRICT_SHIELD_LOCK_UNTIL_MS, untilMs.coerceAtLeast(0L)).apply()
    }

    // --- Optional PC Web Cloud Sync Settings (Strictly Opt-In; OFF by default) ---

    fun isCloudSyncEnabled(): Boolean = prefs.getBoolean(KEY_CLOUD_SYNC_ENABLED, false)

    fun setCloudSyncEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_CLOUD_SYNC_ENABLED, enabled).apply()
    }

    fun getCloudUid(): String = prefs.getString(KEY_CLOUD_UID, "") ?: ""

    fun setCloudUid(uid: String) {
        prefs.edit().putString(KEY_CLOUD_UID, sanitizeCloudId(uid, fallback = "")).apply()
    }

    fun getCloudEmail(): String = prefs.getString(KEY_CLOUD_EMAIL, "") ?: ""

    fun setCloudEmail(email: String) {
        prefs.edit().putString(KEY_CLOUD_EMAIL, email.trim().take(254)).apply()
    }

    fun getCloudRefreshToken(): String = prefs.getString(KEY_CLOUD_REFRESH_TOKEN, "") ?: ""

    fun setCloudRefreshToken(token: String) {
        prefs.edit().putString(KEY_CLOUD_REFRESH_TOKEN, token.trim()).apply()
    }

    fun getCloudDeviceId(): String {
        val existing = prefs.getString(KEY_CLOUD_DEVICE_ID, null)
        if (!existing.isNullOrBlank()) return existing
        val generated = sanitizeCloudId("android-${android.os.Build.MODEL}", fallback = "android-kiosk-1")
        prefs.edit().putString(KEY_CLOUD_DEVICE_ID, generated).apply()
        return generated
    }

    fun setCloudDeviceId(deviceId: String) {
        prefs.edit().putString(KEY_CLOUD_DEVICE_ID, sanitizeCloudId(deviceId, fallback = "android-kiosk-1")).apply()
    }

    fun getCloudDeviceLabel(): String {
        val saved = prefs.getString(KEY_CLOUD_DEVICE_LABEL, null)?.trim()
        if (!saved.isNullOrEmpty()) return saved
        return "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}".trim()
            .ifEmpty { "Android Kiosk Phone" }
            .take(80)
    }

    fun getLastCloudSyncMs(): Long = prefs.getLong(KEY_CLOUD_LAST_SYNC_MS, 0L)

    fun setLastCloudSyncMs(timestampMs: Long) {
        prefs.edit().putLong(KEY_CLOUD_LAST_SYNC_MS, timestampMs.coerceAtLeast(0L)).apply()
    }

    fun isCloudSyncDirty(): Boolean = prefs.getBoolean(KEY_CLOUD_SYNC_DIRTY, false)

    fun setCloudSyncDirty(dirty: Boolean) {
        prefs.edit().putBoolean(KEY_CLOUD_SYNC_DIRTY, dirty).apply()
    }

    // --- AppBlock / Freedom Per-App Time Limits, Quiet Hours & Focus Sessions ---

    fun getAppTimeLimitMinutesMap(): Map<String, Int> {
        val raw = prefs.getString(KEY_APP_TIME_LIMITS_JSON, null) ?: return emptyMap()
        return parseIntMapJson(raw)
    }

    fun getAppDailyLimitMinutes(packageName: String): Int {
        return getAppTimeLimitMinutesMap()[packageName] ?: 0
    }

    fun setAppDailyLimitMinutes(packageName: String, minutes: Int) {
        val updated = getAppTimeLimitMinutesMap().toMutableMap()
        if (minutes <= 0) {
            updated.remove(packageName)
        } else {
            updated[packageName] = minutes.coerceAtMost(MAX_DAILY_APP_LIMIT_MINUTES)
        }
        prefs.edit().putString(KEY_APP_TIME_LIMITS_JSON, encodeIntMapJson(updated)).apply()
    }

    fun ensureUsageDateCurrent(todayIso: String = LocalDate.now().toString()) {
        val storedDate = prefs.getString(KEY_APP_USAGE_DATE, null)
        if (storedDate != todayIso) {
            prefs.edit()
                .putString(KEY_APP_USAGE_DATE, todayIso)
                .putString(KEY_APP_DAILY_USAGE_JSON, "{}")
                .putInt(KEY_BLOCKED_ATTEMPTS_TODAY, 0)
                .apply()
        }
    }

    fun getAppDailyUsageSecondsMap(todayIso: String = LocalDate.now().toString()): Map<String, Int> {
        ensureUsageDateCurrent(todayIso)
        val raw = prefs.getString(KEY_APP_DAILY_USAGE_JSON, null) ?: return emptyMap()
        return parseIntMapJson(raw)
    }

    fun getAppDailyUsageSeconds(packageName: String, todayIso: String = LocalDate.now().toString()): Int {
        return getAppDailyUsageSecondsMap(todayIso)[packageName] ?: 0
    }

    fun addAppUsageSeconds(
        packageName: String,
        deltaSeconds: Int,
        todayIso: String = LocalDate.now().toString()
    ): Int {
        if (deltaSeconds <= 0) return getAppDailyUsageSeconds(packageName, todayIso)
        val updated = getAppDailyUsageSecondsMap(todayIso).toMutableMap()
        val next = (updated[packageName] ?: 0) + deltaSeconds
        updated[packageName] = next
        prefs.edit()
            .putString(KEY_APP_USAGE_DATE, todayIso)
            .putString(KEY_APP_DAILY_USAGE_JSON, encodeIntMapJson(updated))
            .apply()
        return next
    }

    fun resetAppDailyUsage(packageName: String, todayIso: String = LocalDate.now().toString()) {
        val updated = getAppDailyUsageSecondsMap(todayIso).toMutableMap()
        updated.remove(packageName)
        prefs.edit()
            .putString(KEY_APP_USAGE_DATE, todayIso)
            .putString(KEY_APP_DAILY_USAGE_JSON, encodeIntMapJson(updated))
            .apply()
    }

    fun getAppRemainingSeconds(
        packageName: String,
        todayIso: String = LocalDate.now().toString()
    ): Int? {
        val limitMinutes = getAppDailyLimitMinutes(packageName)
        if (limitMinutes <= 0) return null
        val usedSeconds = getAppDailyUsageSeconds(packageName, todayIso)
        return (limitMinutes * 60 - usedSeconds).coerceAtLeast(0)
    }

    fun isAppDailyLimitReached(
        packageName: String,
        todayIso: String = LocalDate.now().toString()
    ): Boolean {
        val remaining = getAppRemainingSeconds(packageName, todayIso) ?: return false
        return remaining <= 0
    }

    fun isDowntimeEnabled(): Boolean = prefs.getBoolean(KEY_DOWNTIME_ENABLED, false)
    fun setDowntimeEnabled(enabled: Boolean) =
        prefs.edit().putBoolean(KEY_DOWNTIME_ENABLED, enabled).apply()

    fun getDowntimeStartMinutes(): Int = prefs.getInt(KEY_DOWNTIME_START_MINUTES, DEFAULT_DOWNTIME_START_MINUTES)
    fun setDowntimeStartMinutes(minutesFromMidnight: Int) =
        prefs.edit().putInt(KEY_DOWNTIME_START_MINUTES, minutesFromMidnight.coerceIn(0, 1439)).apply()

    fun getDowntimeEndMinutes(): Int = prefs.getInt(KEY_DOWNTIME_END_MINUTES, DEFAULT_DOWNTIME_END_MINUTES)
    fun setDowntimeEndMinutes(minutesFromMidnight: Int) =
        prefs.edit().putInt(KEY_DOWNTIME_END_MINUTES, minutesFromMidnight.coerceIn(0, 1439)).apply()

    fun isDowntimeActiveNow(minutesFromMidnight: Int = currentMinutesFromMidnight()): Boolean {
        if (!isDowntimeEnabled()) return false
        return isWithinScheduleWindow(minutesFromMidnight, getDowntimeStartMinutes(), getDowntimeEndMinutes())
    }

    fun getFocusBlockUntilMs(): Long = prefs.getLong(KEY_FOCUS_BLOCK_UNTIL_MS, 0L)

    fun isFocusBlockActive(nowMs: Long = System.currentTimeMillis()): Boolean {
        return getFocusBlockUntilMs() > nowMs
    }

    fun getFocusBlockRemainingMinutes(nowMs: Long = System.currentTimeMillis()): Int {
        val diff = getFocusBlockUntilMs() - nowMs
        return if (diff > 0L) ((diff + 59_999L) / 60_000L).toInt() else 0
    }

    fun startFocusBlockMinutes(minutes: Int, nowMs: Long = System.currentTimeMillis()) {
        if (minutes <= 0) {
            prefs.edit().putLong(KEY_FOCUS_BLOCK_UNTIL_MS, 0L).apply()
            return
        }
        prefs.edit().putLong(KEY_FOCUS_BLOCK_UNTIL_MS, nowMs + minutes * 60_000L).apply()
    }

    fun getBlockedAttemptsToday(todayIso: String = LocalDate.now().toString()): Int {
        ensureUsageDateCurrent(todayIso)
        return prefs.getInt(KEY_BLOCKED_ATTEMPTS_TODAY, 0)
    }

    fun incrementBlockedAttemptsToday(todayIso: String = LocalDate.now().toString()): Int {
        ensureUsageDateCurrent(todayIso)
        val next = prefs.getInt(KEY_BLOCKED_ATTEMPTS_TODAY, 0) + 1
        prefs.edit().putInt(KEY_BLOCKED_ATTEMPTS_TODAY, next).apply()
        return next
    }

    fun getPanicLockUntilMs(): Long = prefs.getLong(KEY_PANIC_LOCK_UNTIL_MS, 0L)

    fun isPanicLockActive(nowMs: Long = System.currentTimeMillis()): Boolean {
        return getPanicLockUntilMs() > nowMs
    }

    fun getPanicLockRemainingMinutes(nowMs: Long = System.currentTimeMillis()): Int {
        return computePanicBlockRemainingMinutes(getPanicLockUntilMs(), nowMs)
    }

    fun getPanicTriggerCount(): Int = prefs.getInt(KEY_PANIC_COUNT, 0)

    fun activatePanicLockdown(
        minutes: Int = PANIC_RECOVERY_MINUTES,
        nowMs: Long = System.currentTimeMillis()
    ): Int {
        val nextUntil = maxOf(getPanicLockUntilMs(), nowMs + minutes.coerceAtLeast(1) * 60_000L)
        val nextCount = getPanicTriggerCount() + 1
        prefs.edit()
            .putLong(KEY_PANIC_LOCK_UNTIL_MS, nextUntil)
            .putInt(KEY_PANIC_COUNT, nextCount)
            .putBoolean(KEY_ADMIN_UNLOCKED, false)
            .putLong(KEY_ADMIN_UNLOCK_UNTIL_MS, 0L)
            .apply()
        lockBlockerShieldsForMinutes(minutes, nowMs)
        appendTamperWarningLog(
            "Emergency Panic Triggered (#$nextCount): killed active apps, wiped clipboard & locked screen to Kiosk Dashboard (${minutes}m).",
            nowMs
        )
        return getPanicLockRemainingMinutes(nowMs)
    }

    fun clearPanicLockdown() {
        prefs.edit().putLong(KEY_PANIC_LOCK_UNTIL_MS, 0L).apply()
    }

    /**
     * Evaluates Panic Lockdown + AppBlock / Freedom limits before opening or while running an allowlisted app.
     * Returns null when permitted, or a user-facing block reason string when restricted.
     */
    fun getTimeOrScheduleBlockReason(
        packageName: String,
        todayIso: String = LocalDate.now().toString(),
        minutesFromMidnight: Int = currentMinutesFromMidnight(),
        nowMs: Long = System.currentTimeMillis()
    ): String? {
        if (isSettingsAndUninstallUnlocked()) return null

        if (isPanicLockActive(nowMs) && packageName !in PANIC_EXEMPT_PACKAGES) {
            val minsLeft = getPanicLockRemainingMinutes(nowMs)
            return "Locked to Kiosk Dashboard by Emergency Panic Mode ($minsLeft min remaining)."
        }

        val limitMinutes = getAppDailyLimitMinutes(packageName)
        if (limitMinutes > 0 && isAppDailyLimitReached(packageName, todayIso)) {
            return "Daily time limit reached (${limitMinutes}m/day used today)."
        }

        val isEssentialOrFocus = packageName in ESSENTIAL_FOCUS_PACKAGES
        if (!isEssentialOrFocus && isFocusBlockActive(nowMs)) {
            val minsLeft = getFocusBlockRemainingMinutes(nowMs)
            return "Blocked by Freedom Focus Lock ($minsLeft min remaining)."
        }

        if (!isEssentialOrFocus && isDowntimeActiveNow(minutesFromMidnight)) {
            return "Blocked by Scheduled Quiet Hours (${formatMinutesAsClock(getDowntimeStartMinutes())}–${formatMinutesAsClock(getDowntimeEndMinutes())})."
        }

        return null
    }

    // --- Bypass & Tamper Diagnostics (Hidden Distrust Score + Escalating Lockouts) ---

    data class TamperCheckResult(
        val warningIssued: Boolean,
        val triggeredExtraLockoutSeconds: Int,
        val autoLockedShields: Boolean,
        val warningMessage: String?
    )

    internal fun getDistrustScore(): Int = prefs.getInt(KEY_DISTRUST_SCORE, 0)

    fun getTamperWarningLogs(): List<String> {
        val raw = prefs.getString(KEY_TAMPER_WARNING_LOGS, null) ?: return emptyList()
        return try {
            val arr = org.json.JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    val item = arr.optString(i, "")
                    if (item.isNotBlank()) add(item)
                }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun resetTamperDiagnostics() {
        prefs.edit()
            .putInt(KEY_DISTRUST_SCORE, 0)
            .putInt(KEY_LAST_ESCALATION_TIER, 0)
            .putString(KEY_ADMIN_TOGGLE_TIMESTAMPS, "[]")
            .putString(KEY_BLOCKED_SURGE_TIMESTAMPS, "[]")
            .putString(KEY_TAMPER_WARNING_LOGS, "[]")
            .apply()
    }

    fun recordAdminSettingMutation(
        actionName: String,
        nowMs: Long = System.currentTimeMillis()
    ): TamperCheckResult {
        val recent = appendAndPruneTimestamps(KEY_ADMIN_TOGGLE_TIMESTAMPS, nowMs, TAMPER_WINDOW_MS)
        if (!shouldFlagRapidAdminToggle(recent, nowMs, TAMPER_WINDOW_MS, RAPID_ADMIN_TOGGLE_THRESHOLD)) {
            return TamperCheckResult(
                warningIssued = false,
                triggeredExtraLockoutSeconds = 0,
                autoLockedShields = false,
                warningMessage = null
            )
        }
        prefs.edit().putString(KEY_ADMIN_TOGGLE_TIMESTAMPS, "[]").apply()
        val msg = "Tamper Warning: Rapid admin setting toggling detected ($actionName, ${recent.size} changes in <15s)."
        appendTamperWarningLog(msg, nowMs)
        return addDistrustAndEscalate(delta = 20, reason = msg, nowMs = nowMs)
    }

    fun recordBypassAttempt(
        source: String,
        points: Int = 5,
        nowMs: Long = System.currentTimeMillis()
    ): TamperCheckResult {
        val recent = appendAndPruneTimestamps(KEY_BLOCKED_SURGE_TIMESTAMPS, nowMs, TAMPER_WINDOW_MS)
        val surge = recent.size >= RAPID_BYPASS_SURGE_THRESHOLD
        val totalDelta = points + if (surge) 15 else 0
        val warningMsg = if (surge) {
            prefs.edit().putString(KEY_BLOCKED_SURGE_TIMESTAMPS, "[]").apply()
            val msg = "Tamper Warning: Repeated bypass probing detected ($source)."
            appendTamperWarningLog(msg, nowMs)
            msg
        } else {
            null
        }
        val escalated = addDistrustAndEscalate(delta = totalDelta, reason = warningMsg ?: source, nowMs = nowMs)
        return escalated.copy(
            warningIssued = surge || escalated.warningIssued,
            warningMessage = escalated.warningMessage ?: warningMsg
        )
    }

    private fun addDistrustAndEscalate(
        delta: Int,
        reason: String,
        nowMs: Long
    ): TamperCheckResult {
        val nextScore = (getDistrustScore() + delta).coerceAtMost(200)
        val prevTier = prefs.getInt(KEY_LAST_ESCALATION_TIER, 0)
        val nextTier = when {
            nextScore >= DISTRUST_TIER2_THRESHOLD -> 2
            nextScore >= DISTRUST_TIER1_THRESHOLD -> 1
            else -> 0
        }
        val editor = prefs.edit().putInt(KEY_DISTRUST_SCORE, nextScore)
        var extraLockoutSec = 0
        var autoLockedShields = false
        var warningMsg: String? = null

        if (nextTier > prevTier) {
            extraLockoutSec = computeEscalationLockoutSeconds(nextTier)
            val newUntil = maxOf(
                prefs.getLong(KEY_PIN_LOCKOUT_UNTIL_MS, 0L),
                nowMs + extraLockoutSec * 1000L
            )
            editor.putLong(KEY_PIN_LOCKOUT_UNTIL_MS, newUntil)
            editor.putInt(KEY_LAST_ESCALATION_TIER, nextTier)
            if (nextTier >= 2) {
                lockBlockerShieldsForMinutes(30, nowMs)
                autoLockedShields = true
                warningMsg = "Tamper Warning: Severe bypass anomaly — enforced +${extraLockoutSec}s lockout & 30m Shield Lock ($reason)."
            } else {
                warningMsg = "Tamper Warning: Bypass threshold exceeded — triggered extra +${extraLockoutSec}s security lockout ($reason)."
            }
            appendTamperWarningLog(warningMsg, nowMs)
        }
        editor.apply()
        return TamperCheckResult(
            warningIssued = warningMsg != null,
            triggeredExtraLockoutSeconds = extraLockoutSec,
            autoLockedShields = autoLockedShields,
            warningMessage = warningMsg
        )
    }

    private fun appendAndPruneTimestamps(key: String, nowMs: Long, windowMs: Long): List<Long> {
        val raw = prefs.getString(key, null)
        val cutoff = nowMs - windowMs
        val list = mutableListOf<Long>()
        if (raw != null) {
            try {
                val arr = org.json.JSONArray(raw)
                for (i in 0 until arr.length()) {
                    val ts = arr.optLong(i, 0L)
                    if (ts >= cutoff && ts <= nowMs + 1000L) {
                        list.add(ts)
                    }
                }
            } catch (_: Exception) {
            }
        }
        list.add(nowMs)
        val out = org.json.JSONArray()
        list.takeLast(20).forEach { out.put(it) }
        prefs.edit().putString(key, out.toString()).apply()
        return list
    }

    private fun appendTamperWarningLog(message: String, nowMs: Long) {
        val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date(nowMs))
        val entry = "[$stamp] $message"
        val existing = getTamperWarningLogs().toMutableList()
        existing.add(0, entry)
        val arr = org.json.JSONArray()
        existing.take(MAX_TAMPER_LOGS).forEach { arr.put(it) }
        prefs.edit().putString(KEY_TAMPER_WARNING_LOGS, arr.toString()).apply()
    }

    enum class PinChangeResult {
        Success,
        InvalidCurrentPin,
        InvalidFormat
    }

    companion object {
        const val PREFS_NAME = "kiosk_device_protected_prefs"
        const val DEFAULT_PIN = "1234"
        const val MIN_PIN_LENGTH = 4
        const val MAX_PIN_LENGTH = 50
        const val MAX_FAILED_PIN_ATTEMPTS = 5
        const val PIN_LOCKOUT_DURATION_MS = 30_000L

        const val MODE_MULTI_APP = "multi_app"
        const val MODE_SINGLE_APP = "single_app"
        const val MODE_KIOSK_BROWSER = "kiosk_browser"

        const val SELF_IMPROVEMENT_PACKAGE = "com.kiosk.selfimprovement"
        const val KIOSK_BROWSER_PACKAGE = "com.kiosk.browser"

        const val MAX_DAILY_APP_LIMIT_MINUTES = 480
        const val DEFAULT_DOWNTIME_START_MINUTES = 22 * 60 // 22:00
        const val DEFAULT_DOWNTIME_END_MINUTES = 6 * 60    // 06:00

        const val TAMPER_WINDOW_MS = 15_000L
        const val RAPID_ADMIN_TOGGLE_THRESHOLD = 4
        const val RAPID_BYPASS_SURGE_THRESHOLD = 3
        const val DISTRUST_TIER1_THRESHOLD = 40
        const val DISTRUST_TIER2_THRESHOLD = 70
        const val TIER1_EXTRA_LOCKOUT_SECONDS = 90
        const val TIER2_EXTRA_LOCKOUT_SECONDS = 300
        const val MAX_TAMPER_LOGS = 40

        const val DNS_OFF = "off"
        const val DNS_CLOUDFLARE_FAMILY = "cloudflare"
        const val DNS_CLEANBROWSING_ADULT = "cleanbrowsing"

        const val DNS_HOST_CLOUDFLARE_FAMILY = "family.cloudflare-dns.com"
        const val DNS_HOST_CLEANBROWSING_ADULT = "adult-filter-dns.cleanbrowsing.org"

        const val PANIC_RECOVERY_MINUTES = 15

        val ESSENTIAL_FOCUS_PACKAGES = setOf(
            "com.kiosk.launcher",
            SELF_IMPROVEMENT_PACKAGE,
            "com.android.calculator2"
        )

        val PANIC_EXEMPT_PACKAGES = setOf(
            "com.kiosk.launcher",
            SELF_IMPROVEMENT_PACKAGE
        )

        val DEFAULT_ALLOWED_DOMAINS = setOf(
            "wikipedia.org",
            "developer.android.com",
            "coursera.org",
            "scholar.google.com"
        )

        val BLOCKED_DISTRACTION_DOMAINS = setOf(
            "instagram.com",
            "tiktok.com",
            "facebook.com",
            "x.com",
            "twitter.com",
            "reddit.com",
            "youtube.com",
            "pornhub.com",
            "xvideos.com",
            "xnxx.com",
            "onlyfans.com",
            "twitch.tv",
            "chaturbate.com",
            "redtube.com",
            "youporn.com"
        )

        val DEFAULT_BLOCKED_KEYWORDS = setOf(
            "porn",
            "xxx",
            "nsfw",
            "onlyfans",
            "hentai",
            "xvideos",
            "xnxx",
            "brazzers"
        )

        val DEFAULT_IN_APP_BROWSER_WHITELIST = setOf(
            "com.kiosk.launcher",
            "com.google.android.apps.docs",
            "com.Slack"
        )

        private const val KEY_PIN_HASH = "pin_hash_sha256"
        private const val KEY_PIN_SALT = "pin_salt"
        private const val KEY_FAILED_PIN_ATTEMPTS = "failed_pin_attempts"
        private const val KEY_PIN_LOCKOUT_UNTIL_MS = "pin_lockout_until_ms"
        private const val KEY_ALLOWED_PACKAGES = "allowed_kiosk_packages"
        private const val KEY_ADMIN_UNLOCKED = "temp_admin_unlocked"
        private const val KEY_ADMIN_UNLOCK_UNTIL_MS = "temp_admin_unlock_until_ms"
        private const val KEY_ADMIN_UNLOCK_DURATION_MINUTES = "temp_admin_unlock_duration_minutes"
        private const val KEY_APK_UPDATE_MANIFEST_URL = "apk_update_manifest_url"
        private const val KEY_KIOSK_MODE = "kiosk_operation_mode"

        const val DEFAULT_ADMIN_UNLOCK_DURATION_MINUTES = 5
        const val MIN_ADMIN_UNLOCK_MINUTES = 1
        const val MAX_ADMIN_UNLOCK_MINUTES = 120
        private const val KEY_SINGLE_APP_PACKAGE = "kiosk_single_app_package"
        private const val KEY_KIOSK_TITLE = "kiosk_branding_title"
        private const val KEY_STATUS_BAR_DISABLED = "policy_status_bar_disabled"
        private const val KEY_KEYGUARD_DISABLED = "policy_keyguard_disabled"
        private const val KEY_CAMERA_DISABLED = "policy_camera_disabled"
        private const val KEY_USB_BLOCKED = "policy_usb_transfer_blocked"
        private const val KEY_DATE_TIME_LOCKED = "policy_date_time_locked"
        private const val KEY_SCREEN_CAPTURE_DISABLED = "policy_screen_capture_disabled"
        private const val KEY_KEEP_SCREEN_AWAKE = "policy_keep_screen_awake"
        private const val KEY_ALLOWED_DOMAINS = "kiosk_browser_allowed_domains"

        private const val KEY_DISABLE_PORN_BROWSERS = "blocker_disable_porn_browsers"
        private const val KEY_BLOCK_IN_APP_BROWSERS = "blocker_in_app_browsers"
        private const val KEY_IN_APP_BROWSER_WHITELIST = "blocker_in_app_browser_whitelist"
        private const val KEY_BLOCK_UNSUPPORTED_BROWSERS = "blocker_unsupported_browsers"
        private const val KEY_BLOCK_SHORT_FORM_FEEDS = "blocker_short_form_feeds"
        private const val KEY_FAMILY_DNS_MODE = "blocker_family_dns_mode"
        private const val KEY_BLOCKED_KEYWORDS = "blocker_keywords"
        private const val KEY_STRICT_SHIELD_LOCK_UNTIL_MS = "blocker_strict_lock_until_ms"

        private const val KEY_APP_TIME_LIMITS_JSON = "appblock_daily_limits_json"
        private const val KEY_APP_DAILY_USAGE_JSON = "appblock_daily_usage_json"
        private const val KEY_APP_USAGE_DATE = "appblock_usage_date_iso"
        private const val KEY_DOWNTIME_ENABLED = "appblock_downtime_enabled"
        private const val KEY_DOWNTIME_START_MINUTES = "appblock_downtime_start_minutes"
        private const val KEY_DOWNTIME_END_MINUTES = "appblock_downtime_end_minutes"
        private const val KEY_FOCUS_BLOCK_UNTIL_MS = "freedom_focus_block_until_ms"
        private const val KEY_BLOCKED_ATTEMPTS_TODAY = "appblock_blocked_attempts_today"

        private const val KEY_DISTRUST_SCORE = "diag_hidden_distrust_score"
        private const val KEY_LAST_ESCALATION_TIER = "diag_last_escalation_tier"
        private const val KEY_ADMIN_TOGGLE_TIMESTAMPS = "diag_admin_toggle_timestamps"
        private const val KEY_BLOCKED_SURGE_TIMESTAMPS = "diag_blocked_surge_timestamps"
        private const val KEY_TAMPER_WARNING_LOGS = "diag_tamper_warning_logs"
        private const val KEY_PANIC_LOCK_UNTIL_MS = "panic_lock_until_ms"
        private const val KEY_PANIC_COUNT = "panic_trigger_count"

        private const val KEY_CLOUD_SYNC_ENABLED = "cloud_sync_enabled_opt_in"
        private const val KEY_CLOUD_UID = "cloud_sync_account_uid"
        private const val KEY_CLOUD_EMAIL = "cloud_sync_account_email"
        private const val KEY_CLOUD_REFRESH_TOKEN = "cloud_sync_refresh_token"
        private const val KEY_CLOUD_DEVICE_ID = "cloud_sync_device_id"
        private const val KEY_CLOUD_DEVICE_LABEL = "cloud_sync_device_label"
        private const val KEY_CLOUD_LAST_SYNC_MS = "cloud_sync_last_sync_ms"
        private const val KEY_CLOUD_SYNC_DIRTY = "cloud_sync_dirty_queue"

        fun sanitizeCloudId(raw: String, fallback: String = "android-kiosk-1"): String {
            val cleaned = raw.trim()
                .replace(Regex("[^a-zA-Z0-9_\\-]"), "_")
                .take(128)
            return if (cleaned.isNotEmpty()) cleaned else fallback
        }

        fun computePanicBlockRemainingMinutes(panicUntilMs: Long, nowMs: Long): Int {
            val diff = panicUntilMs - nowMs
            return if (diff > 0L) ((diff + 59_999L) / 60_000L).toInt() else 0
        }

        fun shouldFlagRapidAdminToggle(
            timestampsMs: List<Long>,
            nowMs: Long,
            windowMs: Long = TAMPER_WINDOW_MS,
            threshold: Int = RAPID_ADMIN_TOGGLE_THRESHOLD
        ): Boolean {
            val cutoff = nowMs - windowMs
            return timestampsMs.count { it in cutoff..(nowMs + 1000L) } >= threshold
        }

        fun computeEscalationLockoutSeconds(tier: Int): Int = when {
            tier >= 2 -> TIER2_EXTRA_LOCKOUT_SECONDS
            tier == 1 -> TIER1_EXTRA_LOCKOUT_SECONDS
            else -> 0
        }

        /**
         * Allows any printable character (letters, digits, symbols, spaces inside)
         * between 4 and 50 characters inclusive.
         */
        fun isValidPinFormat(pin: String): Boolean {
            return pin.length in MIN_PIN_LENGTH..MAX_PIN_LENGTH &&
                pin.isNotBlank() &&
                pin.none { it.isISOControl() }
        }

        fun isWithinScheduleWindow(
            minutesFromMidnight: Int,
            startMinutes: Int,
            endMinutes: Int
        ): Boolean {
            val now = ((minutesFromMidnight % 1440) + 1440) % 1440
            val start = ((startMinutes % 1440) + 1440) % 1440
            val end = ((endMinutes % 1440) + 1440) % 1440
            if (start == end) return false
            return if (start < end) {
                now in start until end
            } else {
                now >= start || now < end
            }
        }

        fun currentMinutesFromMidnight(): Int {
            val cal = java.util.Calendar.getInstance()
            return cal.get(java.util.Calendar.HOUR_OF_DAY) * 60 + cal.get(java.util.Calendar.MINUTE)
        }

        fun formatMinutesAsClock(minutesFromMidnight: Int): String {
            val normalized = ((minutesFromMidnight % 1440) + 1440) % 1440
            return String.format(java.util.Locale.US, "%02d:%02d", normalized / 60, normalized % 60)
        }

        internal fun parseIntMapJson(raw: String): Map<String, Int> {
            val result = mutableMapOf<String, Int>()
            return try {
                val obj = org.json.JSONObject(raw)
                val keys = obj.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    val value = obj.optInt(key, 0)
                    if (key.isNotBlank() && value > 0) {
                        result[key] = value
                    }
                }
                result
            } catch (_: Exception) {
                emptyMap()
            }
        }

        internal fun encodeIntMapJson(map: Map<String, Int>): String {
            val obj = org.json.JSONObject()
            map.forEach { (k, v) ->
                if (k.isNotBlank() && v > 0) {
                    obj.put(k, v)
                }
            }
            return obj.toString()
        }

        fun extractHost(rawUrl: String): String {
            val normalized = if (rawUrl.contains("://")) rawUrl else "https://$rawUrl"
            return try {
                (Uri.parse(normalized).host ?: "").lowercase().removePrefix("www.")
            } catch (_: Exception) {
                normalized.substringAfter("://").substringBefore("/").substringBefore(":").lowercase().removePrefix("www.")
            }
        }

        fun detectBlockedKeywordOrFeed(
            rawText: String,
            blockedKeywords: Set<String> = DEFAULT_BLOCKED_KEYWORDS,
            blockShortFormFeeds: Boolean = true
        ): String? {
            val lower = rawText.lowercase()
            if (lower.isBlank()) return null

            if (blockShortFormFeeds) {
                if (lower.contains("/shorts") || lower.contains("youtube.com/shorts") ||
                    lower.contains("/reels") || lower.contains("instagram.com/reels") ||
                    lower.contains("tiktok.com")
                ) {
                    return "Short-form video feed (/shorts or /reels)"
                }
            }

            val keywordMatch = blockedKeywords.firstOrNull { kw ->
                val clean = kw.trim().lowercase()
                clean.isNotEmpty() && lower.contains(clean)
            }
            if (keywordMatch != null) {
                return "Blocked keyword ($keywordMatch)"
            }
            return null
        }

        fun isUrlAllowedInKioskBrowser(
            rawUrl: String,
            allowedDomains: Set<String>,
            blockedKeywords: Set<String> = DEFAULT_BLOCKED_KEYWORDS,
            blockShortFormFeeds: Boolean = true
        ): Boolean {
            val host = extractHost(rawUrl)
            if (host.isEmpty()) return false
            if (BLOCKED_DISTRACTION_DOMAINS.any { blocked -> host == blocked || host.endsWith(".$blocked") }) {
                return false
            }
            if (detectBlockedKeywordOrFeed(rawUrl, blockedKeywords, blockShortFormFeeds) != null) {
                return false
            }
            return allowedDomains.any { allowed ->
                val clean = allowed.trim().lowercase().removePrefix("www.")
                clean.isNotEmpty() && (host == clean || host.endsWith(".$clean"))
            }
        }

        fun isInAppBrowserPermitted(
            packageName: String,
            whitelist: Set<String>
        ): Boolean {
            return packageName == "com.kiosk.launcher" || whitelist.contains(packageName)
        }

        fun adjustUnlockDurationMinutes(currentMinutes: Int, deltaMinutes: Int): Int {
            return (currentMinutes + deltaMinutes).coerceIn(MIN_ADMIN_UNLOCK_MINUTES, MAX_ADMIN_UNLOCK_MINUTES)
        }

        fun computeAdjustedUnlockUntilMs(currentUntilMs: Long, deltaMinutes: Int, nowMs: Long): Long {
            val shifted = currentUntilMs + deltaMinutes * 60_000L
            if (shifted <= nowMs) return 0L
            val maxAllowed = nowMs + MAX_ADMIN_UNLOCK_MINUTES * 60_000L
            return shifted.coerceAtMost(maxAllowed)
        }

        fun computeRemainingUnlockSeconds(untilMs: Long, nowMs: Long): Int {
            val diff = untilMs - nowMs
            return if (diff > 0L) ((diff + 999L) / 1000L).toInt() else 0
        }

        data class ApkReleaseManifest(
            val versionCode: Int,
            val versionName: String,
            val downloadUrl: String,
            val releaseNotes: String,
            val sha256: String
        )

        fun isNewerAppVersion(
            remoteVersionCode: Int,
            currentVersionCode: Int,
            remoteVersionName: String = "",
            currentVersionName: String = ""
        ): Boolean {
            if (remoteVersionCode > currentVersionCode) return true
            if (remoteVersionCode in 1 until currentVersionCode) return false
            val rParts = remoteVersionName.trim().removePrefix("v").split('.').mapNotNull { it.toIntOrNull() }
            val cParts = currentVersionName.trim().removePrefix("v").split('.').mapNotNull { it.toIntOrNull() }
            val maxLen = maxOf(rParts.size, cParts.size)
            for (i in 0 until maxLen) {
                val r = rParts.getOrElse(i) { 0 }
                val c = cParts.getOrElse(i) { 0 }
                if (r > c) return true
                if (r < c) return false
            }
            return false
        }

        fun parseUpdateManifestJson(rawJson: String, baseManifestUrl: String = ""): ApkReleaseManifest? {
            return try {
                val obj = org.json.JSONObject(rawJson)
                // 1. KioskOS manifest format (/api/apk/latest)
                val directDownload = obj.optString("downloadUrl", "").trim()
                if (obj.has("versionCode") || directDownload.isNotEmpty()) {
                    val code = obj.optInt("versionCode", 0)
                    val name = obj.optString("versionName", if (code > 0) "$code.0" else "").trim()
                    val resolvedUrl = resolveManifestUrl(directDownload, baseManifestUrl)
                    if (resolvedUrl.isEmpty()) return null
                    return ApkReleaseManifest(
                        versionCode = code,
                        versionName = name,
                        downloadUrl = resolvedUrl,
                        releaseNotes = obj.optString("releaseNotes", "").trim(),
                        sha256 = obj.optString("sha256", "").trim().lowercase()
                    )
                }

                // 2. GitHub Releases API format (/repos/<owner>/<repo>/releases/latest)
                val assets = obj.optJSONArray("assets")
                if (assets != null) {
                    for (i in 0 until assets.length()) {
                        val asset = assets.optJSONObject(i) ?: continue
                        val assetName = asset.optString("name", "")
                        val url = asset.optString("browser_download_url", "").trim()
                        if (assetName.endsWith(".apk", ignoreCase = true) && url.startsWith("https://")) {
                            val tag = obj.optString("tag_name", "").trim().removePrefix("v")
                            return ApkReleaseManifest(
                                versionCode = 0,
                                versionName = tag.ifEmpty { assetName },
                                downloadUrl = url,
                                releaseNotes = obj.optString("body", "").trim().take(400),
                                sha256 = ""
                            )
                        }
                    }
                }
                null
            } catch (_: Exception) {
                null
            }
        }

        internal fun resolveManifestUrl(rawUrl: String, baseManifestUrl: String): String {
            if (rawUrl.isBlank()) return ""
            if (rawUrl.startsWith("https://") || rawUrl.startsWith("http://")) return rawUrl
            if (rawUrl.startsWith("/") && (baseManifestUrl.startsWith("https://") || baseManifestUrl.startsWith("http://"))) {
                return try {
                    val uri = Uri.parse(baseManifestUrl)
                    val scheme = uri.scheme ?: return ""
                    val authority = uri.authority ?: return ""
                    "$scheme://$authority$rawUrl"
                } catch (_: Exception) {
                    ""
                }
            }
            return ""
        }

        internal fun generateSalt(): String {
            val bytes = ByteArray(16)
            SecureRandom().nextBytes(bytes)
            return bytes.joinToString("") { "%02x".format(it) }
        }

        internal fun hashPin(pin: String, salt: String): String {
            val digest = MessageDigest.getInstance("SHA-256")
            val hashBytes = digest.digest("$salt:$pin".toByteArray(Charsets.UTF_8))
            return hashBytes.joinToString("") { "%02x".format(it) }
        }
    }
}
