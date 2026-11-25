package com.kiosk.launcher.admin

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The "uninstall blocked" toggle only really releases a device when a pass clears every
 * package that could still hold a block: the ones recorded by this build and, for
 * leftovers from older builds, every package that is currently installed.
 */
class UninstallBlocksTest {

    @Test
    fun blockingNeverIncludesThisApp() {
        val targets = UninstallBlocks.targets(
            installed = listOf("com.kiosk.launcher", "com.example.app"),
            ownPackage = "com.kiosk.launcher"
        )
        assertEquals(listOf("com.example.app"), targets)
    }

    @Test
    fun blockingDeduplicatesThePackageList() {
        val targets = UninstallBlocks.targets(
            installed = listOf("com.example.app", "com.example.app", "com.kiosk.launcher"),
            ownPackage = "com.kiosk.launcher"
        )
        assertEquals(listOf("com.example.app"), targets)
    }

    @Test
    fun releaseCoversInstalledPackagesAndRecordedOnes() {
        val release = UninstallBlocks.releaseTargets(
            recorded = setOf("com.example.app", "com.example.removed"),
            installedForSweep = listOf("com.example.app", "com.kiosk.launcher"),
            ownPackage = "com.kiosk.launcher"
        )
        assertEquals(setOf("com.example.app", "com.example.removed"), release.toSet())
    }

    @Test
    fun releaseWithoutRecordsStillCoversInstalledApps() {
        val release = UninstallBlocks.releaseTargets(
            recorded = emptySet(),
            installedForSweep = listOf("com.example.app"),
            ownPackage = "com.kiosk.launcher"
        )
        assertEquals(listOf("com.example.app"), release)
    }

    @Test
    fun releaseNeverTouchesThisApp() {
        val release = UninstallBlocks.releaseTargets(
            recorded = emptySet(),
            installedForSweep = listOf("com.kiosk.launcher"),
            ownPackage = "com.kiosk.launcher"
        )
        assertEquals(emptyList<String>(), release)
    }

    @Test
    fun afterTheSweepOnlyRecordedPackagesAreReleased() {
        val release = UninstallBlocks.releaseTargets(
            recorded = setOf("com.example.app"),
            installedForSweep = null,
            ownPackage = "com.kiosk.launcher"
        )
        assertEquals(listOf("com.example.app"), release)
    }

    @Test
    fun aColdStartWithoutBlocksTouchesNothing() {
        val release = UninstallBlocks.releaseTargets(
            recorded = emptySet(),
            installedForSweep = null,
            ownPackage = "com.kiosk.launcher"
        )
        assertEquals(emptyList<String>(), release)
    }

    @Test
    fun aKioskThatIsOffDoesNoWorkAfterTheLegacySweep() {
        assertFalse(UninstallBlocks.releaseNeeded(emptySet(), legacySweepDone = true))
    }

    @Test
    fun theLegacySweepRunsOnce() {
        assertTrue(UninstallBlocks.releaseNeeded(emptySet(), legacySweepDone = false))
    }

    @Test
    fun recordedBlocksAreStillReleasedAfterTheSweep() {
        assertTrue(
            UninstallBlocks.releaseNeeded(setOf("com.example.app"), legacySweepDone = true)
        )
    }

    @Test
    fun blockTargetsSkipsProtectedSystemGoogleAndCallingPackages() {
        val protectedPkgs = setOf(
            "com.google.android.gms",
            "com.android.vending",
            "com.google.android.dialer"
        )
        val targets = UninstallBlocks.blockTargets(
            installed = listOf(
                "com.kiosk.launcher",
                "com.google.android.gms",
                "com.android.vending",
                "com.google.android.dialer",
                "com.example.app"
            ),
            ownPackage = "com.kiosk.launcher",
            protectedPackages = protectedPkgs
        )
        assertEquals(listOf("com.example.app"), targets)
    }
}
