package com.kiosk.launcher.data

import com.kiosk.launcher.data.LockScreenConfig.LockAccent
import com.kiosk.launcher.data.LockScreenConfig.LockCardStyle
import com.kiosk.launcher.data.LockScreenConfig.LockClockStyle
import com.kiosk.launcher.data.LockScreenConfig.LockCornerStyle
import com.kiosk.launcher.data.LockScreenConfig.LockTheme
import com.kiosk.launcher.data.LockScreenConfig.LockWidgetSize
import com.kiosk.launcher.data.LockScreenConfig.LockWidgetSlot
import com.kiosk.launcher.data.LockScreenConfig.LockWidgetType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LockScreenConfigTest {

    @Test
    fun `default slots include all 9 widget types`() {
        val defaults = LockScreenConfig.defaultSlots()
        assertEquals(LockWidgetType.entries.size, defaults.size)
        assertEquals(LockWidgetType.entries.toSet(), defaults.map { it.type }.toSet())
    }

    @Test
    fun `encode and decode round trip preserves order, visibility, and sizes`() {
        val custom = listOf(
            LockWidgetSlot(LockWidgetType.FOCUS, enabled = true, size = LockWidgetSize.LARGE),
            LockWidgetSlot(LockWidgetType.BATTERY, enabled = false, size = LockWidgetSize.MEDIUM),
            LockWidgetSlot(LockWidgetType.NOTE, enabled = true, size = LockWidgetSize.SMALL)
        )
        val decoded = LockScreenConfig.decodeSlots(LockScreenConfig.encodeSlots(custom))
        assertEquals(LockWidgetType.FOCUS, decoded[0].type)
        assertTrue(decoded[0].enabled)
        assertEquals(LockWidgetSize.LARGE, decoded[0].size)

        assertEquals(LockWidgetType.BATTERY, decoded[1].type)
        assertEquals(false, decoded[1].enabled)
        assertEquals(LockWidgetSize.MEDIUM, decoded[1].size)

        assertEquals(LockWidgetType.NOTE, decoded[2].type)
        assertEquals(LockWidgetSize.entries.size, decoded.size)
    }

    @Test
    fun `decode tolerates malformed or blank input by returning fallback`() {
        val fallback = LockScreenConfig.defaultSlots(batteryEnabled = false)
        assertEquals(fallback, LockScreenConfig.decodeSlots(null, fallback))
        assertEquals(fallback, LockScreenConfig.decodeSlots("", fallback))
        assertEquals(fallback, LockScreenConfig.decodeSlots("unknown_widget:1:small\n:::", fallback))
    }

    @Test
    fun `buildWidgetRows pairs consecutive small widgets and isolates medium and large`() {
        val slots = listOf(
            LockWidgetSlot(LockWidgetType.BATTERY, true, LockWidgetSize.SMALL),
            LockWidgetSlot(LockWidgetType.STREAK, true, LockWidgetSize.SMALL),
            LockWidgetSlot(LockWidgetType.HABITS, true, LockWidgetSize.SMALL),
            LockWidgetSlot(LockWidgetType.NOTE, true, LockWidgetSize.MEDIUM),
            LockWidgetSlot(LockWidgetType.GOALS, false, LockWidgetSize.LARGE),
            LockWidgetSlot(LockWidgetType.FOCUS, true, LockWidgetSize.LARGE)
        )
        val rows = LockScreenConfig.buildWidgetRows(slots)
        assertEquals(4, rows.size)
        assertEquals(listOf(LockWidgetType.BATTERY, LockWidgetType.STREAK), rows[0].map { it.type })
        assertEquals(listOf(LockWidgetType.HABITS), rows[1].map { it.type })
        assertEquals(listOf(LockWidgetType.NOTE), rows[2].map { it.type })
        assertEquals(listOf(LockWidgetType.FOCUS), rows[3].map { it.type })
    }

    @Test
    fun `applyGlobalSize makes every widget uniform and uniformSizeOrNull reports it`() {
        val slots = LockScreenConfig.defaultSlots()
        assertNull(LockScreenConfig.uniformSizeOrNull(slots))

        val allMedium = LockScreenConfig.applyGlobalSize(slots, LockWidgetSize.MEDIUM)
        assertEquals(LockWidgetSize.MEDIUM, LockScreenConfig.uniformSizeOrNull(allMedium))
        val rows = LockScreenConfig.buildWidgetRows(allMedium)
        assertTrue(rows.all { it.size == 1 && it.first().size == LockWidgetSize.MEDIUM })

        val allLarge = LockScreenConfig.applyGlobalSize(slots, LockWidgetSize.LARGE)
        assertEquals(LockWidgetSize.LARGE, LockScreenConfig.uniformSizeOrNull(allLarge))
    }

    @Test
    fun `moveSlot reorders within bounds`() {
        val slots = LockScreenConfig.defaultSlots()
        val movedUp = LockScreenConfig.moveSlot(slots, LockWidgetType.STREAK, -1)
        assertEquals(LockWidgetType.STREAK, movedUp[0].type)
        assertEquals(LockWidgetType.BATTERY, movedUp[1].type)

        val clampedTop = LockScreenConfig.moveSlot(movedUp, LockWidgetType.STREAK, -5)
        assertEquals(LockWidgetType.STREAK, clampedTop[0].type)
    }

    @Test
    fun `style enum lookups fall back safely on unknown ids`() {
        assertEquals(LockTheme.MIDNIGHT, LockTheme.fromId("unknown"))
        assertEquals(LockAccent.TEAL, LockAccent.fromId(null))
        assertEquals(LockClockStyle.EDITORIAL, LockClockStyle.fromId("bad"))
        assertEquals(LockCardStyle.FROSTED, LockCardStyle.fromId("bad"))
        assertEquals(LockCornerStyle.ROUNDED, LockCornerStyle.fromId("bad"))
    }
}
