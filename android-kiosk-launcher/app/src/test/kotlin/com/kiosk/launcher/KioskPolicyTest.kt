package com.kiosk.launcher

import com.kiosk.launcher.data.KioskPreferences
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class KioskPolicyTest {

    @Test
    fun pinFormatAllowsAlphanumericAndSymbolsUpTo50Characters() {
        assertTrue(KioskPreferences.isValidPinFormat("1234"))
        assertTrue(KioskPreferences.isValidPinFormat("KioskAdmin!2026"))
        val fiftyCharPassphrase = "A".repeat(50)
        assertEquals(50, fiftyCharPassphrase.length)
        assertTrue(KioskPreferences.isValidPinFormat(fiftyCharPassphrase))

        assertFalse(KioskPreferences.isValidPinFormat("123"))
        assertFalse(KioskPreferences.isValidPinFormat("    "))
        assertFalse(KioskPreferences.isValidPinFormat("A".repeat(51)))
    }

    @Test
    fun browserAllowlistBlocksAdultSocialKeywordsAndShorts() {
        val allowed = setOf("wikipedia.org", "developer.android.com")
        assertTrue(KioskPreferences.isUrlAllowedInKioskBrowser("https://en.wikipedia.org/wiki/Focus", allowed))
        assertTrue(KioskPreferences.isUrlAllowedInKioskBrowser("https://developer.android.com/work/dpc/dedicated-devices", allowed))
        assertFalse(KioskPreferences.isUrlAllowedInKioskBrowser("https://www.instagram.com/reels", allowed))
        assertFalse(KioskPreferences.isUrlAllowedInKioskBrowser("https://pornhub.com", allowed))
        assertFalse(KioskPreferences.isUrlAllowedInKioskBrowser("https://en.wikipedia.org/w/index.php?search=nsfw", allowed))
        assertFalse(KioskPreferences.isUrlAllowedInKioskBrowser("https://wikipedia.org/shorts", allowed))
        assertFalse(KioskPreferences.isUrlAllowedInKioskBrowser("https://example.org", allowed))
    }

    @Test
    fun keywordAndInAppBrowserWhitelistRulesWorkDeterministically() {
        assertNotNull(KioskPreferences.detectBlockedKeywordOrFeed("best porn search"))
        assertNotNull(KioskPreferences.detectBlockedKeywordOrFeed("https://youtube.com/shorts/abc"))
        assertNull(KioskPreferences.detectBlockedKeywordOrFeed("kotlin android documentation"))

        val whitelist = setOf("com.kiosk.launcher", "com.google.android.apps.docs")
        assertTrue(KioskPreferences.isInAppBrowserPermitted("com.google.android.apps.docs", whitelist))
        assertTrue(KioskPreferences.isInAppBrowserPermitted("com.kiosk.launcher", whitelist))
        assertFalse(KioskPreferences.isInAppBrowserPermitted("com.instagram.android", whitelist))
    }

    @Test
    fun saltedSha256HashingIsDeterministicPerSalt() {
        val salt = "0123456789abcdef"
        val hashA = KioskPreferences.hashPin(KioskPreferences.DEFAULT_PIN, salt)
        val hashB = KioskPreferences.hashPin(KioskPreferences.DEFAULT_PIN, salt)
        assertEquals(hashA, hashB)
        assertFalse(hashA == KioskPreferences.hashPin("Kiosk!Strong#99", salt))
    }

    @Test
    fun quietHoursScheduleWindowHandlesOvernightAndDaytimeWindows() {
        // Overnight 22:00 (1320) -> 06:00 (360)
        assertTrue(KioskPreferences.isWithinScheduleWindow(23 * 60, 22 * 60, 6 * 60))
        assertTrue(KioskPreferences.isWithinScheduleWindow(2 * 60, 22 * 60, 6 * 60))
        assertFalse(KioskPreferences.isWithinScheduleWindow(14 * 60, 22 * 60, 6 * 60))

        // Same-day 09:00 -> 17:00
        assertTrue(KioskPreferences.isWithinScheduleWindow(12 * 60, 9 * 60, 17 * 60))
        assertFalse(KioskPreferences.isWithinScheduleWindow(20 * 60, 9 * 60, 17 * 60))

        assertEquals("22:00", KioskPreferences.formatMinutesAsClock(22 * 60))
        assertEquals("06:00", KioskPreferences.formatMinutesAsClock(6 * 60))
    }

    @Test
    fun rapidAdminToggleTamperDetectionAndLockoutEscalation() {
        val now = 1_700_000_000_000L
        assertFalse(KioskPreferences.shouldFlagRapidAdminToggle(listOf(now - 2000L, now - 1000L, now), now))
        assertTrue(KioskPreferences.shouldFlagRapidAdminToggle(listOf(now - 4000L, now - 3000L, now - 1000L, now), now))
        assertEquals(0, KioskPreferences.computeEscalationLockoutSeconds(0))
        assertEquals(90, KioskPreferences.computeEscalationLockoutSeconds(1))
        assertEquals(300, KioskPreferences.computeEscalationLockoutSeconds(2))
    }

    @Test
    fun emergencyPanicCooldownComputesRemainingMinutes() {
        val now = 1_700_000_000_000L
        assertEquals(15, KioskPreferences.computePanicBlockRemainingMinutes(now + 15 * 60_000L, now))
        assertEquals(1, KioskPreferences.computePanicBlockRemainingMinutes(now + 1_000L, now))
        assertEquals(0, KioskPreferences.computePanicBlockRemainingMinutes(now - 1_000L, now))
    }

    @Test
    fun cloudSyncIdSanitizationEnforcesFirestoreIdContract() {
        assertEquals("pixel_8_pro", KioskPreferences.sanitizeCloudId("pixel 8 pro"))
        assertEquals("android-kiosk-1", KioskPreferences.sanitizeCloudId("   ", "android-kiosk-1"))
        assertEquals(128, KioskPreferences.sanitizeCloudId("a".repeat(200)).length)
    }

    @Test
    fun timedAdminUnlockDurationAndExpirationAdjustCleanly() {
        assertEquals(6, KioskPreferences.adjustUnlockDurationMinutes(5, 1))
        assertEquals(10, KioskPreferences.adjustUnlockDurationMinutes(5, 5))
        assertEquals(1, KioskPreferences.adjustUnlockDurationMinutes(2, -5))
        assertEquals(120, KioskPreferences.adjustUnlockDurationMinutes(118, 10))

        val now = 1_700_000_000_000L
        val untilFiveMin = now + 5 * 60_000L
        val extended = KioskPreferences.computeAdjustedUnlockUntilMs(untilFiveMin, 5, now)
        assertEquals(600, KioskPreferences.computeRemainingUnlockSeconds(extended, now))

        val expired = KioskPreferences.computeAdjustedUnlockUntilMs(now + 60_000L, -2, now)
        assertEquals(0L, expired)
        assertEquals(0, KioskPreferences.computeRemainingUnlockSeconds(expired, now))
    }

    @Test
    fun apkVersionComparisonAndManifestParsingWorkForServerAndGitHub() {
        assertTrue(KioskPreferences.isNewerAppVersion(2, 1, "1.1.0", "1.0.0"))
        assertTrue(KioskPreferences.isNewerAppVersion(0, 1, "1.2.0", "1.1.0"))
        assertFalse(KioskPreferences.isNewerAppVersion(1, 2, "1.0.0", "1.1.0"))
        assertFalse(KioskPreferences.isNewerAppVersion(0, 1, "1.0.0", "1.0.0"))

        val serverJson = """
            {
              "versionCode": 3,
              "versionName": "1.2.0",
              "downloadUrl": "/api/apk/download",
              "releaseNotes": "Fixed Home, Keyguard, and Status Bar",
              "sha256": "ABCDEF"
            }
        """.trimIndent()
        val parsedServer = KioskPreferences.parseUpdateManifestJson(
            serverJson,
            "https://kiosk.example.com/api/apk/latest"
        )
        assertNotNull(parsedServer)
        assertEquals(3, parsedServer?.versionCode)
        assertEquals("https://kiosk.example.com/api/apk/download", parsedServer?.downloadUrl)
        assertEquals("abcdef", parsedServer?.sha256)

        val ghJson = """
            {
              "tag_name": "v1.3.0",
              "body": "Automated APK release",
              "assets": [
                {
                  "name": "kiosk-release.apk",
                  "browser_download_url": "https://github.com/org/repo/releases/download/v1.3.0/kiosk-release.apk"
                }
              ]
            }
        """.trimIndent()
        val parsedGh = KioskPreferences.parseUpdateManifestJson(ghJson)
        assertNotNull(parsedGh)
        assertEquals("1.3.0", parsedGh?.versionName)
        assertTrue(parsedGh?.downloadUrl?.endsWith(".apk") == true)
    }
}
