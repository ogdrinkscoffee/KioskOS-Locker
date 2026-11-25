package com.kiosk.launcher.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The update feed is remote input and the only thing standing between a broken file and
 * a working kiosk. Anything incomplete has to read as "no update", never as trusted.
 *
 * Runs under Robolectric because `org.json` is a unimplemented stub in a plain JVM test,
 * which would make every parse look like a rejected feed and test nothing at all.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class UpdateManifestTest {

    private val sha = "a".repeat(64)

    private fun json(
        version: String = "1.3.0",
        code: Int = 7,
        url: String = "https://example.com/downloads/IroncladOS.apk",
        hash: String = sha,
        size: Long = 5_000_000L
    ) = """
        {"version":"$version","versionCode":$code,"apkUrl":"$url","sha256":"$hash","sizeBytes":$size}
    """.trimIndent()

    @Test
    fun parsesACompleteManifest() {
        val manifest = UpdateManifest.parse(json())
        assertNotNull(manifest)
        assertEquals("1.3.0", manifest!!.versionName)
        assertEquals(7, manifest.versionCode)
        assertEquals(sha, manifest.sha256)
    }

    @Test
    fun aHigherVersionCodeIsAnUpdate() {
        val manifest = UpdateManifest.parse(json(code = 7))!!
        assertTrue(manifest.isNewerThan(6))
        assertFalse(manifest.isNewerThan(7))
        assertFalse(manifest.isNewerThan(8))
    }

    @Test
    fun unsignedOrInsecureFeedsAreRejected() {
        assertNull("http must never be trusted", UpdateManifest.parse(json(url = "http://example.com/a.apk")))
        assertNull("hash is mandatory", UpdateManifest.parse(json(hash = "")))
        assertNull("short hash is not a sha256", UpdateManifest.parse(json(hash = "abc")))
        assertNull("non-hex hash is invalid", UpdateManifest.parse(json(hash = "z".repeat(64))))
        assertNull("size is required", UpdateManifest.parse(json(size = 0)))
        assertNull("version code is required", UpdateManifest.parse(json(code = 0)))
        assertNull("version name is required", UpdateManifest.parse(json(version = " ")))
        assertNull("garbage is not a manifest", UpdateManifest.parse("<html>oops</html>"))
    }

    @Test
    fun uppercaseHashesAreNormalised() {
        val manifest = UpdateManifest.parse(json(hash = "AB".repeat(32)))!!
        assertEquals("ab".repeat(32), manifest.sha256)
    }

    @Test
    fun aFolderOrFileUrlBothResolveToTheManifest() {
        assertEquals(
            "https://example.com/downloads/latest.json",
            UpdateManifest.manifestUrl("https://example.com/downloads")
        )
        assertEquals(
            "https://example.com/downloads/latest.json",
            UpdateManifest.manifestUrl("https://example.com/downloads/")
        )
        assertEquals(
            "https://example.com/meta/latest.json",
            UpdateManifest.manifestUrl("https://example.com/meta/latest.json")
        )
    }

    @Test
    fun resolvesRelativeApkUrlAndSiteRootCandidates() {
        val manifest = UpdateManifest.parse(
            json(url = "IroncladOS.apk"),
            feedUrl = "https://example.com/downloads/latest.json"
        )
        assertNotNull(manifest)
        assertEquals("https://example.com/downloads/IroncladOS.apk", manifest!!.apkUrl)

        assertEquals(
            listOf(
                "https://example.com/downloads/latest.json",
                "https://example.com/latest.json"
            ),
            UpdateManifest.candidateUrls("https://example.com")
        )

        assertEquals(
            listOf(
                "https://raw.githubusercontent.com/ogdrinkscoffee/KioskOS-Locker/main/public/downloads/latest.json",
                "https://raw.githubusercontent.com/ogdrinkscoffee/KioskOS-Locker/master/public/downloads/latest.json"
            ),
            UpdateManifest.candidateUrls("https://github.com/ogdrinkscoffee/KioskOS-Locker")
        )

        assertEquals(
            "https://example.com/downloads/IroncladOS.apk",
            UpdateManifest.siblingApkUrl("https://example.com/downloads/latest.json")
        )
    }
}
