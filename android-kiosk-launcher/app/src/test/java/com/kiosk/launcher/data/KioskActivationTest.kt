package com.kiosk.launcher.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * An upgrade must not quietly un-kiosk a device that was already running as Home. Only an
 * install with no explicit choice and no Home ownership has never opted in and is released.
 */
class KioskActivationTest {

    private val noChoice: Boolean? = null

    @Test
    fun recordedStateAlwaysWins() {
        val on = KioskActivation.resolve(recorded = true, legacyDeclined = true, homeIsKiosk = false)
        assertTrue(on.enabled)
        assertEquals(KioskActivation.Source.EXPLICIT, on.source)
        assertFalse(on.migrated)

        val off = KioskActivation.resolve(recorded = false, legacyDeclined = false, homeIsKiosk = true)
        assertFalse(off.enabled)
        assertEquals(KioskActivation.Source.EXPLICIT, off.source)
    }

    @Test
    fun anExplicitChoiceMadeInOneThreeOneIsMigrated() {
        val optedIn = KioskActivation.resolve(noChoice, legacyDeclined = false, homeIsKiosk = false)
        assertTrue(optedIn.enabled)
        assertEquals(KioskActivation.Source.LEGACY_SWITCH, optedIn.source)

        val optedOut = KioskActivation.resolve(noChoice, legacyDeclined = true, homeIsKiosk = true)
        assertFalse(optedOut.enabled)
        assertEquals(KioskActivation.Source.LEGACY_SWITCH, optedOut.source)
    }

    @Test
    fun aDeviceAlreadyPinnedAsHomeStaysAKiosk() {
        val decision = KioskActivation.resolve(noChoice, legacyDeclined = null, homeIsKiosk = true)
        assertTrue(decision.enabled)
        assertEquals(KioskActivation.Source.HOME_OWNER, decision.source)
        assertTrue(decision.migrated)
    }

    @Test
    fun aDeviceThatNeverOwnedHomeIsReleased() {
        val decision = KioskActivation.resolve(noChoice, legacyDeclined = null, homeIsKiosk = false)
        assertFalse(decision.enabled)
        assertEquals(KioskActivation.Source.NEVER_OPTED_IN, decision.source)
        assertTrue(decision.migrated)
    }

    @Test
    fun everyLegacyCombinationIsDecidedOnce() {
        for (legacy in listOf(null, false, true)) {
            for (home in booleanArrayOf(false, true)) {
                val decision = KioskActivation.resolve(null, legacy, home)
                assertEquals(
                    "legacy=$legacy home=$home",
                    when (legacy) {
                        null -> home
                        else -> !legacy
                    },
                    decision.enabled
                )
            }
        }
    }
}
