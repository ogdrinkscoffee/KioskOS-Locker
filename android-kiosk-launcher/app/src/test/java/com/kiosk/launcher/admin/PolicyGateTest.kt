package com.kiosk.launcher.admin

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Enforcement needs the explicit opt-in, Home ownership and a scheduled kiosk window; the off state
 * releases on its own so turning the kiosk off never depends on Home changing first.
 */
class PolicyGateTest {

    private fun decide(
        enabled: Boolean?,
        home: Boolean,
        otherHome: Boolean,
        scheduled: Boolean = true
    ) = PolicyGate.decide(
        kioskEnabled = enabled,
        isDefaultLauncher = home,
        anotherLauncherOwnsHome = otherHome,
        scheduleKioskActive = scheduled
    )

    @Test
    fun anEnabledKioskThatOwnsHomeIsEnforced() {
        assertEquals(PolicyGate.Action.ENFORCE, decide(true, home = true, otherHome = false))
    }

    @Test
    fun anEnabledKioskWaitingForHomeLeavesTheDeviceAlone() {
        assertEquals(PolicyGate.Action.LEAVE, decide(true, home = false, otherHome = false))
    }

    @Test
    fun turningTheKioskOffReleasesEvenWhileThisAppIsStillHome() {
        assertEquals(PolicyGate.Action.RELEASE, decide(false, home = true, otherHome = false))
        assertEquals(PolicyGate.Action.RELEASE, decide(false, home = false, otherHome = true))
        assertEquals(PolicyGate.Action.RELEASE, decide(false, home = false, otherHome = false))
    }

    @Test
    fun anotherLauncherOwningHomeAlwaysReleases() {
        assertEquals(PolicyGate.Action.RELEASE, decide(true, home = false, otherHome = true))
        assertEquals(PolicyGate.Action.RELEASE, decide(null, home = false, otherHome = true))
    }

    @Test
    fun anUnknownStateIsNeverGuessed() {
        assertEquals(PolicyGate.Action.LEAVE, decide(null, home = true, otherHome = false))
        assertEquals(PolicyGate.Action.LEAVE, decide(null, home = false, otherHome = false))
    }

    @Test
    fun outsideAScheduledWindowTheDeviceIsReleasedButTheOptInIsKept() {
        assertEquals(
            PolicyGate.Action.RELEASE,
            decide(true, home = true, otherHome = false, scheduled = false)
        )
        // Release also closes the temporary admin window: nothing may stay locked out of hours.
        assertEquals(
            PolicyGate.Action.RELEASE,
            decide(true, home = false, otherHome = false, scheduled = false)
        )
    }

    @Test
    fun theScheduleCannotEnforceAKioskThatWasSwitchedOff() {
        assertEquals(
            PolicyGate.Action.RELEASE,
            decide(false, home = true, otherHome = false, scheduled = true)
        )
        assertEquals(
            PolicyGate.Action.LEAVE,
            decide(null, home = true, otherHome = false, scheduled = true)
        )
    }
}
