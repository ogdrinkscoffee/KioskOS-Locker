package com.kiosk.launcher.diagnostics

import com.kiosk.launcher.data.PolicyEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DiagnosticsReportTest {

    private val headings = DiagnosticsHeadings(
        title = "Ironclad OS diagnostics report",
        generated = "Generated",
        guards = "GUARD LAYERS",
        restrictions = "RESTRICTIONS IN EFFECT",
        log = "RECENT POLICY LOG",
        noEvents = "No policy events recorded yet.",
        legend = "Legend: [ OK ] active · [FAIL] not active · [ ?? ] could not be read"
    )

    private fun time(value: Long) = "T$value"

    private fun snapshot(
        guards: List<GuardStatus> = listOf(GuardStatus("Device owner", GuardStatus.State.ACTIVE)),
        restrictions: List<GuardStatus> = emptyList(),
        events: List<PolicyEvent> = emptyList(),
        generatedAt: Long = 1_700_000_000_000L
    ) = DiagnosticsSnapshot(
        headings = headings,
        appVersion = "1.2.0",
        versionCode = 5,
        androidRelease = "14",
        sdkInt = 34,
        deviceModel = "Google Pixel 7",
        generatedAt = generatedAt,
        guards = guards,
        restrictions = restrictions,
        events = events
    )

    private fun render(
        guards: List<GuardStatus> = listOf(GuardStatus("Device owner", GuardStatus.State.ACTIVE)),
        restrictions: List<GuardStatus> = emptyList(),
        events: List<PolicyEvent> = emptyList()
    ) = DiagnosticsReport.render(snapshot(guards, restrictions, events), ::time)

    @Test
    fun `active guard is marked ok`() {
        assertTrue(render().contains("[ OK ] Device owner"))
    }

    @Test
    fun `inactive guard is marked fail and keeps its detail`() {
        val text = render(
            guards = listOf(
                GuardStatus(
                    "Window guard accessibility service",
                    GuardStatus.State.INACTIVE,
                    "Not enabled in Android accessibility settings"
                )
            )
        )

        assertTrue(text.contains("[FAIL] Window guard accessibility service — Not enabled in Android accessibility settings"))
        assertFalse(text.contains("[ OK ] Window guard accessibility service"))
    }

    @Test
    fun `unreadable guard is reported as unknown rather than healthy`() {
        val text = render(guards = listOf(GuardStatus("Boot restore receiver", GuardStatus.State.UNKNOWN)))

        assertTrue(text.contains("[ ?? ] Boot restore receiver"))
        assertFalse(text.contains("[ OK ] Boot restore receiver"))
    }

    @Test
    fun `every guard row appears once`() {
        val text = render(
            guards = listOf(
                GuardStatus("Device owner", GuardStatus.State.INACTIVE, "adb shell dpm set-device-owner"),
                GuardStatus("Device admin", GuardStatus.State.ACTIVE),
                GuardStatus("Lock task mode", GuardStatus.State.INACTIVE),
                GuardStatus("Window guard accessibility service", GuardStatus.State.ACTIVE),
                GuardStatus("Boot restore receiver", GuardStatus.State.ACTIVE),
                GuardStatus("Window guard switched on in settings", GuardStatus.State.INACTIVE, "Off in Admin")
            )
        )

        val guardSection = text.substringAfter("GUARD LAYERS").substringBefore("RESTRICTIONS IN EFFECT")
        assertEquals(3, Regex("\\[FAIL]").findAll(guardSection).count())
        assertEquals(3, Regex("\\[ OK ]").findAll(guardSection).count())
        listOf(
            "Device owner",
            "Device admin",
            "Lock task mode",
            "Window guard accessibility service",
            "Boot restore receiver",
            "Window guard switched on in settings"
        ).forEach { assertTrue(text.contains(it)) }
    }

    @Test
    fun `sections are rendered in reading order`() {
        val text = render(
            restrictions = listOf(GuardStatus("Safe boot blocked", GuardStatus.State.ACTIVE)),
            events = listOf(PolicyEvent(1L, "Policy applied"))
        )

        val guardsIndex = text.indexOf("GUARD LAYERS")
        val restrictionsIndex = text.indexOf("RESTRICTIONS IN EFFECT")
        val logIndex = text.indexOf("RECENT POLICY LOG")

        assertTrue(guardsIndex in 0 until restrictionsIndex)
        assertTrue(restrictionsIndex < logIndex)
    }

    @Test
    fun `drift between toggle and device state is spelled out`() {
        val text = render(
            restrictions = listOf(
                GuardStatus(
                    "Factory reset blocked",
                    GuardStatus.State.ACTIVE,
                    "Requested off in Admin, still in effect (re-apply the policy)"
                ),
                GuardStatus(
                    "Camera blocked",
                    GuardStatus.State.INACTIVE,
                    "Requested on in Admin, not in effect (needs device owner)"
                )
            )
        )

        assertTrue(text.contains("Factory reset blocked — Requested off in Admin, still in effect"))
        assertTrue(text.contains("Camera blocked — Requested on in Admin, not in effect"))
    }

    @Test
    fun `header carries app, android and device information`() {
        val text = render()

        assertTrue(text.startsWith("Ironclad OS diagnostics report"))
        assertTrue(text.contains("Generated T1700000000000"))
        assertTrue(text.contains("Ironclad OS 1.2.0 (5) · Android 14 (SDK 34) · Google Pixel 7"))
    }

    @Test
    fun `empty policy log says so instead of looking truncated`() {
        assertTrue(render().contains("No policy events recorded yet."))
    }

    @Test
    fun `policy log keeps newest-first order with timestamps`() {
        val text = render(
            events = listOf(
                PolicyEvent(200L, "Panic lockdown engaged (15m)"),
                PolicyEvent(100L, "Policy applied")
            )
        )

        val first = text.indexOf("T200  Panic lockdown engaged (15m)")
        val second = text.indexOf("T100  Policy applied")

        assertTrue(first in 0 until second)
    }

    @Test
    fun `policy log is capped so a report stays small enough to paste`() {
        val events = (1..30).map { PolicyEvent(it.toLong(), "event $it") }
        val text = render(events = events)

        assertTrue(text.contains("event 20"))
        assertFalse(text.contains("event 21"))
    }

    @Test
    fun `empty sections are explicit rather than blank`() {
        val text = render(restrictions = emptyList())

        assertTrue(text.contains("RESTRICTIONS IN EFFECT\n  —\n"))
    }

    @Test
    fun `legend closes the report`() {
        assertTrue(render().trimEnd().endsWith(headings.legend))
    }
}
