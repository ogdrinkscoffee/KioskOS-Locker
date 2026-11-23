package com.kiosk.launcher.diagnostics

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class DiagnosticsCollectorTest {

    private val context: Context = ApplicationProvider.getApplicationContext()

    private fun collect() = DiagnosticsCollector(context).collect(nowMs = 1_700_000_000_000L)

    @Test
    fun `reports every guard layer even on an unprovisioned device`() {
        val guards = collect().guards

        assertEquals(7, guards.size)
        assertTrue(guards.none { it.state == GuardStatus.State.UNKNOWN })
    }

    @Test
    fun `an ordinary install is not reported as device owner`() {
        val owner = collect().guards.first { it.label == context.getString(com.kiosk.launcher.R.string.diag_guard_device_owner) }

        assertEquals(GuardStatus.State.INACTIVE, owner.state)
        assertTrue(owner.detail.orEmpty().contains("set-device-owner"))
    }

    @Test
    fun `restrictions are probed rather than assumed`() {
        val restrictions = collect().restrictions

        assertTrue(restrictions.isNotEmpty())
        assertTrue(restrictions.any { it.label.contains("Camera") })
        assertTrue(restrictions.any { it.label.contains("Screenshots") })
    }

    @Test
    fun `collected snapshot renders as a complete report`() {
        val text = DiagnosticsReport.render(collect())

        assertTrue(text.contains("GUARD LAYERS"))
        assertTrue(text.contains("RESTRICTIONS IN EFFECT"))
        assertTrue(text.contains("RECENT POLICY LOG"))
        assertFalse(text.isBlank())
    }
}
