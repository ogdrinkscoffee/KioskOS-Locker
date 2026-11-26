package com.kiosk.launcher.data

import org.junit.Assert.assertEquals
import org.junit.Test

class LockScreenShortcutsTest {

    @Test
    fun `encode keeps the admin order and drops blanks`() {
        assertEquals(
            "com.a\ncom.b",
            LockScreenShortcuts.encode(listOf(" com.a ", "", "com.b", "com.a"))
        )
    }

    @Test
    fun `decode tolerates an empty or missing value`() {
        assertEquals(emptyList<String>(), LockScreenShortcuts.decode(null))
        assertEquals(emptyList<String>(), LockScreenShortcuts.decode(""))
        assertEquals(listOf("com.a", "com.b"), LockScreenShortcuts.decode("com.a\n\ncom.b\n"))
    }

    @Test
    fun `round trip preserves order`() {
        val packages = listOf("com.z", "com.a", "com.m")
        assertEquals(packages, LockScreenShortcuts.decode(LockScreenShortcuts.encode(packages)))
    }

    @Test
    fun `resolve drops uninstalled apps but keeps the saved order`() {
        assertEquals(
            listOf("com.z", "com.m"),
            LockScreenShortcuts.resolve(
                listOf("com.z", "com.gone", "com.m"),
                listOf("com.a", "com.m", "com.z")
            )
        )
    }
}
