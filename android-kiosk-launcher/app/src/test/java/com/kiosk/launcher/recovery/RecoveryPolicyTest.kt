package com.kiosk.launcher.recovery

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The watchdog may only restore the kiosk when one of its own screens was in front and the
 * process then went silent. Everything else — a kiosk app in front, the lock screen, a dark
 * display, the admin window, an update install, another launcher, the kiosk switched off — must
 * be left alone.
 */
class RecoveryPolicyTest {

    private val now = 1_000_000L

    private fun decide(
        kiosk: Boolean? = true,
        home: Boolean = true,
        uiVisible: Boolean = true,
        heartbeatAgeMs: Long = 1_000L,
        heartbeatMissing: Boolean = false,
        adminWindow: Boolean = false,
        installing: Boolean = false
    ) = RecoveryPolicy.decide(
        kioskEnabled = kiosk,
        isDefaultLauncher = home,
        kioskUiVisible = uiVisible,
        lastHeartbeatMs = if (heartbeatMissing) 0L else now - heartbeatAgeMs,
        nowMs = now,
        adminWindowOpen = adminWindow,
        installingUpdate = installing
    )

    @Test
    fun aVisibleKioskWithAFreshHeartbeatIsLeftAlone() {
        assertEquals(RecoveryPolicy.Action.NONE, decide())
    }

    @Test
    fun aVisibleKioskThatStoppedRefreshingIsRestored() {
        assertEquals(
            RecoveryPolicy.Action.RESTORE,
            decide(heartbeatAgeMs = RecoveryPolicy.STALE_AFTER_MS + 1)
        )
        assertEquals(RecoveryPolicy.Action.RESTORE, decide(heartbeatAgeMs = 10 * 60_000L))
    }

    @Test
    fun theLastFreshMomentIsStillAlive() {
        assertEquals(
            RecoveryPolicy.Action.NONE,
            decide(heartbeatAgeMs = RecoveryPolicy.STALE_AFTER_MS)
        )
    }

    @Test
    fun aMissingHeartbeatCountsAsSilence() {
        assertEquals(RecoveryPolicy.Action.RESTORE, decide(heartbeatMissing = true))
    }

    @Test
    fun aKioskThatWasNotOnScreenIsNotPulledBack() {
        // A kiosk app, the lock screen or a dark display pauses every one of our activities.
        assertEquals(
            RecoveryPolicy.Action.NONE,
            decide(uiVisible = false, heartbeatAgeMs = 10 * 60_000L)
        )
        assertEquals(RecoveryPolicy.Action.NONE, decide(uiVisible = false, heartbeatMissing = true))
    }

    @Test
    fun theAdminWindowIsNeverInterrupted() {
        assertEquals(
            RecoveryPolicy.Action.NONE,
            decide(heartbeatAgeMs = 10 * 60_000L, adminWindow = true)
        )
    }

    @Test
    fun anUpdateInstallIsNeverInterrupted() {
        assertEquals(
            RecoveryPolicy.Action.NONE,
            decide(heartbeatAgeMs = 10 * 60_000L, installing = true)
        )
    }

    @Test
    fun aKioskThatDoesNotOwnHomeIsNeverFoughtFor() {
        assertEquals(
            RecoveryPolicy.Action.NONE,
            decide(home = false, heartbeatAgeMs = 10 * 60_000L)
        )
    }

    @Test
    fun aKioskThatIsTurnedOffIsNeverRestored() {
        assertEquals(
            RecoveryPolicy.Action.NONE,
            decide(kiosk = false, heartbeatAgeMs = 10 * 60_000L)
        )
        assertEquals(
            RecoveryPolicy.Action.NONE,
            decide(kiosk = null, heartbeatAgeMs = 10 * 60_000L)
        )
    }

    @Test
    fun theWatchdogOnlyRunsForAKioskThatOwnsHome() {
        assertTrue(RecoveryPolicy.shouldWatch(kioskEnabled = true, isDefaultLauncher = true))
        assertFalse(RecoveryPolicy.shouldWatch(kioskEnabled = false, isDefaultLauncher = true))
        assertFalse(RecoveryPolicy.shouldWatch(kioskEnabled = null, isDefaultLauncher = true))
        assertFalse(RecoveryPolicy.shouldWatch(kioskEnabled = true, isDefaultLauncher = false))
    }
}
